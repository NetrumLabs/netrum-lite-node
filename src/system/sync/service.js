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
const SYNC_INTERVAL = 60000; // 1 minute

let isSyncing = false;

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000, // Increased timeout
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  }
});

const log = (msg, type = 'info') => {
  console.log(`[${new Date().toISOString()}] [${type.toUpperCase()}] ${msg}`);
};

// ✅ File se latest speed data read kare (har baar fresh)
const getSpeedFromFile = () => {
  try {
    if (fs.existsSync(SPEED_FILE)) {
      const speedData = fs.readFileSync(SPEED_FILE, 'utf8').trim();
      const [download, upload] = speedData.split(' ').map(parseFloat);
      
      if (download && upload) {
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
    
    const totalMemGB = Math.round(os.totalmem() / (1024 ** 3)); // Convert to GB
    const freeDiskGB = Math.round(diskusage.checkSync('/').free / (1024 ** 3));
    
    return {
      cpu: os.cpus().length,
      ram: Math.round(os.totalmem() / (1024 ** 2)), // Keep as MB for server conversion
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
    fs.mkdirSync(path.dirname(TOKEN_PATH), { recursive: true });
    fs.writeFileSync(TOKEN_PATH, token);
    log('✅ Mining token saved');
  } catch (err) {
    log(`❌ Token save failed: ${err.message}`, 'error');
  }
};

const readNodeId = () => {
  try {
    return fs.readFileSync('/root/netrum-lite-node/src/identity/node-id/id.txt', 'utf8').trim();
  } catch (err) {
    log(`❌ Node ID read failed: ${err.message}`, 'error');
    return null;
  }
};

const syncNode = async () => {
  if (isSyncing) {
    log('⏳ Sync already in progress, skipping...');
    return;
  }

  isSyncing = true;
  
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

    log(`📈 System Status: ${isActive ? 'ACTIVE' : 'INACTIVE'}`);

    const payload = {
      nodeId,
      nodeMetrics: metrics,
      syncStatus: isActive ? 'Active' : 'InActive',
      systemPermission: true
    };

   // log(`📤 Sending payload to: ${API_BASE_URL}${SYNC_ENDPOINT}`);

    const response = await api.post(SYNC_ENDPOINT, payload);

    // COMPLETE RESPONSE ANALYSIS
   // log(`📥 Raw API Response: ${JSON.stringify(response.data)}`);

    if (response.data) {
      if (response.data.success === true) {
        log(`✅ Sync successful | Status: ${response.data.syncStatus}`);
        
        if (response.data.miningToken) {
          saveToken(response.data.miningToken);
          log('💰 Mining token received');
        } else {
          log('⚠️ No mining token received - may not meet requirements', 'warn');
        }
        
        if (response.data.log) {
      //    log(`💬 Server log: ${response.data.log}`);
        }
        
        // Next sync timing
        if (response.data.nextSyncAllowed) {
          const nextSync = Math.max(60000, response.data.nextSyncAllowed - Date.now());
          log(`⏰ Next sync in: ${Math.round(nextSync/1000)} seconds`);
        }
        
      } else {
        log(`❌ API returned success: false | Error: ${response.data.error || 'Unknown error'}`, 'warn');
      }
    } else {
      log('❌ Empty response from API', 'error');
    }

  } catch (err) {
    // ENHANCED ERROR HANDLING
    if (err.response) {
      log(`❌ API Error ${err.response.status}: ${JSON.stringify(err.response.data)}`, 'error');
      
      if (err.response.status === 400) {
        log('🔍 Bad request - check node ID format', 'error');
      } else if (err.response.status === 403) {
        log('🚫 System permission denied', 'error');
      } else if (err.response.status === 404) {
        log('🔍 Node not registered', 'error');
      } else if (err.response.status === 429) {
        const waitTime = err.response.data?.nextSyncAllowed ? 
          Math.round((err.response.data.nextSyncAllowed - Date.now())/1000) : 60;
        log(`⏰ Rate limited - wait ${waitTime} seconds`, 'warn');
      }
    } else if (err.request) {
      log('🌐 Network error - no response from server', 'error');
    } else {
      log(`💥 Unexpected error: ${err.message}`, 'error');
    }
  } finally {
    isSyncing = false;
  }
};
const startService = () => {
  log('🚀 Starting Netrum Node Sync Service');
  log(`⏰ Sync interval: ${SYNC_INTERVAL/1000} seconds`);
  log(`📁 Speed file: ${SPEED_FILE}`);
  
  // ✅ Initial sync
  setTimeout(() => {
    syncNode();
  }, 5000); // 5 second delay for startup
  
  // ✅ Regular sync every 1 minute
  setInterval(() => {
    syncNode();
  }, SYNC_INTERVAL);

  // ✅ Health monitoring
  setInterval(() => {
    const { download, upload } = getSpeedFromFile();
  }, 30000); // Every 30 seconds

  // ✅ Graceful shutdown
  process.on('SIGTERM', () => {
    process.exit(0);
  });

  process.on('SIGINT', () => {
    process.exit(0);
  });
};

// ✅ Start the service
startService();
