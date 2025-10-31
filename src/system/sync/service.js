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
const SPEED_FILE = path.resolve(__dirname, '../system/speedtest.txt'); // ✅ Same file
const SYNC_COOLDOWN = 60000;

let lastSyncTime = 0;
let nextSyncAllowed = 0;

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 20000,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  }
});

const log = (msg, type = 'info') => {
  console.error(`[${new Date().toISOString()}] [${type.toUpperCase()}] ${msg}`);
};

// ✅ SIMPLE: File se speed data read kare
const getSpeedFromFile = () => {
  try {
    if (fs.existsSync(SPEED_FILE)) {
      const speedData = fs.readFileSync(SPEED_FILE, 'utf8').trim();
      const [download, upload] = speedData.split(' ').map(parseFloat);
      
      if (download && upload) {
        log(`Current speed: ${download}↓ / ${upload}↑ Mbps`);
        return { download, upload };
      }
    }
  } catch (err) {
    log(`Speed file read error: ${err.message}`, 'warn');
  }
  
  // Fallback to minimum speeds
  log('Using minimum speeds', 'warn');
  return { download: 1, upload: 0.1 };
};

const getSystemMetrics = () => {
  try {
    const { download, upload } = getSpeedFromFile(); // ✅ File se data
    
    return {
      cpu: os.cpus().length,
      ram: Math.round(os.totalmem() / (1024 ** 2)),
      disk: Math.round(diskusage.checkSync('/').free / (1024 ** 3)),
      speed: download,
      uploadSpeed: upload, // ✅ Upload speed bhi
      lastSeen: Math.floor(Date.now() / 1000),
      systemPermission: true
    };
  } catch (err) {
    log(`Metrics error: ${err.message}`, 'error');
    return null;
  }
};

const saveToken = (token) => {
  try {
    fs.mkdirSync(path.dirname(TOKEN_PATH), { recursive: true });
    fs.writeFileSync(TOKEN_PATH, token);
    log('Mining token saved');
  } catch (err) {
    log(`Token save failed: ${err.message}`, 'error');
  }
};

const readNodeId = () => {
  try {
    return fs.readFileSync('/root/netrum-lite-node/src/identity/node-id/id.txt', 'utf8').trim();
  } catch (err) {
    log(`Node ID read failed: ${err.message}`, 'error');
    return null;
  }
};

const syncNode = async () => {
  const now = Date.now();
  
  if (now < nextSyncAllowed) {
    const remaining = Math.ceil((nextSyncAllowed - now)/1000);
    log(`Waiting ${remaining} seconds until next sync`, 'info');
    return;
  }

  try {
    const nodeId = readNodeId();
    if (!nodeId) throw new Error('Empty node ID');

    const metrics = getSystemMetrics();
    if (!metrics) throw new Error('Failed to get metrics');

    // ✅ STRICT VALIDATION with 5 Mbps both
    const isActive = (
      metrics.cpu >= 2 &&
      metrics.ram >= 4096 &&
      metrics.disk >= 50 &&
      metrics.speed >= 5 &&      // 5 Mbps download
      metrics.uploadSpeed >= 5   // 5 Mbps upload
    );

    log(`System Status: ${isActive ? 'ACTIVE' : 'INACTIVE'} | Speed: ${metrics.speed}↓ / ${metrics.uploadSpeed}↑ Mbps`);

    const response = await api.post(SYNC_ENDPOINT, {
      nodeId,
      nodeMetrics: metrics,
      syncStatus: isActive ? 'Active' : 'InActive',
      systemPermission: true
    });

    if (response.data?.success) {
      lastSyncTime = Date.now();
      nextSyncAllowed = response.data.nextSyncAllowed || (lastSyncTime + SYNC_COOLDOWN);
      log(`Sync successful | Status: ${response.data.syncStatus}`);
      
      if (response.data.miningToken) {
        saveToken(response.data.miningToken);
      }
    }
  } catch (err) {
    if (err.response?.status === 429) {
      nextSyncAllowed = err.response.data?.nextSyncAllowed || (Date.now() + SYNC_COOLDOWN);
      const remaining = Math.ceil((nextSyncAllowed - Date.now())/1000);
      log(`Sync too frequent. Waiting ${remaining} seconds`, 'warn');
    } else {
      log(`Sync failed: ${err.message}`, 'error');
    }
  }
};

const startService = () => {
  log('Starting Netrum Node Sync (reading from speedtest.txt)');
  
  // Initial sync
  syncNode();
  
  // Regular sync
  setInterval(() => {
    const now = Date.now();
    if (now >= nextSyncAllowed) {
      syncNode();
    }
  }, 15000);

  process.on('SIGTERM', () => {
    log('Service shutting down');
    process.exit(0);
  });
};

startService();
