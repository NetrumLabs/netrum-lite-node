#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration - ONLY TASK PROVIDER
const API_BASE_URL = 'https://api.v2.netrumlabs.com';
const TASK_PROVIDER_URL = '/api/node/polling/taskProvider';

// File paths
const MINING_TOKEN_PATH = path.resolve(__dirname, '../system/mining/miningtoken.txt');
const NODE_ID_PATH = path.resolve(__dirname, '../identity/node-id/id.txt');

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  }
});

const log = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`);

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

// Get task from server - ONLY TASK PROVIDER
const getTaskFromServer = async () => {
  try {
    const miningToken = getMiningToken();
    const nodeId = getNodeId();
    
    if (!miningToken) {
      log('❌ No mining token found');
      return null;
    }

    if (!nodeId) {
      log('❌ No node ID found');
      return null;
    }

    const response = await api.post(TASK_PROVIDER_URL, {
      miningToken,
      nodeId
    });

    if (response.data?.success && response.data.task) {
      log(`✅ Task received: ${response.data.task.taskId}`);
      log(`📊 RAM Required: ${response.data.task.ramRequired}GB`);
      return response.data.task;
    } else {
      log(`⏳ No task available: ${response.data?.message}`);
      return null;
    }

  } catch (err) {
    if (err.response) {
      log(`Task provider error: ${err.response.status} - ${JSON.stringify(err.response.data)}`);
    } else {
      log(`Task request failed: ${err.message}`);
    }
    return null;
  }
};

// Process task (2GB RAM fix use)
const processTask = async (task) => {
  try {
    log(`🔄 Processing task: ${task.taskId} (Using ${task.ramRequired}GB RAM)`);
    
    // Simulate task processing - TTS conversion
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    log(`✅ Task completed: ${task.taskId}`);
    return true;
    
  } catch (err) {
    log(`❌ Task processing failed: ${err.message}`);
    return false;
  }
};

// Main task processing loop - Fast 3 second polling
const processTasks = async () => {
  try {
    log('🚀 Starting task processor with fast polling...');
    
    while (true) {
      // Get task from server
      const task = await getTaskFromServer();
      
      if (task) {
        // Process task with allocated RAM
        const success = await processTask(task);
        
        if (success) {
          log(`🎉 Task ${task.taskId} completed successfully`);
        } else {
          log(`⚠️ Task ${task.taskId} failed`);
        }
        
        // Wait 3 seconds before next poll (fast polling)
        await new Promise(resolve => setTimeout(resolve, 3000));
      } else {
        // No task available, wait 3 seconds before retry
        log('⏳ No tasks available, checking again in 3 seconds...');
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
    
  } catch (err) {
    log(`❌ Task processor error: ${err.message}`);
    // Restart after error
    setTimeout(processTasks, 5000);
  }
};

// Start task processing
processTasks();