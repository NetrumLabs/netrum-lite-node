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
const SYNC_INTERVAL = 5000;
const TOKEN_PATH = path.resolve(__dirname, '../mining/miningtoken.txt');

// Minimum system requirements
const NODE_REQUIREMENTS = { 
  RAM: 4,    // in GB
  CORES: 2,  // minimum cores
  STORAGE: 50 // in GB
};

// Configure axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  }
});

// Helper functions
const log = (msg) => console.error(`[${new Date().toISOString()}] ${msg}`);

// Permission system import and check
const loadPermissionSystem = async () => {
  try {
    const permissionPath = path.resolve(__dirname, '../system/permission.js');
    const { loadPermission } = await import(permissionPath);
    const permission = loadPermission();
    
    if (!permission.taskPowerEnabled) {
      log('System Permission Restart');
      return false;
    }
    
    return permission.taskPowerEnabled;
  } catch (err) {
    log(`Permission system error: ${err.message}`);
    return false;
  }
};

const getSystemMetrics = async () => {
  try {
    const systemPermission = await loadPermissionSystem();
    
    if (!systemPermission) {
      log('System Permission Restart');
      await new Promise(resolve => setTimeout(resolve, 1000));
      return await getSystemMetrics();
    }

    return {
      cpu: os.cpus().length,
      ram: Math.round(os.totalmem() / (1024 ** 2)), // MB
      disk: Math.round(diskusage.checkSync('/').free / (1024 ** 3)), // GB
      speed: 5, // Default Mbps
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
    log('Mining token saved');
  } catch (err) {
    log(`Token save failed: ${err.message}`);
  }
};

const syncNode = async () => {
  try {
    // 1. Get node ID
    const nodeId = fs.readFileSync(
      '/root/netrum-lite-node/src/identity/node-id/id.txt', 
      'utf8'
    ).trim();

    // 2. Get system metrics with permission check
    const metrics = await getSystemMetrics();
    if (!metrics) throw new Error('Failed to get metrics');

    // 3. Determine node status
    const isActive = (
      metrics.cpu >= NODE_REQUIREMENTS.CORES &&
      metrics.ram >= NODE_REQUIREMENTS.RAM * 1024 &&
      metrics.disk >= NODE_REQUIREMENTS.STORAGE
    );

    // 4. Send to server
    const response = await api.post(SYNC_ENDPOINT, {
      nodeId,
      nodeMetrics: metrics,
      nodeStatus: isActive ? 'Active' : 'InActive'
    });

    // 5. Handle response
    if (response.data?.success) {
      log(response.data.log || 'Sync successful');
      if (response.data.miningToken) {
        saveToken(response.data.miningToken);
      }
    }

  } catch (err) {
    if (err.response) {
      log(`Server error: ${err.response.status} - ${JSON.stringify(err.response.data)}`);
    } else {
      log(`Sync failed: ${err.message}`);
    }
  }
};

// Start service
log('Starting Netrum Node Sync');
syncNode();
setInterval(syncNode, SYNC_INTERVAL);