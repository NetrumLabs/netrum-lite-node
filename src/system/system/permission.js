#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PERMISSION_FILE = path.join(__dirname, 'task-permission.json');
const MINING_TOKEN_PATH = path.join(__dirname, '../../mining/miningtoken.txt');
const NODE_ID_PATH = path.join(__dirname, '../../identity/node-id/id.txt');

const TASK_POWER_CONFIG = {
  ALLOCATED_RAM: 2,
  MAX_RAM: 3
};

const DEFAULT_PERMISSION = {
  taskPowerEnabled: false,
  allowedRam: 0,
  permissionGivenAt: null,
  termsAccepted: false,
  lastUpdated: new Date().toISOString()
};

// API configuration
const API_BASE_URL = 'https://node.netrumlabs.dev';
const ENABLE_RAM_URL = '/enable-ram/enable-ram';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
});

const log = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`);

const loadPermission = () => {
  try {
    if (fs.existsSync(PERMISSION_FILE)) {
      const data = fs.readFileSync(PERMISSION_FILE, 'utf8');
      return JSON.parse(data);
    }
    return DEFAULT_PERMISSION;
  } catch (err) {
    return DEFAULT_PERMISSION;
  }
};

const savePermission = (permission) => {
  try {
    permission.lastUpdated = new Date().toISOString();
    fs.writeFileSync(PERMISSION_FILE, JSON.stringify(permission, null, 2));
    return true;
  } catch (err) {
    return false;
  }
};

// Get mining token
const getMiningToken = () => {
  try {
    if (fs.existsSync(MINING_TOKEN_PATH)) {
      return fs.readFileSync(MINING_TOKEN_PATH, 'utf8').trim();
    }
    return null;
  } catch (err) {
    log(`Token read error: ${err.message}`);
    return null;
  }
};

// Get node ID
const getNodeId = () => {
  try {
    if (fs.existsSync(NODE_ID_PATH)) {
      return fs.readFileSync(NODE_ID_PATH, 'utf8').trim();
    }
    return null;
  } catch (err) {
    log(`Node ID read error: ${err.message}`);
    return null;
  }
};

// Enable RAM on server
const enableRAMOnServer = async () => {
  try {
    const miningToken = getMiningToken();
    const nodeId = getNodeId();
    
    if (!miningToken || !nodeId) {
      log('❌ Mining token or Node ID not found');
      return false;
    }

    const response = await api.post(ENABLE_RAM_URL, {
      miningToken,
      nodeId,
      ramAmount: TASK_POWER_CONFIG.ALLOCATED_RAM
    });

    if (response.data?.success) {
      log(`✅ ${TASK_POWER_CONFIG.ALLOCATED_RAM}GB RAM enabled on server`);
      return true;
    } else {
      log(`❌ Server RAM enable failed: ${response.data?.error}`);
      return false;
    }
  } catch (err) {
    if (err.response) {
      log(`Server RAM enable error: ${err.response.status} - ${JSON.stringify(err.response.data)}`);
    } else {
      log(`Server RAM enable request failed: ${err.message}`);
    }
    return false;
  }
};

const enableTaskPower = async () => {
  const permission = loadPermission();
  
  if (permission.taskPowerEnabled) {
    log('✅ Task Power already enabled');
    return true;
  }

  // Step 1: Enable RAM on server
  log('🔄 Enabling RAM on server...');
  const serverSuccess = await enableRAMOnServer();
  
  if (!serverSuccess) {
    log('❌ Failed to enable RAM on server');
    return false;
  }

  // Step 2: Save local permission
  permission.taskPowerEnabled = true;
  permission.allowedRam = TASK_POWER_CONFIG.ALLOCATED_RAM;
  permission.termsAccepted = true;
  permission.permissionGivenAt = new Date().toISOString();
  
  const localSuccess = savePermission(permission);
  
  if (localSuccess) {
    log(`✅ Task Power enabled with ${TASK_POWER_CONFIG.ALLOCATED_RAM}GB RAM`);
    return true;
  } else {
    log('❌ Failed to save local permission');
    return false;
  }
};

const disableTaskPower = async () => {
  const permission = loadPermission();
  
  if (!permission.taskPowerEnabled) {
    log('✅ Task Power already disabled');
    return true;
  }

  // Optional: Disable RAM on server if needed
  // await disableRAMOnServer();

  permission.taskPowerEnabled = false;
  permission.allowedRam = 0;
  
  const success = savePermission(permission);
  
  if (success) {
    log('✅ Task Power disabled');
    return true;
  } else {
    log('❌ Failed to disable Task Power');
    return false;
  }
};

const getPermissionStatus = () => {
  return loadPermission();
};

// Command line interface
const main = async () => {
  const command = process.argv[2];

  switch (command) {
    case 'enable':
      await enableTaskPower();
      break;
      
    case 'disable':
      await disableTaskPower();
      break;
      
    case 'status':
      const status = getPermissionStatus();
      console.log('\n🎯 Task Power Status:');
      console.log(`✅ Enabled: ${status.taskPowerEnabled ? 'Yes' : 'No'}`);
      console.log(`📊 Allocated RAM: ${status.allowedRam}GB`);
      console.log(`⏰ Permission Given: ${status.permissionGivenAt || 'Never'}`);
      console.log(`🔄 Last Updated: ${status.lastUpdated}`);
      break;
      
    case '--help':
    case '-h':
    default:
      console.log(`
🎯 Netrum Task Power CLI

Usage:
  node permission.js enable     Enable Task Power with 2GB RAM
  node permission.js disable    Disable Task Power
  node permission.js status     Show current status
  node permission.js --help     Show this help

Description:
  Manage TTS Task Power allocation for Netrum node.
  Enables 2GB RAM for text-to-speech task processing.
`);
      break;
  }
};

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { 
  loadPermission, 
  savePermission, 
  enableTaskPower, 
  disableTaskPower, 
  getPermissionStatus 
};
