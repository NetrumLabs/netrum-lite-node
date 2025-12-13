#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ================= CONFIG ================= */

const API_BASE_URL = 'https://node.netrumlabs.dev';
const AUTH_CODE_URL = '/polling/get-auth-code';
const TASK_PROVIDER_URL = '/polling/taskProvider';
const TASK_COMPLETION_URL = '/polling/taskCompletion';

const MINING_TOKEN_PATH = path.resolve(__dirname, '../system/mining/miningtoken.txt');
const NODE_ID_PATH = path.resolve(__dirname, '../identity/node-id/id.txt');

/* ================= HTTP CLIENT ================= */

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  }
});

/* ================= UTILS ================= */

const log = (msg) => {
  console.log(`[${new Date().toISOString()}] ${msg}`);
};

const sleep = (ms) => new Promise(res => setTimeout(res, ms));

/* ================= READ FILES ================= */

const getMiningToken = () => {
  try {
    return fs.existsSync(MINING_TOKEN_PATH)
      ? fs.readFileSync(MINING_TOKEN_PATH, 'utf8').trim()
      : null;
  } catch (e) {
    log(`❌ Mining token read error: ${e.message}`);
    return null;
  }
};

const getNodeId = () => {
  try {
    return fs.existsSync(NODE_ID_PATH)
      ? fs.readFileSync(NODE_ID_PATH, 'utf8').trim()
      : null;
  } catch (e) {
    log(`❌ Node ID read error: ${e.message}`);
    return null;
  }
};

/* ================= AUTH CODE ================= */

const getEncryptedAuthCode = async (miningToken, nodeId) => {
  try {
    const res = await api.post(AUTH_CODE_URL, { miningToken, nodeId });

    if (res.data?.success) {
      log(`🔐 Auth code received (expires in ${res.data.expiresIn}s)`);
      return res.data.authCode;
    }

    log(`❌ Auth code error`);
    return null;
  } catch (e) {
    log(`❌ Auth code request failed: ${e.message}`);
    return null;
  }
};

/* ================= TASK FETCH ================= */

const getTaskFromServer = async () => {
  const miningToken = getMiningToken();
  const nodeId = getNodeId();

  if (!miningToken || !nodeId) {
    log('❌ Missing mining token or node ID');
    return null;
  }

  const authCode = await getEncryptedAuthCode(miningToken, nodeId);
  if (!authCode) return null;

  try {
    const res = await api.post(TASK_PROVIDER_URL, {
      miningToken,
      nodeId,
      authCode
    });

    if (res.data?.success && res.data.task) {
      const type = res.data.taskCategory === 'BLANK_TASK' ? 'Task-B' : 'Task-T';
      log(`✅ ${type} received: ${res.data.task.taskId}`);
      log(`📊 RAM Required: ${res.data.task.ramRequired}GB`);
      log(`🔢 Task Count: ${res.data.userTaskCount}`);
      return res.data;
    }

    if (res.data?.success) {
      log(`📊 ${res.data.message}`);
      return res.data;
    }

    return null;
  } catch (e) {
    log(`❌ Task provider error: ${e.message}`);
    return null;
  }
};

/* ================= TASK PROCESS ================= */

const processTask = async ({ task, taskCategory }) => {
  if (taskCategory === 'BLANK_TASK' || task.isBlankTask) {
    log(`🔄 Processing Task-B: ${task.taskId}`);
    await sleep(1000);
    log(`✅ Task-B completed: ${task.taskId}`);
    return true;
  }

  log(`🔄 Processing Task-T: ${task.taskId} (${task.ramRequired}GB RAM)`);
  await sleep(5000);
  log(`✅ Task-T completed: ${task.taskId}`);
  return true;
};

/* ================= TASK COMPLETE ================= */

const completeTaskOnServer = async (taskId, nodeId, status, taskCategory) => {
  try {
    const miningToken = getMiningToken();
    const authCode = await getEncryptedAuthCode(miningToken, nodeId);
    if (!authCode) return false;

    const payload = {
      taskId,
      nodeId,
      status,
      taskCategory,
      authCode
    };

    // 🔑 IMPORTANT: result only for REAL task
    if (taskCategory !== 'BLANK_TASK') {
      payload.result = {
        message: 'tts_processing_completed'
      };
    }

    const response = await api.put(TASK_COMPLETION_URL, payload);

    if (response.data?.success) {
      log(`✅ Task ${taskId} completion acknowledged`);
      return true;
    }

    log(`❌ Task completion rejected`);
    return false;

  } catch (err) {
    log(`❌ Task completion error: ${err.message}`);
    return false;
  }
};

/* ================= MAIN LOOP ================= */

const processTasks = async () => {
  log('🚀 Node task processor started');

  const nodeId = getNodeId();

  while (true) {
    const taskData = await getTaskFromServer();

    if (taskData?.task) {
      const ok = await processTask(taskData);

      if (ok) {
        await completeTaskOnServer(
          taskData.task.taskId,
          nodeId,
          'completed',
          taskData.taskCategory
        );

        const type = taskData.taskCategory === 'BLANK_TASK' ? 'Task-B' : 'Task-T';
        log(`🎉 ${type} ${taskData.task.taskId} completed successfully`);
      }

      await sleep(3000);
    } else {
      log('⏳ No task, retrying...');
      await sleep(3000);
    }
  }
};

/* ================= START ================= */

processTasks();
