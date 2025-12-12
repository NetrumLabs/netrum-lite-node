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
    
    // Show token preview
    const tokenPreview = token.length > 50 
      ? token.substring(0, 50) + '...' 
      : token;
    
    log(`🔐 Token saved: ${tokenPreview}`, 'success');
    log(`📏 Token length: ${token.length} characters`, 'success');
    
  } catch (err) {
    log(`❌ Token save failed: ${err.message}`, 'error');
  }
};

const checkExistingToken = () => {
  try {
    if (fs.existsSync(TOKEN_PATH)) {
      const token = fs.readFileSync(TOKEN_PATH, 'utf8').trim();
      if (token) {
        const stats = fs.statSync(TOKEN_PATH);
        const age = Date.now() - stats.mtimeMs;
        const ageHours = Math.floor(age / (1000 * 60 * 60));
        const ageMinutes = Math.floor((age % (1000 * 60 * 60)) / (1000 * 60));
        
        let status = '✅';
        if (ageHours >= 24) status = '⚠️';
        if (ageHours >= 48) status = '❌';
        
        log(`${status} Existing token found: ${token.length} chars, ${ageHours}h ${ageMinutes}m old`, 'info');
        return { exists: true, ageHours, ageMinutes, length: token.length };
      }
    }
  } catch (err) {
    // Silent error
  }
  return { exists: false };
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
  
  // Minimum 5 seconds और maximum 120 seconds
  const minDelay = 5000; // 5 seconds minimum
  const maxDelay = 120000; // 120 seconds maximum
  
  const bufferedDelay = Math.max(minDelay, Math.min(maxDelay, baseDelay + SYNC_BUFFER));
  
  log(`⏰ Server next sync: ${new Date(serverNextSyncAllowed).toISOString()}`, 'debug');
  log(`⏰ Delay calculated: ${Math.round(bufferedDelay/1000)}s`, 'debug');
  
  return bufferedDelay;
};

const analyzeServerResponse = (response) => {
  log(`📊 SERVER RESPONSE ANALYSIS:`, 'debug');
  log(`   ✅ Success: ${response.data?.success || false}`, 'debug');
  log(`   🔄 Updated: ${response.data?.updated || false}`, 'debug');
  log(`   🏷️ Sync Status: ${response.data?.syncStatus || 'Unknown'}`, 'debug');
  log(`   🔐 Mining Token: ${response.data?.miningToken ? 'PRESENT ✅' : 'ABSENT ❌'}`, 'debug');
  log(`   📝 Server Log: ${response.data?.log || 'No log'}`, 'debug');
  log(`   ⏰ Next Sync Time: ${response.data?.nextSyncAllowed ? new Date(response.data.nextSyncAllowed).toISOString() : 'Not specified'}`, 'debug');
  log(`   ✔️ Requirements Met: ${response.data?.requirementsMet !== undefined ? response.data.requirementsMet : 'Unknown'}`, 'debug');
  
  // Show requirements details if available
  if (response.data?.details?.requirementsCheck) {
    log(`   📋 Requirements Details:`, 'debug');
    const checks = response.data.details.requirementsCheck;
    for (const [key, check] of Object.entries(checks)) {
      const status = check.ok ? '✅' : '❌';
      log(`     ${status} ${key}: ${check.actual} vs ${check.required}`, 'debug');
    }
  }
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

    log(`📤 Sending metrics to server...`, 'debug');
    const startTime = Date.now();
    
    const response = await api.post(SYNC_ENDPOINT, payload);
    const responseTime = Date.now() - startTime;
    
    log(`📥 Server response time: ${responseTime}ms`, 'debug');
    
    // 🔍 Analyze server response
    analyzeServerResponse(response);

    if (response.data && response.data.success === true) {
      log(`✅✅✅ SYNC SUCCESSFUL! ✅✅✅`, 'success');
      log(`   Status: ${response.data.syncStatus}`, 'success');
      consecutiveErrors = 0;
      
      // 🔥 MINING TOKEN HANDLING
      if (response.data.miningToken) {
        saveToken(response.data.miningToken);
        log(`💰💰💰💰💰💰💰💰💰💰💰💰💰💰💰💰💰💰💰💰💰💰💰💰💰💰💰💰`, 'success');
        log(`💰               MINING TOKEN RECEIVED!               💰`, 'success');
        log(`💰💰💰💰💰💰💰💰💰💰💰💰💰💰💰💰💰💰💰💰💰💰💰💰💰💰💰💰`, 'success');
      } else {
        log(`⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️`, 'warn');
        log(`⚠️            NO MINING TOKEN RECEIVED            ⚠️`, 'warn');
        log(`⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️`, 'warn');
        
        // Check why no token
        if (response.data.requirementsMet === false) {
          log(`❌ REASON: Requirements not met`, 'warn');
          
          if (response.data.details?.requirementsCheck) {
            const checks = response.data.details.requirementsCheck;
            const failed = [];
            
            for (const [key, check] of Object.entries(checks)) {
              if (!check.ok) {
                failed.push(`${key}: ${check.actual} < ${check.required}`);
              }
            }
            
            if (failed.length > 0) {
              log(`❌ Failed requirements: ${failed.join(', ')}`, 'warn');
            }
          }
        } else if (response.data.requirementsMet === true) {
          log(`❓ REASON: Requirements met but no token (server decision)`, 'warn');
        }
      }
      
      // Server log message
      if (response.data.log) {
        log(`💬 Server message: ${response.data.log}`);
      }
      
      // Calculate next sync
      if (response.data.nextSyncAllowed) {
        nextSyncDelay = calculateNextSyncDelay(response.data.nextSyncAllowed);
        const nextSyncTime = new Date(Date.now() + nextSyncDelay);
        log(`⏰ Next sync scheduled: ${nextSyncTime.toISOString()} (in ${Math.round(nextSyncDelay/1000)}s)`);
      }
      
      return { 
        success: true, 
        nextSyncDelay,
        syncStatus: response.data.syncStatus,
        hasToken: !!response.data.miningToken,
        requirementsMet: response.data.requirementsMet
      };
      
    } else {
      const errorMsg = response.data?.error || response.data?.detail?.error || 'Unknown API error';
      log(`❌ API returned error: ${errorMsg}`, 'error');
      consecutiveErrors++;
      return { success: false, reason: 'api_error', error: errorMsg };
    }

  } catch (err) {
    if (err.response) {
      const status = err.response.status;
      const data = err.response.data;
      
      if (status === 429) {
        // Rate limiting
        const errorMsg = data?.detail?.error || data?.error || 'Rate limited';
        log(`⏰⏰⏰ RATE LIMITED: ${errorMsg} ⏰⏰⏰`, 'warn');
        
        if (data?.detail?.nextSyncAllowed) {
          nextSyncDelay = calculateNextSyncDelay(data.detail.nextSyncAllowed);
          log(`⏰ Server says wait ${Math.round(nextSyncDelay/1000)} seconds`, 'warn');
        } else {
          nextSyncDelay = Math.min(120000, BASE_SYNC_INTERVAL * Math.pow(1.5, Math.min(3, consecutiveErrors)));
          log(`⏰ Using calculated delay: ${Math.round(nextSyncDelay/1000)}s`, 'warn');
        }
        
        consecutiveErrors++;
        return { 
          success: false, 
          reason: 'rate_limited', 
          nextSyncDelay,
          waitSeconds: Math.round(nextSyncDelay/1000)
        };
        
      } else if (status === 400) {
        log(`❌❌❌ BAD REQUEST (400) ❌❌❌`, 'error');
        log(`   Details: ${JSON.stringify(data)}`, 'error');
      } else if (status === 403) {
        log(`❌❌❌ PERMISSION DENIED (403) ❌❌❌`, 'error');
      } else if (status === 404) {
        log(`❌❌❌ NODE NOT FOUND (404) ❌❌❌`, 'error');
      } else if (status >= 500) {
        log(`💥💥💥 SERVER ERROR ${status} 💥💥💥`, 'error');
      } else {
        log(`❌ HTTP Error ${status}: ${JSON.stringify(data)}`, 'error');
      }
      
      consecutiveErrors++;
      return { success: false, reason: `http_${status}` };
      
    } else if (err.code === 'ECONNABORTED') {
      log(`⏱️⏱️⏱️ REQUEST TIMEOUT (${api.defaults.timeout}ms) ⏱️⏱️⏱️`, 'error');
      nextSyncDelay = Math.min(120000, BASE_SYNC_INTERVAL * Math.pow(1.5, Math.min(3, consecutiveErrors)));
      consecutiveErrors++;
      return { success: false, reason: 'timeout', nextSyncDelay };
      
    } else if (err.request) {
      log('🌐🌐🌐 NETWORK ERROR - NO RESPONSE FROM SERVER 🌐🌐🌐', 'error');
      nextSyncDelay = Math.min(120000, BASE_SYNC_INTERVAL * Math.pow(1.5, Math.min(3, consecutiveErrors)));
      consecutiveErrors++;
      return { success: false, reason: 'network_error', nextSyncDelay };
      
    } else {
      log(`💥💥💥 UNEXPECTED ERROR: ${err.message} 💥💥💥`, 'error');
      consecutiveErrors++;
      return { success: false, reason: 'unknown_error' };
    }
  } finally {
    isSyncing = false;
    
    if (consecutiveErrors >= 3) {
      log(`⚠️ WARNING: ${consecutiveErrors} consecutive errors`, 'warn');
    }
  }
};

const scheduleNextSync = (customDelay = null) => {
  if (syncTimeout) {
    clearTimeout(syncTimeout);
    syncTimeout = null;
  }
  
  const delay = customDelay || BASE_SYNC_INTERVAL;
  
  syncTimeout = setTimeout(async () => {
    log(`🔄 Starting sync cycle...`, 'debug');
    const result = await syncNode();
    
    let nextDelay = BASE_SYNC_INTERVAL;
    if (result.nextSyncDelay && result.nextSyncDelay > 0) {
      nextDelay = result.nextSyncDelay;
    } else if (!result.success) {
      // Exponential backoff for errors
      const backoff = Math.min(5, consecutiveErrors);
      nextDelay = Math.min(120000, BASE_SYNC_INTERVAL * Math.pow(1.5, backoff));
    }
    
    // Ensure minimum delay
    nextDelay = Math.max(5000, nextDelay);
    
    scheduleNextSync(nextDelay);
  }, delay);
  
  const nextTime = new Date(Date.now() + delay);
  log(`📅 Next sync scheduled for: ${nextTime.toISOString()} (in ${Math.round(delay/1000)}s)`, 'debug');
};

const startService = () => {
  log('🚀🚀🚀 STARTING NETRUM NODE SYNC SERVICE 🚀🚀🚀', 'info');
  log(`⏰ Base sync interval: ${BASE_SYNC_INTERVAL/1000} seconds`, 'info');
  log(`🛡️ Sync buffer: ${SYNC_BUFFER/1000} seconds`, 'info');
  log(`📁 Token path: ${TOKEN_PATH}`, 'info');
  log(`📁 Speed file: ${SPEED_FILE}`, 'info');
  
  // Check existing token
  const tokenStatus = checkExistingToken();
  
  // Read node ID
  const nodeId = readNodeId();
  if (!nodeId) {
    log('❌ CRITICAL: Node ID not found!', 'error');
  } else {
    log(`✅ Node ID: ${nodeId}`, 'info');
  }
  
  // Speed file check
  if (!fs.existsSync(SPEED_FILE)) {
    log('⚠️ Speed file not found, using default values', 'warn');
  }
  
  // Health monitoring
  setInterval(() => {
    try {
      const { download, upload } = getSpeedFromFile();
      log(`📈 Current speed: ${download}↓/${upload}↑ Mbps`, 'debug');
    } catch (err) {
      // Silent
    }
  }, 30000);
  
  // Initial sync after 10 seconds
  setTimeout(async () => {
    log('🔄🔄🔄 STARTING INITIAL SYNC 🔄🔄🔄', 'info');
    const result = await syncNode();
    
    let initialDelay = BASE_SYNC_INTERVAL;
    if (result.nextSyncDelay && result.nextSyncDelay > 0) {
      initialDelay = result.nextSyncDelay;
    }
    
    log(`🎯 Initial sync completed. Next sync in ${Math.round(initialDelay/1000)}s`, 'info');
    scheduleNextSync(initialDelay);
  }, 10000);
  
  // Graceful shutdown
  process.on('SIGTERM', () => {
    log('🛑 SIGTERM received - shutting down gracefully...', 'info');
    if (syncTimeout) clearTimeout(syncTimeout);
    log('✅ Service shutdown complete', 'info');
    process.exit(0);
  });

  process.on('SIGINT', () => {
    log('🛑 SIGINT received - shutting down gracefully...', 'info');
    if (syncTimeout) clearTimeout(syncTimeout);
    log('✅ Service shutdown complete', 'info');
    process.exit(0);
  });
  
  // Error handling
  process.on('uncaughtException', (error) => {
    log(`💥 UNCAUGHT EXCEPTION: ${error.message}`, 'error');
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    log(`💥 UNHANDLED REJECTION: ${reason}`, 'error');
  });
};

// Start the service
try {
  startService();
  log('✅✅✅ SERVICE STARTED SUCCESSFULLY ✅✅✅', 'info');
} catch (error) {
  log(`💥 FAILED TO START SERVICE: ${error.message}`, 'error');
  process.exit(1);
}
