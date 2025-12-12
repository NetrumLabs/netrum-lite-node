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
const BASE_SYNC_INTERVAL = 62000; // 62 seconds
const SYNC_BUFFER = 3000; // 3 seconds buffer

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

const getSpeedFromFile = () => {
  try {
    if (fs.existsSync(SPEED_FILE)) {
      const speedData = fs.readFileSync(SPEED_FILE, 'utf8').trim();
      const [download, upload] = speedData.split(' ').map(parseFloat);
      
      if (!isNaN(download) && !isNaN(upload) && download > 0 && upload > 0) {
        return { download, upload };
      }
    }
  } catch (err) {
    log(`Speed file read error: ${err.message}`, 'warn');
  }
  
  return { download: 1, upload: 0.1 };
};

const getSystemMetrics = () => {
  try {
    const { download, upload } = getSpeedFromFile();
    
    const totalMemBytes = os.totalmem();
    const freeDiskGB = Math.round(diskusage.checkSync('/').free / (1024 ** 3));
    
    return {
      cpu: os.cpus().length,
      ram: Math.round(totalMemBytes / (1024 ** 2)),
      disk: freeDiskGB,
      speed: download,
      uploadSpeed: upload,
      lastSeen: Math.floor(Date.now() / 1000),
      systemPermission: true
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
    }
    
    fs.writeFileSync(TOKEN_PATH, token);
    log(`✅ Mining token saved to ${TOKEN_PATH}`, 'success');
    
    // Verify token
    if (fs.existsSync(TOKEN_PATH)) {
      const savedToken = fs.readFileSync(TOKEN_PATH, 'utf8').trim();
      const tokenPreview = savedToken.length > 50 
        ? savedToken.substring(0, 50) + '...' 
        : savedToken;
      log(`🔐 Token saved successfully (${savedToken.length} chars): ${tokenPreview}`);
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
          return nodeId;
        }
      }
    } catch (err) {
      // Continue
    }
  }
  
  log(`❌ Node ID not found`, 'error');
  return null;
};

const calculateNextSyncDelay = (serverNextSyncAllowed) => {
  const now = Date.now();
  
  if (!serverNextSyncAllowed || serverNextSyncAllowed <= now) {
    return BASE_SYNC_INTERVAL;
  }
  
  const baseDelay = serverNextSyncAllowed - now;
  
  // FIXED: Minimum delay को 5 seconds करें (60 seconds नहीं)
  const minDelay = 5000; // 5 seconds minimum
  const maxDelay = 120000; // 120 seconds maximum
  
  const bufferedDelay = Math.max(minDelay, Math.min(maxDelay, baseDelay + SYNC_BUFFER));
  
  log(`⏰ Server next sync: ${new Date(serverNextSyncAllowed).toISOString()}`, 'debug');
  log(`⏰ Delay: ${Math.round(bufferedDelay/1000)}s (base: ${Math.round(baseDelay/1000)}s, buffer: ${Math.round(SYNC_BUFFER/1000)}s)`, 'debug');
  
  return bufferedDelay;
};

const syncNode = async () => {
  if (isSyncing) {
    log('⏳ Sync already in progress', 'debug');
    return { success: false, reason: 'already_syncing' };
  }

  isSyncing = true;
  let nextSyncDelay = BASE_SYNC_INTERVAL;
  
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

    log(`📊 Requirements: CPU: 2+ cores, RAM: 4GB, Disk: 50GB, Speed: 5+ Mbps`);
    log(`📊 Actual: CPU: ${metrics.cpu} cores, RAM: ${Math.round(metrics.ram/1024)}GB, Disk: ${metrics.disk}GB, Speed: ${metrics.speed}↓/${metrics.uploadSpeed}↑ Mbps`);

    const isActive = (
      metrics.cpu >= 2 &&
      metrics.ram >= 4096 &&
      metrics.disk >= 50 &&
      metrics.speed >= 5 &&
      metrics.uploadSpeed >= 5
    );

    log(`📈 Status: ${isActive ? 'ACTIVE ✅' : 'INACTIVE ⚠️'}`);

    const payload = {
      nodeId,
      nodeMetrics: metrics,
      syncStatus: isActive ? 'Active' : 'InActive',
      systemPermission: true
    };

    log(`📤 Sending to server...`, 'debug');
    const startTime = Date.now();
    
    const response = await api.post(SYNC_ENDPOINT, payload);
    const responseTime = Date.now() - startTime;
    
    log(`📥 Response in ${responseTime}ms`, 'debug');

    if (response.data && response.data.success === true) {
      log(`✅ Sync successful | Status: ${response.data.syncStatus}`, 'success');
      consecutiveErrors = 0;
      
      if (response.data.miningToken) {
        saveToken(response.data.miningToken);
        log('💰 MINING TOKEN RECEIVED!', 'success');
      } else {
        log('⚠️ No mining token received', 'warn');
        
        // Token नहीं मिलने का reason लॉग करें
        if (response.data.details && response.data.details.requirementsCheck) {
          const failed = [];
          const checks = response.data.details.requirementsCheck;
          for (const [key, check] of Object.entries(checks)) {
            if (!check.ok) {
              failed.push(`${key}: ${check.actual} < ${check.required}`);
            }
          }
          if (failed.length > 0) {
            log(`❌ Requirements failed: ${failed.join(', ')}`, 'warn');
          }
        }
      }
      
      if (response.data.log) {
        log(`💬 Server: ${response.data.log}`);
      }
      
      // Calculate next sync
      if (response.data.nextSyncAllowed) {
        nextSyncDelay = calculateNextSyncDelay(response.data.nextSyncAllowed);
        log(`⏰ Next sync in ${Math.round(nextSyncDelay/1000)}s`);
      }
      
      return { 
        success: true, 
        nextSyncDelay,
        syncStatus: response.data.syncStatus,
        hasToken: !!response.data.miningToken,
        requirementsMet: response.data.requirementsMet
      };
      
    } else {
      log(`❌ API error: ${response.data?.error || 'Unknown'}`, 'error');
      consecutiveErrors++;
      return { success: false, reason: 'api_error' };
    }

  } catch (err) {
    if (err.response) {
      const status = err.response.status;
      const data = err.response.data;
      
      if (status === 429) {
        // Rate limiting
        log(`⏰ Rate limited: ${data?.error || 'Too many requests'}`, 'warn');
        
        if (data?.detail?.nextSyncAllowed) {
          nextSyncDelay = calculateNextSyncDelay(data.detail.nextSyncAllowed);
          log(`⏰ Waiting ${Math.round(nextSyncDelay/1000)}s as per server`, 'warn');
        } else {
          nextSyncDelay = Math.min(120000, BASE_SYNC_INTERVAL * Math.pow(1.5, Math.min(3, consecutiveErrors)));
        }
        
        consecutiveErrors++;
        return { 
          success: false, 
          reason: 'rate_limited', 
          nextSyncDelay,
          waitSeconds: Math.round(nextSyncDelay/1000)
        };
        
      } else if (status === 400) {
        log(`❌ Bad request: ${JSON.stringify(data)}`, 'error');
      } else if (status === 403) {
        log(`❌ Permission denied`, 'error');
      } else if (status === 404) {
        log(`❌ Node not found`, 'error');
      } else {
        log(`❌ Server error ${status}: ${JSON.stringify(data)}`, 'error');
      }
    } else if (err.code === 'ECONNABORTED') {
      log(`⏱️ Request timeout`, 'error');
      nextSyncDelay = Math.min(120000, BASE_SYNC_INTERVAL * Math.pow(1.5, Math.min(3, consecutiveErrors)));
      consecutiveErrors++;
      return { success: false, reason: 'timeout', nextSyncDelay };
    } else if (err.request) {
      log('🌐 Network error - no response', 'error');
      nextSyncDelay = Math.min(120000, BASE_SYNC_INTERVAL * Math.pow(1.5, Math.min(3, consecutiveErrors)));
      consecutiveErrors++;
      return { success: false, reason: 'network_error', nextSyncDelay };
    } else {
      log(`💥 Error: ${err.message}`, 'error');
      consecutiveErrors++;
      return { success: false, reason: 'unknown_error' };
    }
  } finally {
    isSyncing = false;
    
    if (consecutiveErrors >= 3) {
      log(`⚠️ ${consecutiveErrors} consecutive errors`, 'warn');
    }
  }
};

const scheduleNextSync = (customDelay = null) => {
  if (syncTimeout) {
    clearTimeout(syncTimeout);
  }
  
  const delay = customDelay || BASE_SYNC_INTERVAL;
  syncTimeout = setTimeout(async () => {
    log(`🔄 Starting sync...`, 'debug');
    const result = await syncNode();
    
    let nextDelay = BASE_SYNC_INTERVAL;
    if (result.nextSyncDelay && result.nextSyncDelay > 0) {
      nextDelay = result.nextSyncDelay;
    } else if (!result.success) {
      nextDelay = Math.min(120000, BASE_SYNC_INTERVAL * Math.pow(1.5, Math.min(3, consecutiveErrors)));
    }
    
    scheduleNextSync(nextDelay);
  }, delay);
  
  const nextTime = new Date(Date.now() + delay);
  log(`📅 Next sync at: ${nextTime.toISOString()} (in ${Math.round(delay/1000)}s)`, 'debug');
};

const startService = () => {
  log('🚀 Starting Netrum Node Sync Service');
  log(`⏰ Base interval: ${BASE_SYNC_INTERVAL/1000}s`);
  log(`🛡️ Buffer: ${SYNC_BUFFER/1000}s`);
  
  const nodeId = readNodeId();
  if (!nodeId) {
    log('❌ Node ID not found', 'error');
  } else {
    log(`✅ Node ID: ${nodeId}`);
  }
  
  // Check token file
  if (fs.existsSync(TOKEN_PATH)) {
    try {
      const existingToken = fs.readFileSync(TOKEN_PATH, 'utf8').trim();
      if (existingToken) {
        log(`🔐 Existing token found (${existingToken.length} chars)`);
      }
    } catch (err) {
      // Ignore
    }
  } else {
    log(`📁 Token file not found, will be created`);
  }
  
  // Health check
  setInterval(() => {
    try {
      const { download, upload } = getSpeedFromFile();
      log(`📈 Speed: ${download}↓/${upload}↑ Mbps`, 'debug');
    } catch (err) {
      // Silent
    }
  }, 30000);
  
  // Initial sync
  setTimeout(async () => {
    log('🔄 Starting initial sync...');
    const result = await syncNode();
    
    let initialDelay = BASE_SYNC_INTERVAL;
    if (result.nextSyncDelay && result.nextSyncDelay > 0) {
      initialDelay = result.nextSyncDelay;
    }
    
    log(`🎯 Initial sync complete. Next in ${Math.round(initialDelay/1000)}s`);
    scheduleNextSync(initialDelay);
  }, 10000);
  
  // Graceful shutdown
  process.on('SIGTERM', () => {
    log('🛑 Shutting down...');
    if (syncTimeout) clearTimeout(syncTimeout);
    process.exit(0);
  });

  process.on('SIGINT', () => {
    log('🛑 Shutting down...');
    if (syncTimeout) clearTimeout(syncTimeout);
    process.exit(0);
  });
};

// Start
try {
  startService();
} catch (error) {
  log(`💥 Startup error: ${error.message}`, 'error');
  process.exit(1);
}
