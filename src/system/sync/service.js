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
const API_BASE_URL = 'https://api.v2.netrumlabs.com';
const SYNC_ENDPOINT = '/api/node/metrics/sync';
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
    
    return {
      cpu: os.cpus().length,
      ram: Math.round(os.totalmem() / (1024 ** 2)),
      disk: Math.round(diskusage.checkSync('/').free / (1024 ** 3)),
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

    log('🔄 Starting sync process...');
    
    // ✅ Fresh metrics collect kare (including latest speed)
    const metrics = getSystemMetrics();
    if (!metrics) {
      throw new Error('Failed to get metrics');
    }

    // ✅ STRICT VALIDATION with 5 Mbps both
    const isActive = (
      metrics.cpu >= 2 &&
      metrics.ram >= 4096 &&
      metrics.disk >= 50 &&
      metrics.speed >= 5 &&      // 5 Mbps download
      metrics.uploadSpeed >= 5   // 5 Mbps upload
    );

    log(`📈 System Status: ${isActive ? 'ACTIVE' : 'INACTIVE'} | Speed: ${metrics.speed}↓ / ${metrics.uploadSpeed}↑ Mbps`);

    const response = await api.post(SYNC_ENDPOINT, {
      nodeId,
      nodeMetrics: metrics,
      syncStatus: isActive ? 'Active' : 'InActive',
      systemPermission: true
    });

    if (response.data?.success) {
      log(`✅ Sync successful | Status: ${response.data.syncStatus}`);
      
      if (response.data.miningToken) {
        saveToken(response.data.miningToken);
        log('💰 Mining token received');
      }
      
      // ✅ Next sync timing
      const nextSync = response.data.nextSyncAllowed || SYNC_INTERVAL;
      log(`⏰ Next sync in: ${Math.round(nextSync/1000)} seconds`);
      
    } else {
      log('❌ Sync response not successful', 'warn');
    }
  } catch (err) {
    if (err.response?.status === 429) {
      const retryAfter = err.response.data?.nextSyncAllowed || SYNC_INTERVAL;
      log(`🚫 Rate limited. Next sync in: ${Math.round(retryAfter/1000)} seconds`, 'warn');
    } else if (err.code === 'ECONNREFUSED' || err.code === 'ENETUNREACH') {
      log('🌐 Network error - cannot reach API server', 'error');
    } else if (err.response?.status >= 500) {
      log('🔧 Server error - API server issue', 'error');
    } else {
      log(`❌ Sync failed: ${err.message}`, 'error');
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
