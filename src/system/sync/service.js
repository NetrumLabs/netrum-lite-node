#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import os from 'os';
import diskusage from 'diskusage';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const API_BASE_URL = 'https://node.netrumlabs.dev';
const SYNC_ENDPOINT = '/metrics/sync';
const TOKEN_PATH = path.resolve(__dirname, '../mining/miningtoken.txt');
const SPEED_FILE = path.resolve(__dirname, '../system/speedtest.txt');
const BASE_SYNC_INTERVAL = 62000; 
const SYNC_BUFFER = 3000; // Extra buffer for safety

// State management
let isSyncing = false;
let syncTimeout = null;
let consecutiveErrors = 0;
const MAX_CONSECUTIVE_ERRORS = 5;

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 45000, // 45 seconds timeout
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  }
});

const log = (msg, type = 'info') => {
  const timestamp = new Date().toISOString();
  const level = type.toUpperCase();
  console.log(`[${timestamp}] [${level}] ${msg}`);
};

// ✅ File se latest speed data read
const getSpeedFromFile = () => {
  try {
    if (fs.existsSync(SPEED_FILE)) {
      const speedData = fs.readFileSync(SPEED_FILE, 'utf8').trim();
      const [download, upload] = speedData.split(' ').map(parseFloat);
      
      if (!isNaN(download) && !isNaN(upload) && download > 0 && upload > 0) {
        log(`📊 Speed file read: ${download}↓/${upload}↑ Mbps`, 'debug');
        return { download, upload };
      }
    }
  } catch (err) {
    log(`Speed file read error: ${err.message}`, 'warn');
  }
  
  // Fallback to minimum speeds
  log('⚠️ Using minimum speeds', 'warn');
  return { download: 1, upload: 0.1 };
};

const getSystemMetrics = () => {
  try {
    const { download, upload } = getSpeedFromFile();
    
    // Get memory stats
    const totalMemBytes = os.totalmem();
    const freeMemBytes = os.freemem();
    const totalMemGB = Math.round(totalMemBytes / (1024 ** 3));
    const freeMemGB = Math.round(freeMemBytes / (1024 ** 3));
    
    // Get disk stats
    const diskInfo = diskusage.checkSync('/');
    const totalDiskGB = Math.round(diskInfo.total / (1024 ** 3));
    const freeDiskGB = Math.round(diskInfo.free / (1024 ** 3));
    const usedDiskGB = totalDiskGB - freeDiskGB;
    
    // Get CPU info
    const cpus = os.cpus();
    const cpuModel = cpus[0]?.model || 'Unknown';
    const cpuSpeed = cpus[0]?.speed || 0;
    
    log(`💻 System: ${cpus.length} cores, ${totalMemGB}GB RAM (${freeMemGB}GB free), ${totalDiskGB}GB Disk (${freeDiskGB}GB free)`, 'debug');
    log(`🌐 Network: ${download}↓/${upload}↑ Mbps`, 'debug');
    
    return {
      cpu: cpus.length,
      ram: Math.round(totalMemBytes / (1024 ** 2)), // MB में
      disk: freeDiskGB,
      speed: download,
      uploadSpeed: upload,
      lastSeen: Math.floor(Date.now() / 1000),
      systemPermission: true,
      // Additional metrics for debugging
      _details: {
        cpuModel,
        cpuSpeedMHz: cpuSpeed,
        totalMemoryGB: totalMemGB,
        freeMemoryGB: freeMemGB,
        totalDiskGB,
        usedDiskGB
      }
    };
  } catch (err) {
    log(`❌ Metrics error: ${err.message}`, 'error');
    return null;
  }
};

const saveToken = (token) => {
  try {
    const dir = path.dirname(TOKEN_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      log(`📁 Created directory: ${dir}`);
    }
    
    fs.writeFileSync(TOKEN_PATH, token);
    log(`✅ Mining token saved to ${TOKEN_PATH}`);
    
    // Verify the token was saved
    if (fs.existsSync(TOKEN_PATH)) {
      const savedToken = fs.readFileSync(TOKEN_PATH, 'utf8').trim();
      if (savedToken === token) {
        log(`🔐 Token verified (${savedToken.length} chars)`);
      }
    }
  } catch (err) {
    log(`❌ Token save failed: ${err.message}`, 'error');
  }
};

const readNodeId = () => {
  const possiblePaths = [
    '/root/netrum-lite-node/src/identity/node-id/id.txt',
    path.resolve(__dirname, '../identity/node-id/id.txt'),
    path.resolve(__dirname, '../../identity/node-id/id.txt')
  ];
  
  for (const nodeIdPath of possiblePaths) {
    try {
      if (fs.existsSync(nodeIdPath)) {
        const nodeId = fs.readFileSync(nodeIdPath, 'utf8').trim();
        if (nodeId && nodeId.length > 0) {
          log(`📄 Node ID read from: ${nodeIdPath}`, 'debug');
          return nodeId;
        }
      }
    } catch (err) {
      // Continue to next path
    }
  }
  
  log(`❌ Node ID not found in any path: ${possiblePaths.join(', ')}`, 'error');
  return null;
};

const calculateNextSyncDelay = (serverNextSyncAllowed) => {
  const now = Date.now();
  
  if (!serverNextSyncAllowed || serverNextSyncAllowed <= now) {
    return BASE_SYNC_INTERVAL;
  }
  
  const baseDelay = serverNextSyncAllowed - now;
  
  const minDelay = 60000; // 60 seconds
  const maxDelay = 120000; // 120 seconds
  
  // Add buffer for network delays
  const bufferedDelay = Math.max(minDelay, Math.min(maxDelay, baseDelay + SYNC_BUFFER));
  
  log(`⏰ Server says next sync at: ${new Date(serverNextSyncAllowed).toISOString()}`, 'debug');
  log(`⏰ Calculated delay: ${Math.round(bufferedDelay/1000)}s (base: ${Math.round(baseDelay/1000)}s + buffer: ${Math.round(SYNC_BUFFER/1000)}s)`, 'debug');
  
  return bufferedDelay;
};

const syncNode = async () => {
  if (isSyncing) {
    log('⏳ Sync already in progress, skipping...');
    return { success: false, reason: 'already_syncing' };
  }

  isSyncing = true;
  let nextSyncDelay = BASE_SYNC_INTERVAL;
  let syncResult = { success: false };
  
  try {
    const nodeId = readNodeId();
    if (!nodeId) {
      throw new Error('Empty node ID');
    }

    log(`🔍 Node ID: ${nodeId}`);
    
    const metrics = getSystemMetrics();
    if (!metrics) {
      throw new Error('Failed to get metrics');
    }

    // Debug logging - Server requirements vs actual
    log(`📊 Server Requirements: CPU: 2+ cores, RAM: 4GB (4096MB), Disk: 50GB, Speed: 5+ Mbps`);
    log(`📊 Actual Metrics: CPU: ${metrics.cpu} cores, RAM: ${metrics.ram}MB (${Math.round(metrics.ram/1024)}GB), Disk: ${metrics.disk}GB, Speed: ${metrics.speed}↓/${metrics.uploadSpeed}↑ Mbps`);

    const isActive = (
      metrics.cpu >= 2 &&
      metrics.ram >= 4096 &&  // 4GB in MB
      metrics.disk >= 50 &&
      metrics.speed >= 5 &&
      metrics.uploadSpeed >= 5
    );

    log(`📈 System Status: ${isActive ? 'ACTIVE ✅' : 'INACTIVE ⚠️'}`);

    const payload = {
      nodeId,
      nodeMetrics: metrics,
      syncStatus: isActive ? 'Active' : 'InActive',
      systemPermission: true
    };

    log(`📤 Sending metrics to server...`, 'debug');
    const startTime = Date.now();
    
    const response = await api.post(SYNC_ENDPOINT, payload);
    const endTime = Date.now();
    const responseTime = endTime - startTime;
    
    log(`📥 Server response in ${responseTime}ms`, 'debug');

    if (response.data) {
      if (response.data.success === true) {
        log(`✅ Sync successful | Status: ${response.data.syncStatus} | Time: ${responseTime}ms`);
        consecutiveErrors = 0; // Reset error counter
        
        if (response.data.miningToken) {
          saveToken(response.data.miningToken);
          log('💰 Mining token received and saved');
        } else {
          log('⚠️ No mining token received - may not meet requirements', 'warn');
        }
        
        if (response.data.log) {
          log(`💬 Server: ${response.data.log}`);
        }
        
        // Calculate next sync timing based on server response
        if (response.data.nextSyncAllowed) {
          nextSyncDelay = calculateNextSyncDelay(response.data.nextSyncAllowed);
          log(`⏰ Next sync in ${Math.round(nextSyncDelay/1000)} seconds`);
        }
        
        syncResult = { 
          success: true, 
          nextSyncDelay,
          syncStatus: response.data.syncStatus,
          hasToken: !!response.data.miningToken
        };
        
      } else {
        log(`❌ API returned success: false | Error: ${response.data.error || 'Unknown error'}`, 'warn');
        consecutiveErrors++;
        syncResult = { success: false, reason: 'api_error', error: response.data.error };
      }
    } else {
      log('❌ Empty response from API', 'error');
      consecutiveErrors++;
      syncResult = { success: false, reason: 'empty_response' };
    }

  } catch (err) {
    // ENHANCED ERROR HANDLING
    if (err.response) {
      const status = err.response.status;
      const data = err.response.data;
      
      log(`❌ API Error ${status}: ${JSON.stringify(data)}`, 'error');
      consecutiveErrors++;
      
      if (status === 400) {
        log('🔍 Bad request - check node ID format', 'error');
        syncResult = { success: false, reason: 'bad_request', status };
      } else if (status === 403) {
        log('🚫 System permission denied', 'error');
        syncResult = { success: false, reason: 'permission_denied', status };
      } else if (status === 404) {
        log('🔍 Node not registered', 'error');
        syncResult = { success: false, reason: 'not_found', status };
      } else if (status === 429) {
        // Rate limit handling
        let waitTime = 60000; // Default 60 seconds
        
        if (data?.detail?.nextSyncAllowed) {
          nextSyncDelay = calculateNextSyncDelay(data.detail.nextSyncAllowed);
          log(`⏰ Rate limited - waiting ${Math.round(nextSyncDelay/1000)} seconds`, 'warn');
        } else {
          // Exponential backoff for rate limiting
          const backoffFactor = Math.min(5, consecutiveErrors);
          nextSyncDelay = BASE_SYNC_INTERVAL * (1 + (backoffFactor * 0.5));
          log(`⏰ Rate limited (no server time) - waiting ${Math.round(nextSyncDelay/1000)} seconds`, 'warn');
        }
        
        syncResult = { 
          success: false, 
          reason: 'rate_limited', 
          status,
          nextSyncDelay,
          waitSeconds: Math.round(nextSyncDelay/1000)
        };
        
      } else if (status >= 500) {
        // Server error - use exponential backoff
        const backoffFactor = Math.min(10, consecutiveErrors);
        nextSyncDelay = BASE_SYNC_INTERVAL * (1 + (backoffFactor * 0.3));
        log(`🔧 Server error - backing off to ${Math.round(nextSyncDelay/1000)} seconds`, 'warn');
        syncResult = { success: false, reason: 'server_error', status, nextSyncDelay };
      }
    } else if (err.code === 'ECONNABORTED') {
      log(`⏱️ Request timeout (${api.defaults.timeout}ms)`, 'error');
      consecutiveErrors++;
      syncResult = { success: false, reason: 'timeout', code: err.code };
    } else if (err.request) {
      log('🌐 Network error - no response from server', 'error');
      consecutiveErrors++;
      
      // Network error - exponential backoff
      const backoffFactor = Math.min(8, consecutiveErrors);
      nextSyncDelay = BASE_SYNC_INTERVAL * (1 + (backoffFactor * 0.4));
      log(`🌐 Network issue - backing off to ${Math.round(nextSyncDelay/1000)} seconds`, 'warn');
      
      syncResult = { success: false, reason: 'network_error', nextSyncDelay };
    } else {
      log(`💥 Unexpected error: ${err.message}`, 'error');
      consecutiveErrors++;
      syncResult = { success: false, reason: 'unexpected_error', message: err.message };
    }
  } finally {
    isSyncing = false;
    
    // Log error streak if high
    if (consecutiveErrors >= 3) {
      log(`⚠️ ${consecutiveErrors} consecutive errors`, 'warn');
    }
    
    if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
      log(`🚨 ${MAX_CONSECUTIVE_ERRORS}+ consecutive errors - check network/server`, 'error');
    }
    
    return { ...syncResult, nextSyncDelay, consecutiveErrors };
  }
};

const scheduleNextSync = (customDelay = null) => {
  if (syncTimeout) {
    clearTimeout(syncTimeout);
    syncTimeout = null;
  }
  
  const delay = customDelay || BASE_SYNC_INTERVAL;
  
  if (delay > 300000) {
    log(`⏰ Long delay scheduled: ${Math.round(delay/1000)} seconds`, 'warn');
  }
  
  syncTimeout = setTimeout(async () => {
    log(`🔄 Starting scheduled sync...`, 'debug');
    const result = await syncNode();
    
    // Schedule next sync based on result
    let nextDelay = BASE_SYNC_INTERVAL;
    
    if (result.nextSyncDelay && result.nextSyncDelay > 0) {
      nextDelay = result.nextSyncDelay;
    } else if (!result.success && result.reason === 'rate_limited') {
      nextDelay = Math.min(120000, nextDelay * 1.2);
    } else if (!result.success) {
      const backoffFactor = Math.min(5, consecutiveErrors);
      nextDelay = Math.min(300000, BASE_SYNC_INTERVAL * (1 + (backoffFactor * 0.5)));
    }
    
    // Ensure minimum delay
    nextDelay = Math.max(30000, nextDelay); // Minimum 30 seconds
    
    scheduleNextSync(nextDelay);
  }, delay);
  
  const nextSyncTime = new Date(Date.now() + delay);
  log(`📅 Next sync scheduled at: ${nextSyncTime.toISOString()} (in ${Math.round(delay/1000)}s)`, 'debug');
};

const startService = () => {
  log('🚀 Starting Netrum Node Sync Service');
  log(`📊 Base sync interval: ${BASE_SYNC_INTERVAL/1000} seconds`);
  log(`📁 Token path: ${TOKEN_PATH}`);
  log(`📁 Speed file: ${SPEED_FILE}`);
  log(`🛡️ Sync buffer: ${SYNC_BUFFER/1000} seconds`);
  
  // Check for required files
  if (!fs.existsSync(SPEED_FILE)) {
    log(`⚠️ Speed file not found: ${SPEED_FILE}`, 'warn');
    log('⚠️ Using minimum speed values', 'warn');
  }
  
  const nodeId = readNodeId();
  if (!nodeId) {
    log('❌ CRITICAL: Node ID not found. Service may not work correctly.', 'error');
  } else {
    log(`✅ Node ID loaded: ${nodeId}`);
  }
  
  // Health monitoring for speed
  setInterval(() => {
    try {
      const { download, upload } = getSpeedFromFile();
      log(`📈 Current speed: ${download}↓/${upload}↑ Mbps`, 'debug');
    } catch (err) {
      // Silent fail for health check
    }
  }, 30000); // Every 30 seconds
  
  // Initial sync after 10 seconds
  setTimeout(async () => {
    log('🔄 Starting initial sync...');
    const result = await syncNode();
    
    // Calculate delay for next sync
    let initialDelay = BASE_SYNC_INTERVAL;
    if (result.nextSyncDelay && result.nextSyncDelay > 0) {
      initialDelay = result.nextSyncDelay;
    }
    
    log(`🎯 Initial sync completed. Next sync in ${Math.round(initialDelay/1000)}s`);
    scheduleNextSync(initialDelay);
  }, 10000);
  
  // Graceful shutdown
  process.on('SIGTERM', () => {
    log('🛑 SIGTERM received - shutting down gracefully...');
    if (syncTimeout) clearTimeout(syncTimeout);
    log('✅ Service shutdown complete');
    process.exit(0);
  });

  process.on('SIGINT', () => {
    log('🛑 SIGINT received - shutting down gracefully...');
    if (syncTimeout) clearTimeout(syncTimeout);
    log('✅ Service shutdown complete');
    process.exit(0);
  });
  
  // Uncaught exception handling
  process.on('uncaughtException', (error) => {
    log(`💥 Uncaught Exception: ${error.message}`, 'error');
    log(`Stack: ${error.stack}`, 'error');
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    log(`💥 Unhandled Rejection at: ${promise}, reason: ${reason}`, 'error');
  });
};

// ✅ Start the service
try {
  startService();
  log('✅ Service started successfully');
} catch (error) {
  log(`💥 Failed to start service: ${error.message}`, 'error');
  process.exit(1);
}
