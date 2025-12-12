#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import os from 'os';
import diskusage from 'diskusage';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration - SERVER KE ACCORDING
const API_BASE_URL = 'https://node.netrumlabs.dev';
const SYNC_ENDPOINT = '/metrics/sync';
const TOKEN_PATH = path.resolve(__dirname, '../mining/miningtoken.txt');
const SPEED_FILE = path.resolve(__dirname, '../system/speedtest.txt');

// Server: 60000ms cooldown - 2000ms buffer = 58000ms effective
// Client: 58000ms + 2000ms buffer = 60000ms (safe)
const SYNC_INTERVAL = 60000; // 60 seconds

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000, // 30 seconds
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  }
});

const log = (msg) => {
  console.log(`[${new Date().toISOString()}] ${msg}`);
};

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
    log(`Speed file error: ${err.message}`);
  }
  return { download: 1, upload: 0.1 };
};

const getSystemMetrics = () => {
  try {
    const { download, upload } = getSpeedFromFile();
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
    log(`Metrics error: ${err.message}`);
    return null;
  }
};

const saveToken = (token) => {
  try {
    fs.mkdirSync(path.dirname(TOKEN_PATH), { recursive: true });
    fs.writeFileSync(TOKEN_PATH, token);
    log(`Mining token saved (${token.length} chars)`);
  } catch (err) {
    log(`Token save failed: ${err.message}`);
  }
};

const readNodeId = () => {
  try {
    return fs.readFileSync('/root/netrum-lite-node/src/identity/node-id/id.txt', 'utf8').trim();
  } catch (err) {
    log(`Node ID read failed: ${err.message}`);
    return null;
  }
};

const syncNode = async () => {
  try {
    const nodeId = readNodeId();
    if (!nodeId) {
      log('Error: Empty node ID');
      return;
    }

    log(`Node ID: ${nodeId}`);
    
    const metrics = getSystemMetrics();
    if (!metrics) {
      log('Error: Failed to get metrics');
      return;
    }

    const isActive = (
      metrics.cpu >= 2 &&
      metrics.ram >= 4096 &&
      metrics.disk >= 50 &&
      metrics.speed >= 5 &&
      metrics.uploadSpeed >= 5
    );

    log(`System Status: ${isActive ? 'ACTIVE' : 'INACTIVE'}`);

    const payload = {
      nodeId,
      nodeMetrics: metrics,
      syncStatus: isActive ? 'Active' : 'InActive',
      systemPermission: true
    };

    log(`Sending to server...`);
    const response = await api.post(SYNC_ENDPOINT, payload);

    if (response.data && response.data.success === true) {
      log(`Sync successful - Status: ${response.data.syncStatus}`);
      
      if (response.data.miningToken) {
        saveToken(response.data.miningToken);
        log('✅ Mining token received');
      } else {
        log('No mining token received');
      }
      
      if (response.data.log) {
        log(`Server: ${response.data.log}`);
      }
      
    } else {
      log(`Sync failed: ${response.data?.error || 'Unknown error'}`);
    }

  } catch (err) {
    if (err.response) {
      const status = err.response.status;
      const data = err.response.data;
      
      if (status === 429) {
        const waitTime = data?.detail?.remainingMs ? 
          Math.round(data.detail.remainingMs/1000) : 60;
        log(`Rate limited - wait ${waitTime} seconds`);
      } else if (status === 400) {
        log(`Bad request: ${JSON.stringify(data)}`);
      } else if (status === 403) {
        log('Permission denied');
      } else if (status === 404) {
        log('Node not found');
      } else {
        log(`Server error ${status}: ${JSON.stringify(data)}`);
      }
    } else if (err.code === 'ECONNABORTED') {
      log('Request timeout');
    } else if (err.request) {
      log('Network error');
    } else {
      log(`Error: ${err.message}`);
    }
  }
};

const startService = () => {
  log('Starting Netrum Node Sync Service');
  log(`Sync interval: ${SYNC_INTERVAL/1000} seconds`);
  
  // Initial sync
  setTimeout(() => {
    syncNode();
  }, 10000);
  
  // Regular sync - 60 seconds interval
  setInterval(() => {
    syncNode();
  }, SYNC_INTERVAL);
  
  // Graceful shutdown
  process.on('SIGTERM', () => process.exit(0));
  process.on('SIGINT', () => process.exit(0));
};

startService();
