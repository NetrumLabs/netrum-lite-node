#!/usr/bin/env node
import fs from "fs";
import path from "path";
import axios from "axios";
import os from "os";
import diskusage from "diskusage";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// API CONFIG
const API_BASE_URL = "https://node.netrumlabs.dev";
const SYNC_ENDPOINT = "/metrics/sync";
const TOKEN_PATH = path.resolve(__dirname, "../mining/miningtoken.txt");
const SPEED_FILE = path.resolve(__dirname, "../system/speedtest.txt");

// DEFAULT interval (fallback = 5 min)
const DEFAULT_SYNC_INTERVAL = 300000; 
let dynamicInterval = DEFAULT_SYNC_INTERVAL;

// Axios settings
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 310000, // safe timeout
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

// Logging
const log = (msg) => {
  console.log(`🕒 [${new Date().toISOString()}] ${msg}`);
};

// ------------------------
// READ SPEEDTEST FILE
// ------------------------
const getSpeedFromFile = () => {
  try {
    if (fs.existsSync(SPEED_FILE)) {
      const text = fs.readFileSync(SPEED_FILE, "utf8").trim();
      const [download, upload] = text.split(/\s+/).map(parseFloat);

      if (download > 0 && upload > 0) {
        return { download, upload };
      }
    }
  } catch (e) {
    log(`⚠️ Speed file error: ${e.message}`);
  }

  return { download: 1, upload: 0.1 };
};

// ------------------------
// SYSTEM METRICS
// ------------------------
const getSystemMetrics = () => {
  try {
    const { download, upload } = getSpeedFromFile();
    const freeDiskGB = Math.round(diskusage.checkSync("/").free / 1_073_741_824);

    return {
      cpu: os.cpus().length,
      ram: Math.round(os.totalmem() / (1024 ** 2)),
      disk: freeDiskGB,
      speed: download,
      uploadSpeed: upload,
      lastSeen: Math.floor(Date.now() / 1000),
      systemPermission: true,
    };
  } catch (err) {
    log(`❌ Metrics error: ${err.message}`);
    return null;
  }
};

// ------------------------
// SAVE TOKEN
// ------------------------
const saveToken = (token) => {
  try {
    fs.mkdirSync(path.dirname(TOKEN_PATH), { recursive: true });
    fs.writeFileSync(TOKEN_PATH, token);
    log(`🔑 Mining token saved (${token.length} chars)`);
  } catch (err) {
    log(`❌ Token save failed: ${err.message}`);
  }
};

// ------------------------
// READ NODE ID
// ------------------------
const readNodeId = () => {
  try {
    return fs.readFileSync(
      "/root/netrum-lite-node/src/identity/node-id/id.txt",
      "utf8"
    ).trim();
  } catch {
    log("❌ Node ID read failed");
    return null;
  }
};

// ------------------------
// COUNTDOWN TIMER
// ------------------------
let countdown = DEFAULT_SYNC_INTERVAL / 1000;

const startCountdown = (intervalMs) => {
  countdown = Math.round(intervalMs / 1000);

  const timer = setInterval(() => {
    countdown -= 30;
    if (countdown <= 0) {
      clearInterval(timer);
    } else {
      log(`⏳ Next sync in ${countdown} seconds...`);
    }
  }, 30000);
};

// ------------------------
// MAIN SYNC FUNCTION
// ------------------------
const syncNode = async () => {
  try {
    const nodeId = readNodeId();
    if (!nodeId) return;

    log(`🧩 Node ID: ${nodeId}`);

    const metrics = getSystemMetrics();
    if (!metrics) return;

    const isActive =
      metrics.cpu >= 2 &&
      metrics.ram >= 4096 &&
      metrics.disk >= 50 &&
      metrics.speed >= 5 &&
      metrics.uploadSpeed >= 5;

    log(`💡 System Status: ${isActive ? "ACTIVE 🟢" : "INACTIVE 🔴"}`);

    const payload = {
      nodeId,
      nodeMetrics: metrics,
      syncStatus: isActive ? "Active" : "InActive",
      systemPermission: true,
    };

    log("📡 Sending sync request to server...");
    const response = await api.post(SYNC_ENDPOINT, payload);

    if (response.data?.success) {
      log(`✅ Sync Success — Status: ${response.data.syncStatus}`);

      // Save token if exists
      if (response.data.miningToken) {
        saveToken(response.data.miningToken);
        log("🎉 Mining token received!");
      }

      // ---------- DYNAMIC INTERVAL LOGIC ----------
      const now = Date.now();
      const nextAllowed = response.data?.nextSyncAllowed;

      if (nextAllowed && nextAllowed > now) {
        dynamicInterval = nextAllowed - now + 2000; // extra 2 second buffer
        log(`⏳ Dynamic next sync after ${Math.round(dynamicInterval / 1000)} sec`);
      } else {
        dynamicInterval = DEFAULT_SYNC_INTERVAL;
      }
      // --------------------------------------------

      if (response.data.log) log(`📘 Server: ${response.data.log}`);
    }

  } catch (err) {
    log(`❌ Sync error: ${err?.response?.status || err.message}`);
    dynamicInterval = DEFAULT_SYNC_INTERVAL; // fallback
  }
};

// ------------------------
// DYNAMIC LOOP
// ------------------------
const runDynamicLoop = async () => {
  await syncNode();
  startCountdown(dynamicInterval);
  setTimeout(runDynamicLoop, dynamicInterval);
};

// ------------------------
// START SERVICE
// ------------------------
const startService = () => {
  log("🚀 Starting Netrum Node Sync Service (Dynamic Mode)");

  // First sync after 10 sec
  setTimeout(runDynamicLoop, 10000);

  process.on("SIGTERM", () => process.exit(0));
  process.on("SIGINT", () => process.exit(0));
};

startService();
