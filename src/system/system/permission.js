#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PERMISSION_FILE = path.join(__dirname, 'task-permission.json');

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

const enableTaskPower = () => {
  const permission = loadPermission();
  
  if (permission.taskPowerEnabled) {
    return true;
  }

  permission.taskPowerEnabled = true;
  permission.allowedRam = TASK_POWER_CONFIG.ALLOCATED_RAM;
  permission.termsAccepted = true;
  permission.permissionGivenAt = new Date().toISOString();
  
  return savePermission(permission);
};

const disableTaskPower = () => {
  const permission = loadPermission();
  
  if (!permission.taskPowerEnabled) {
    return true;
  }

  permission.taskPowerEnabled = false;
  permission.allowedRam = 0;
  
  return savePermission(permission);
};

const getPermissionStatus = () => {
  return loadPermission();
};

// Auto-enable on first run
const initializeAutoPermission = () => {
  const permission = loadPermission();
  
  if (!permission.taskPowerEnabled && !permission.termsAccepted) {
    console.log('🔄 Auto-enabling Task Power Sharing...');
    enableTaskPower();
    console.log('✅ Task Power Sharing enabled automatically (2GB RAM)');
  }
};

// Run auto initialization
initializeAutoPermission();

export { 
  loadPermission, 
  savePermission, 
  enableTaskPower, 
  disableTaskPower, 
  getPermissionStatus 
};