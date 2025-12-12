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

// Interval (5 minutes = ZERO rate limit issues)
const SYNC_INTERVAL = 302000; 

// Axios settings
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 302000, // 300 sec timeout
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

// Logging function with light emoji
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

  // fallback
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
  } catch (err) {
    log(`❌ Node ID read failed: ${err.message}`);
    return null;
  }
};

// ------------------------
// COUNTDOWN TIMER (Every 50 sec update)
// ------------------------
let countdown = SYNC_INTERVAL / 1000;

const startCountdown = () => {
  countdown = SYNC_INTERVAL / 1000;
  const timer = setInterval(() => {
    countdown -= 50;
    if (countdown <= 0) {
      clearInterval(timer);
    } else {
      log(`⏳ Next sync in ${countdown} seconds...`);
    }
  }, 50000);
};

// ------------------------
// MAIN SYNC FUNCTION
// ------------------------
const syncNode = async () => {
  try {
    const nodeId = readNodeId();
    if (!nodeId) {
      log("❌ No Node ID found");
      return;
    }

    log(`🧩 Node ID: ${nodeId}`);

    const metrics = getSystemMetrics();
    if (!metrics) {
      log("❌ Metrics load failed");
      return;
    }

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

      if (response.data.miningToken) {
        saveToken(response.data.miningToken);
        log("🎉 Mining token received!");
      } else {
        log("ℹ️ No mining token this time");
      }

      if (response.data.log) log(`📘 Server: ${response.data.log}`);
    } else {
      log(`⚠️ Sync failed: ${response.data?.error || "Unknown"}`);
    }
  } catch (err) {
    if (err.response) {
      const s = err.response.status;
      const d = err.response.data;

      if (s === 429) {
        const t = d?.detail?.remainingMs
          ? Math.round(d.detail.remainingMs / 1000)
          : 60;
        log(`⛔ Rate limited — wait ${t} seconds`);
      } else if (s === 404) {
        log("❌ Node not registered");
      } else if (s === 403) {
        log("🔐 Permission denied");
      } else if (s === 500) {
        log(`🔥 Server Error 500: ${JSON.stringify(d)}`);
      } else {
        log(`⚠️ Server error ${s}: ${JSON.stringify(d)}`);
      }
    } else if (err.code === "ECONNABORTED") {
      log("⏳ Request timeout — retrying next cycle");
    } else {
      log(`❌ Error: ${err.message}`);
    }
  }
};

// ------------------------
// START SERVICE
// ------------------------
const startService = () => {
  log("🚀 Starting Netrum Node Sync Service");
  log(`🔁 Sync interval: ${SYNC_INTERVAL / 1000} seconds`);

  // Initial sync after 10 sec
  setTimeout(() => {
    syncNode();
    startCountdown();
  }, 10000);

  // Regular sync loop
  setInterval(() => {
    syncNode();
    startCountdown();
  }, SYNC_INTERVAL);

  process.on("SIGTERM", () => process.exit(0));
  process.on("SIGINT", () => process.exit(0));
};

startService();
