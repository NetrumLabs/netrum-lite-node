#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import os from 'os';
import diskusage from 'diskusage';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const API_BASE_URL = 'https://api.v2.netrumlabs.com';
const SYNC_ENDPOINT = '/api/node/metrics/sync';
const TOKEN_PATH = path.resolve(__dirname, '../mining/miningtoken.txt');
const SYNC_COOLDOWN = 60000;

// Track last sync time
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
  console.log(`[${new Date().toISOString()}] [${type.toUpperCase()}] ${msg}`);
};

// ========== NETWORK AVAILABILITY CHECK ==========
const checkNetworkAvailability = () => {
  return new Promise((resolve) => {
    const startTime = Date.now();
    
    // Try to connect to your API server
    axios.get(`${API_BASE_URL}/health`, { timeout: 10000 })
      .then((response) => {
        const responseTime = Date.now() - startTime;
        
        // Internet available - estimate speed based on response time
        let download, upload, status;
        
        if (responseTime < 500) {
          status = 'EXCELLENT';
          download = 100;
          upload = 50;
        } else if (responseTime < 1000) {
          status = 'GOOD';
          download = 50;
          upload = 25;
        } else if (responseTime < 3000) {
          status = 'AVERAGE';
          download = 20;
          upload = 10;
        } else if (responseTime < 8000) {
          status = 'SLOW';
          download = 10;
          upload = 5;
        } else {
          status = 'POOR';
          download = 5;
          upload = 2;
        }
        
        log(`🌐 INTERNET: AVAILABLE | Quality: ${status} | Response: ${responseTime}ms | Estimated: ${download}↓/${upload}↑ Mbps`, 'info');
        resolve({ 
          available: true, 
          download, 
          upload, 
          quality: status,
          responseTime 
        });
      })
      .catch((error) => {
        // API connection failed - check basic internet
        checkBasicInternet()
          .then((basicResult) => {
            if (basicResult.available) {
              log(`🌐 INTERNET: AVAILABLE (Basic) | Estimated: ${basicResult.download}↓/${basicResult.upload}↑ Mbps`, 'warn');
              resolve(basicResult);
            } else {
              log('❌ INTERNET: NOT AVAILABLE - No network connection', 'error');
              resolve({ 
                available: false, 
                download: 0, 
                upload: 0, 
                quality: 'NO_INTERNET',
                responseTime: 0 
              });
            }
          });
      });
  });
};

// ========== BASIC INTERNET CHECK ==========
const checkBasicInternet = () => {
  return new Promise((resolve) => {
    let hasInternet = false;
    
    // Try multiple methods to check basic internet
    const checkMethods = [
      // Method 1: Ping Google DNS
      () => {
        try {
          execSync('ping -c 1 -W 3 8.8.8.8', { stdio: 'pipe' });
          return true;
        } catch {
          return false;
        }
      },
      // Method 2: Ping Cloudflare
      () => {
        try {
          execSync('ping -c 1 -W 3 1.1.1.1', { stdio: 'pipe' });
          return true;
        } catch {
          return false;
        }
      },
      // Method 3: Check if we can resolve DNS
      () => {
        try {
          execSync('nslookup google.com', { stdio: 'pipe' });
          return true;
        } catch {
          return false;
        }
      }
    ];
    
    // Try each method
    for (const method of checkMethods) {
      if (method()) {
        hasInternet = true;
        break;
      }
    }
    
    if (hasInternet) {
      resolve({ 
        available: true, 
        download: 5,  // Minimum assumed speed
        upload: 2,    // Minimum assumed speed
        quality: 'BASIC',
        responseTime: 0 
      });
    } else {
      resolve({ 
        available: false, 
        download: 0, 
        upload: 0, 
        quality: 'NO_INTERNET',
        responseTime: 0 
      });
    }
  });
};

// ========== SYSTEM METRICS WITH NETWORK CHECK ==========
const getSystemMetrics = async () => {
  try {
    // Check network availability first
    const network = await checkNetworkAvailability();
    
    if (!network.available) {
      log('⚠️  System check continuing without internet...', 'warn');
    }
    
    return {
      cpu: os.cpus().length,
      ram: Math.round(os.totalmem() / (1024 ** 2)),
      disk: Math.round(diskusage.checkSync('/').free / (1024 ** 3)),
      speed: network.download, // Backward compatibility
      download: network.download,
      upload: network.upload,
      networkAvailable: network.available,
      networkQuality: network.quality,
      responseTime: network.responseTime,
      lastSeen: Math.floor(Date.now() / 1000),
      systemPermission: true,
      platform: os.platform(),
      arch: os.arch(),
      uptime: Math.round(os.uptime())
    };
  } catch (err) {
    log(`Metrics error: ${err.message}`, 'error');
    return null;
  }
};

// ========== EXISTING FUNCTIONS ==========
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
  
  // Enforce cooldown strictly
  if (now < nextSyncAllowed) {
    const remaining = Math.ceil((nextSyncAllowed - now)/1000);
    log(`Waiting ${remaining} seconds until next sync`, 'info');
    return;
  }

  try {
    const nodeId = readNodeId();
    if (!nodeId) throw new Error('Empty node ID');

    const metrics = await getSystemMetrics(); // Now async
    if (!metrics) throw new Error('Failed to get metrics');

    // Check if system meets requirements AND has internet
    const isActive = (
      metrics.cpu >= 2 &&
      metrics.ram >= 4096 &&
      metrics.disk >= 50 &&
      metrics.networkAvailable === true // Internet must be available
    );

    log(`📊 System Check - CPU: ${metrics.cpu} | RAM: ${metrics.ram}MB | Disk: ${metrics.disk}GB | Internet: ${metrics.networkAvailable ? '✅' : '❌'} ${metrics.networkQuality}`, 'info');

    const response = await api.post(SYNC_ENDPOINT, {
      nodeId,
      nodeMetrics: metrics,
      syncStatus: isActive ? 'Active' : 'InActive',
      systemPermission: true
    });

    if (response.data?.success) {
      lastSyncTime = Date.now();
      nextSyncAllowed = response.data.nextSyncAllowed || (lastSyncTime + SYNC_COOLDOWN);
      log(`✅ Sync successful. Next sync at ${new Date(nextSyncAllowed).toISOString()}`);
      log(`📡 Sync Status: ${response.data.syncStatus}`);
      if (response.data.miningToken) {
        saveToken(response.data.miningToken);
        log('🔑 Mining token received and saved');
      }
    }
  } catch (err) {
    if (err.response?.status === 429) {
      nextSyncAllowed = err.response.data?.nextSyncAllowed || (Date.now() + SYNC_COOLDOWN);
      const remaining = Math.ceil((nextSyncAllowed - Date.now())/1000);
      log(`⏳ Sync too frequent. Waiting ${remaining} seconds`, 'warn');
    } else {
      log(`❌ Sync failed: ${err.message}`, 'error');
    }
  }
};

// Start service with precise timing
const startService = () => {
  log('🚀 Starting Netrum Node Sync with Network Detection');
  
  // Initial sync
  setTimeout(() => {
    syncNode();
  }, 2000);
  
  // Regular sync every 60 seconds
  setInterval(() => {
    const now = Date.now();
    if (now >= nextSyncAllowed) {
      syncNode();
    }
  }, 10000);

  // Cleanup handlers
  process.on('SIGTERM', () => {
    log('🛑 Service shutting down');
    process.exit(0);
  });
};

startService();
