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

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000, // 1 minute timeout
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  }
});

const log = (msg) => {
  console.log(`[${new Date().toISOString()}] ${msg}`);
};

// ✅ File se latest speed data read kare
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
    log(`📄 Speed file read error: ${err.message}`);
  }
  
  // Fallback to minimum speeds
  log('⚠️ Using minimum speeds');
  return { download: 1, upload: 0.1 };
};

const getSystemMetrics = () => {
  try {
    const { download, upload } = getSpeedFromFile();
    
    const totalMemGB = Math.round(os.totalmem() / (1024 ** 3));
    const freeDiskGB = Math.round(diskusage.checkSync('/').free / (1024 ** 3));
    
    return {
      cpu: os.cpus().length,
      ram: Math.round(os.totalmem() / (1024 ** 2)),
      disk: freeDiskGB,
      speed: download,
      uploadSpeed: upload,
      lastSeen: Math.floor(Date.now() / 1000),
      systemPermission: true
    };
  } catch (err) {
    log(`❌ Metrics error: ${err.message}`);
    return null;
  }
};

const saveToken = (token) => {
  try {
    fs.mkdirSync(path.dirname(TOKEN_PATH), { recursive: true });
    fs.writeFileSync(TOKEN_PATH, token);
    log(`✅ Mining token saved`);
  } catch (err) {
    log(`❌ Token save failed: ${err.message}`);
  }
};

const readNodeId = () => {
  try {
    return fs.readFileSync('/root/netrum-lite-node/src/identity/node-id/id.txt', 'utf8').trim();
  } catch (err) {
    log(`❌ Node ID read failed: ${err.message}`);
    return null;
  }
};

const syncNode = async () => {
  try {
    const nodeId = readNodeId();
    if (!nodeId) {
      log('❌ Empty node ID');
      return;
    }

    log(`🔍 Node ID: ${nodeId}`);
    
    const metrics = getSystemMetrics();
    if (!metrics) {
      log('❌ Failed to get metrics');
      return;
    }

    log(`📊 Server Requirements: CPU: 2+ cores, RAM: 4GB (4096MB), Disk: 50GB, Speed: 5+ Mbps`);
    log(`📊 Actual Metrics: CPU: ${metrics.cpu} cores, RAM: ${metrics.ram}MB (${Math.round(metrics.ram/1024)}GB), Disk: ${metrics.disk}GB, Speed: ${metrics.speed}↓/${metrics.uploadSpeed}↑ Mbps`);

    const isActive = (
      metrics.cpu >= 2 &&
      metrics.ram >= 4096 &&
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

    log(`📤 Sending data to server...`);
    const response = await api.post(SYNC_ENDPOINT, payload);

    if (response.data) {
      if (response.data.success === true) {
        log(`✅ Sync successful | Status: ${response.data.syncStatus}`);
        
        if (response.data.miningToken) {
          saveToken(response.data.miningToken);
          log('✅ Mining token received');
        } else {
          log('⚠️ No mining token received');
        }
        
        if (response.data.log) {
          log(`📝 Server: ${response.data.log}`);
        }
        
      } else {
        log(`❌ API error: ${response.data.error || 'Unknown error'}`);
      }
    } else {
      log('❌ Empty response from API');
    }

  } catch (err) {
    if (err.response) {
      const status = err.response.status;
      const data = err.response.data;
      
      log(`❌ API Error ${status}: ${JSON.stringify(data)}`);
      
      if (status === 429) {
        const waitTime = data?.detail?.remainingMs ? 
          Math.round(data.detail.remainingMs/1000) : 60;
        log(`⏰ Rate limited - wait ${waitTime} seconds`);
      }
    } else if (err.code === 'ECONNABORTED') {
      log('⏱️ Request timeout');
    } else if (err.request) {
      log('🌐 Network error - no response from server');
    } else {
      log(`💥 Error: ${err.message}`);
    }
  }
};

const startService = () => {
  log('🚀 Starting Netrum Node Sync Service');
  log(`⏰ Sync interval: ${SYNC_INTERVAL/1000} seconds`);
  log(`📁 Speed file: ${SPEED_FILE}`);
  
  // ✅ Initial sync
  setTimeout(() => {
    syncNode();
  }, 5000);
  
  // ✅ Regular sync every 1 minute
  setInterval(() => {
    syncNode();
  }, SYNC_INTERVAL);

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
