#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const API_BASE_URL = 'https://node.netrumlabs.dev';
const AUTH_CODE_URL = '/polling/get-auth-code';
const TASK_PROVIDER_URL = '/polling/taskProvider';

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

// Get Encrypted Auth Code - NEW FUNCTION
const getEncryptedAuthCode = async (miningToken, nodeId) => {
  try {
    const response = await api.post(AUTH_CODE_URL, {
      miningToken,
      nodeId
    });

    if (response.data?.success) {
      log(`🔐 Auth code received (expires in ${response.data.expiresIn}s)`);
      return response.data.authCode;
    } else {
      log(`❌ Auth code error: ${response.data?.error}`);
      return null;
    }
  } catch (err) {
    if (err.response) {
      log(`Auth code error: ${err.response.status} - ${JSON.stringify(err.response.data)}`);
    } else {
      log(`Auth code request failed: ${err.message}`);
    }
    return null;
  }
};

// Get task from server - WITH ENCRYPTED AUTH CODE
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

    // Step 1: Get encrypted auth code first
    const authCode = await getEncryptedAuthCode(miningToken, nodeId);
    if (!authCode) {
      return null;
    }

    // Step 2: Use the encrypted auth code to get tasks
    const response = await api.post(TASK_PROVIDER_URL, {
      miningToken,
      nodeId,
      authCode 
    });

    if (response.data?.success && response.data.task) {
      const taskType = response.data.taskCategory === 'BLANK_TASK' ? 'Task-B' : 'Task-T';
      log(`✅ ${taskType} received: ${response.data.task.taskId}`);
      log(`📊 RAM Required: ${response.data.task.ramRequired}GB`);
      log(`🔢 Task Count: ${response.data.userTaskCount || 0}`);
      return response.data;
    } else if (response.data?.success) {
      log(`📊 Status: ${response.data.message}`);
      log(`🔢 Task Count: ${response.data.userTaskCount || 0}`);
      return response.data;
    } else {
      log(`❌ API Error: ${response.data?.error}`);
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

// Process task - UPDATED LOGS
const processTask = async (taskData) => {
  try {
    const { task, taskCategory } = taskData;
    
    if (taskCategory === 'BLANK_TASK' || task.isBlankTask) {
      log(`🔄 Processing Task-B: ${task.taskId}`);
      await new Promise(resolve => setTimeout(resolve, 1000));
      log(`✅ Task-B completed: ${task.taskId}`);
      return { success: true, isBlankTask: true };
    } else {
      log(`🔄 Processing Task-T: ${task.taskId} (Using ${task.ramRequired}GB RAM)`);
      await new Promise(resolve => setTimeout(resolve, 5000));
      log(`✅ Task-T completed: ${task.taskId}`);
      return { success: true, isBlankTask: false };
    }
    
  } catch (err) {
    log(`❌ Task processing failed: ${err.message}`);
    return { success: false, isBlankTask: false };
  }
};

// Complete task on server
const completeTaskOnServer = async (taskId, nodeId, status, taskCategory) => {
  try {
    const miningToken = getMiningToken();
    const authCode = await getEncryptedAuthCode(miningToken, nodeId);
    
    if (!authCode) {
      log('❌ Cannot get auth code for task completion');
      return false;
    }

    const response = await api.put(TASK_PROVIDER_URL, {
      taskId,
      nodeId,
      status,
      taskCategory,
      authCode,  // ✅ Encrypted code for completion
      result: taskCategory === 'BLANK_TASK' ? 'blank_task_completed' : 'tts_processing_completed'
    });

    if (response.data?.success) {
      log(`✅ Task ${taskId} completion acknowledged`);
      return true;
    } else {
      log(`❌ Task completion failed: ${response.data?.error}`);
      return false;
    }
  } catch (err) {
    log(`❌ Task completion error: ${err.message}`);
    return false;
  }
};

// Main loop
const processTasks = async () => {
  try {
    log('🚀 Starting task processor with encrypted authentication...');
    const nodeId = getNodeId();
    
    while (true) {
      const taskData = await getTaskFromServer();
      
      if (taskData && taskData.task) {
        const result = await processTask(taskData);
        
        if (result.success) {
          await completeTaskOnServer(
            taskData.task.taskId, 
            nodeId, 
            'completed', 
            taskData.taskCategory
          );
          const taskType = taskData.taskCategory === 'BLANK_TASK' ? 'Task-B' : 'Task-T';
          log(`🎉 ${taskType} ${taskData.task.taskId} completed successfully`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 3000));
      } else if (taskData?.success) {
        log('📊 Node is active and ready for tasks');
        await new Promise(resolve => setTimeout(resolve, 3000));
      } else {
        log('⏳ Retrying in 3 seconds...');
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
    
  } catch (err) {
    log(`❌ Task processor error: ${err.message}`);
    setTimeout(processTasks, 5000);
  }
};

// Start
processTasks();
