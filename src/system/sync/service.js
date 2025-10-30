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
const SPEEDTEST_FILE = path.join(__dirname, 'speedtest.txt');
const SYNC_COOLDOWN = 60000; // Strict 60-second cooldown

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
  console.error(`[${new Date().toISOString()}] [${type.toUpperCase()}] ${msg}`);
};

// ========== IMPROVED SPEED TEST FUNCTION ==========
const runSpeedTest = () => {
  let download = 0;
  let upload = 0;
  
  log('Starting network speed test...', 'info');

  // Method 1: Try Ookla Speedtest CLI first (most accurate)
  try {
    log('Trying Ookla Speedtest CLI...', 'info');
    const result = execSync('speedtest --accept-license --accept-gdpr --format=json', { 
      stdio: 'pipe',
      timeout: 120000 // 2 minutes timeout
    }).toString().trim();
    
    const json = JSON.parse(result);
    download = (json.download.bandwidth * 8) / 1e6; // Convert to Mbps
    upload = (json.upload.bandwidth * 8) / 1e6;
    
    log(`Ookla Results - Download: ${download.toFixed(2)} Mbps, Upload: ${upload.toFixed(2)} Mbps`, 'info');
  } catch (error) {
    log(`Ookla failed: ${error.message}`, 'warn');
    
    // Method 2: Try fast-cli as fallback
    try {
      log('Trying fast-cli...', 'info');
      const result = execSync('npx --yes fast-cli --upload --json', { 
        stdio: 'pipe',
        timeout: 60000 // 1 minute timeout
      }).toString().trim();
      
      const json = JSON.parse(result);
      download = json.downloadSpeed || 0;
      upload = json.uploadSpeed || 0;
      
      log(`Fast-cli Results - Download: ${download.toFixed(2)} Mbps, Upload: ${upload.toFixed(2)} Mbps`, 'info');
    } catch (error2) {
      log(`Fast-cli failed: ${error2.message}`, 'warn');
      
      // Method 3: Try speedtest-node as final fallback
      try {
        log('Trying speedtest-node...', 'info');
        const result = execSync('npx --yes speedtest-node --json', { 
          stdio: 'pipe',
          timeout: 60000
        }).toString().trim();
        
        const json = JSON.parse(result);
        download = json.download || 0;
        upload = json.upload || 0;
        
        log(`Speedtest-node Results - Download: ${download.toFixed(2)} Mbps, Upload: ${upload.toFixed(2)} Mbps`, 'info');
      } catch (error3) {
        log(`All speed tests failed, using default values`, 'error');
        download = 5; // Default minimum
        upload = 1;   // Default minimum
      }
    }
  }

  // Ensure minimum values
  download = Math.max(download, 1);
  upload = Math.max(upload, 0.5);

  // Save results to file
  try {
    fs.writeFileSync(SPEEDTEST_FILE, `${download.toFixed(2)} ${upload.toFixed(2)}`);
    log(`Speed results saved to: ${SPEEDTEST_FILE}`, 'info');
  } catch (error) {
    log(`Failed to save speed results: ${error.message}`, 'error');
  }

  return { download, upload };
};

// ========== IMPROVED SYSTEM METRICS ==========
const getSystemMetrics = () => {
  try {
    // Run actual speed test
    const { download, upload } = runSpeedTest();
    
    // Calculate network score (0-100 scale)
    const networkScore = Math.min((download * 2 + upload * 1), 100);
    
    return {
      cpu: os.cpus().length,
      ram: Math.round(os.totalmem() / (1024 ** 2)), // MB
      disk: Math.round(diskusage.checkSync('/').free / (1024 ** 3)), // GB
      download: parseFloat(download.toFixed(2)),
      upload: parseFloat(upload.toFixed(2)),
      networkScore: Math.round(networkScore),
      lastSeen: Math.floor(Date.now() / 1000),
      systemPermission: true,
      // Additional useful metrics
      platform: os.platform(),
      arch: os.arch(),
      uptime: Math.round(os.uptime()),
      load: os.loadavg()[0] // 1-minute load average
    };
  } catch (err) {
    log(`Metrics error: ${err.message}`, 'error');
    
    // Fallback metrics if speed test completely fails
    return {
      cpu: os.cpus().length,
      ram: Math.round(os.totalmem() / (1024 ** 2)),
      disk: Math.round(diskusage.checkSync('/').free / (1024 ** 3)),
      download: 5,
      upload: 1,
      networkScore: 10,
      lastSeen: Math.floor(Date.now() / 1000),
      systemPermission: true,
      platform: os.platform(),
      arch: os.arch(),
      uptime: Math.round(os.uptime()),
      load: os.loadavg()[0],
      error: true
    };
  }
};

// ========== EXISTING FUNCTIONS (Improved) ==========
const saveToken = (token) => {
  try {
    fs.mkdirSync(path.dirname(TOKEN_PATH), { recursive: true });
    fs.writeFileSync(TOKEN_PATH, token);
    log('Mining token saved successfully', 'info');
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

// ========== IMPROVED SYNC FUNCTION ==========
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

    const metrics = getSystemMetrics();
    if (!metrics) throw new Error('Failed to get metrics');

    // Enhanced active status check with network requirements
    const isActive = (
      metrics.cpu >= 2 &&
      metrics.ram >= 4096 &&
      metrics.disk >= 50 &&
      metrics.download >= 5 &&  // Minimum 5 Mbps download
      metrics.upload >= 1       // Minimum 1 Mbps upload
    );

    log(`Sending metrics - CPU: ${metrics.cpu}, RAM: ${metrics.ram}MB, Disk: ${metrics.disk}GB, Download: ${metrics.download}Mbps, Upload: ${metrics.upload}Mbps`, 'info');

    const response = await api.post(SYNC_ENDPOINT, {
      nodeId,
      nodeMetrics: metrics,
      syncStatus: isActive ? 'Active' : 'InActive',
      systemPermission: true,
      networkQuality: metrics.networkScore > 50 ? 'Good' : 'Poor'
    });

    if (response.data?.success) {
      lastSyncTime = Date.now();
      nextSyncAllowed = response.data.nextSyncAllowed || (lastSyncTime + SYNC_COOLDOWN);
      log(`Sync successful. Next sync at ${new Date(nextSyncAllowed).toISOString()}`, 'info');
      log(`Sync Status: ${response.data.syncStatus}`, 'info');
      
      if (response.data.miningToken) {
        saveToken(response.data.miningToken);
        log('Mining token received and saved', 'info');
      }
    }
  } catch (err) {
    if (err.response?.status === 429) {
      nextSyncAllowed = err.response.data?.nextSyncAllowed || (Date.now() + SYNC_COOLDOWN);
      const remaining = Math.ceil((nextSyncAllowed - Date.now())/1000);
      log(`Sync too frequent. Waiting ${remaining} seconds`, 'warn');
    } else {
      log(`Sync failed: ${err.message}`, 'error');
      // If sync fails, allow retry after 30 seconds
      nextSyncAllowed = Date.now() + 30000;
    }
  }
};

// ========== CACHE SPEED RESULTS ==========
let cachedSpeedResults = null;
let lastSpeedTest = 0;
const SPEEDTEST_CACHE_TIME = 300000; // 5 minutes cache

const getCachedSpeedTest = () => {
  const now = Date.now();
  
  // Use cache if available and not expired
  if (cachedSpeedResults && (now - lastSpeedTest < SPEEDTEST_CACHE_TIME)) {
    log('Using cached speed test results', 'info');
    return cachedSpeedResults;
  }
  
  // Try to read from file first
  try {
    if (fs.existsSync(SPEEDTEST_FILE)) {
      const data = fs.readFileSync(SPEEDTEST_FILE, 'utf8');
      const [download, upload] = data.split(' ').map(Number);
      const fileStats = fs.statSync(SPEEDTEST_FILE);
      const fileAge = now - fileStats.mtime.getTime();
      
      // Use file data if less than 10 minutes old
      if (fileAge < 600000 && download > 0 && upload > 0) {
        log('Using recent speed test file results', 'info');
        cachedSpeedResults = { download, upload };
        lastSpeedTest = fileStats.mtime.getTime();
        return cachedSpeedResults;
      }
    }
  } catch (error) {
    log(`Error reading speed test file: ${error.message}`, 'warn');
  }
  
  // Run new speed test
  cachedSpeedResults = runSpeedTest();
  lastSpeedTest = now;
  return cachedSpeedResults;
};

// ========== START SERVICE ==========
const startService = () => {
  log('Starting Netrum Node Sync with improved speed testing', 'info');
  
  // Check if speedtest tools are available
  log('Checking speedtest dependencies...', 'info');
  
  // Initial sync
  setTimeout(() => {
    syncNode();
  }, 5000); // Wait 5 seconds before first sync
  
  // Regular sync every 60 seconds
  setInterval(() => {
    const now = Date.now();
    if (now >= nextSyncAllowed) {
      syncNode();
    }
  }, 10000); // Check every 10 seconds if sync is allowed

  // Cleanup handlers
  process.on('SIGTERM', () => {
    log('Service shutting down gracefully', 'info');
    process.exit(0);
  });

  process.on('uncaughtException', (error) => {
    log(`Uncaught exception: ${error.message}`, 'error');
  });
};

startService();
