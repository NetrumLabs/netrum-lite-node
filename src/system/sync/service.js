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

const getSystemMetrics = () => {
  try {
    return {
      cpu: os.cpus().length,
      ram: Math.round(os.totalmem() / (1024 ** 2)),
      disk: Math.round(diskusage.checkSync('/').free / (1024 ** 3)),
      speed: 5,
      lastSeen: Math.floor(Date.now() / 1000),
      systemPermission: true // ✅ ADDED: System permission true
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

    const isActive = (
      metrics.cpu >= 2 &&
      metrics.ram >= 4096 &&
      metrics.disk >= 50
    );

    const response = await api.post(SYNC_ENDPOINT, {
      nodeId,
      nodeMetrics: metrics,
      syncStatus: isActive ? 'Active' : 'InActive', // ✅ CHANGED: nodeStatus → syncStatus
      systemPermission: true // ✅ ADDED: System permission
    });

    if (response.data?.success) {
      lastSyncTime = Date.now();
      nextSyncAllowed = response.data.nextSyncAllowed || (lastSyncTime + SYNC_COOLDOWN);
      log(`Sync successful. Next sync at ${new Date(nextSyncAllowed).toISOString()}`);
      log(`Sync Status: ${response.data.syncStatus}`); // ✅ CHANGED: syncStatus
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

// Start service with precise timing
const startService = () => {
  log('Starting Netrum Node Sync with strict 60-second interval');
  
  // Initial sync
  syncNode();
  
  // Regular sync every 60 seconds
  setInterval(() => {
    const now = Date.now();
    if (now >= nextSyncAllowed) {
      syncNode();
    }
  }, 10000); // Check every 10 seconds if sync is allowed

  // Cleanup handlers
  process.on('SIGTERM', () => {
    log('Service shutting down');
    process.exit(0);
  });
};

startService();
