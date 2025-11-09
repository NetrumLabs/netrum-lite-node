#!/usr/bin/env node

import { execSync } from 'child_process';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import diskusage from 'diskusage';

// ========== Path Setup ==========
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const speedFile = path.join(__dirname, 'speedtest.txt');
const logFile = path.join(__dirname, 'speedtest_log.txt');
const requirementsPath = path.join(__dirname, 'requirements.js');

// ========== Minimum Requirements ==========
const MIN_REQUIREMENTS = {
  RAM: 4,       // GB
  DISK: 50,     // GB
  CPU: 2,       // cores
  DOWNLOAD: 5,  // Mbps
  UPLOAD: 5     // Mbps
};

// ========== Helper ==========
function runCommand(cmd, timeout = 60000) {
  try {
    return execSync(cmd, { stdio: 'pipe', timeout, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function runScript(scriptPath) {
  try {
    execSync(`node ${scriptPath}`, { stdio: 'inherit' });
  } catch (err) {
    console.error(`❌ Error running ${scriptPath}:`, err.message);
    process.exit(1);
  }
}

// ========== Auto Speed Test ==========
function autoSpeedTest() {
  console.log(`\n📶 Running Network Speed Test at ${new Date().toLocaleString()}`);
  let download = 0;
  let upload = 0;
  let success = false;

  const result = runCommand(`speedtest --accept-license --accept-gdpr --format=json`);
  const timestamp = new Date().toLocaleString();

  if (result) {
    try {
      const json = JSON.parse(result);
      download = (json.download?.bandwidth * 8) / 1e6 || 0;
      upload = (json.upload?.bandwidth * 8) / 1e6 || 0;
      if (download > 0 && upload > 0) success = true;
    } catch (e) {
      console.log('⚠️ JSON parse failed:', e.message);
    }
  }

  // Load old values if failed
  let oldData = "1 0.1";
  if (fs.existsSync(speedFile)) {
    oldData = fs.readFileSync(speedFile, 'utf8').trim() || oldData;
  }

  // Handle failure
  if (!success) {
    console.log('⚠️ Speedtest failed, keeping old values.');
    const [oldD, oldU] = oldData.split(' ');
    download = parseFloat(oldD);
    upload = parseFloat(oldU);
  }

  // Save numeric values only
  const numericLine = `${download.toFixed(2)} ${upload.toFixed(2)}\n`;
  const logLine = `[${timestamp}] Download: ${download.toFixed(2)} Mbps | Upload: ${upload.toFixed(2)} Mbps\n`;

  fs.writeFileSync(speedFile, numericLine);
  fs.appendFileSync(logFile, logLine);

  console.log(`✅ Saved to speed.txt → ${download.toFixed(2)}↓ / ${upload.toFixed(2)}↑ Mbps`);
  return { download, upload };
}

// ========== Continuous Speed Test ==========
function startContinuousSpeedTest() {
  console.log('\n🔁 Continuous speed test running every 1 minute...');
  autoSpeedTest();
  setInterval(autoSpeedTest, 60000);
}

// ========== Power Score ==========
function calculatePowerScore(download, upload) {
  const cpuCores = os.cpus().length;
  const totalRAM = os.totalmem() / (1024 ** 3);
  const availableDisk = diskusage.checkSync('/').available / (1024 ** 3);
  const freeDiskRounded = Math.floor(availableDisk);

  const power = {
    cpu: Math.min(cpuCores * 10, 40),
    ram: Math.min(totalRAM * 15, 60),
    disk: Math.min(freeDiskRounded * 0.2, 40),
    network: Math.min(download * 2 + upload, 50),
  };

  const total = power.cpu + power.ram + power.disk + power.network;
  return {
    ...power,
    total,
    cpuCores,
    totalRAM: totalRAM.toFixed(1),
    freeDisk: freeDiskRounded,
    download,
    upload
  };
}

// ========== Full System Check ==========
async function fullSystemCheck() {
  console.log('\n🔍 Starting Full System Check...\n');

  // Step 1: Speed Test
  const { download, upload } = autoSpeedTest();

  // Step 2: Requirements
  console.log('\n🧠 Checking System Requirements...');
  runScript(requirementsPath);

  // Step 3: Power Score
  console.log('\n⚡ Calculating Node Power...');
  const power = calculatePowerScore(download, upload);

  console.log(`\n📊 Power Breakdown:`);
  console.log(`- CPU Power     : ${power.cpu} (${power.cpuCores} cores)`);
  console.log(`- RAM Power     : ${power.ram} (${power.totalRAM} GB)`);
  console.log(`- Disk Power    : ${power.disk} (${power.freeDisk} GB Free)`);
  console.log(`- Network Power : ${power.network} (${power.download.toFixed(2)}↓ / ${power.upload.toFixed(2)}↑ Mbps)`);
  console.log(`\n🚀 TOTAL POWER SCORE: ${power.total} / 190\n`);

  if (power.total < 100) {
    console.log('❌ System does not meet the minimum power requirement (100).');
    process.exit(1);
  } else {
    console.log('✅ System ready for Netrum Lite Node operation.');
    startContinuousSpeedTest();
  }
}

// ========== Start ==========
fullSystemCheck().catch(err => {
  console.error('❌ Unexpected error:', err.message);
  process.exit(1);
});
