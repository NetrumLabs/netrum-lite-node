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
const speedtestPath = path.join(__dirname, 'speedtest.js');
const requirementsPath = path.join(__dirname, 'requirements.js');
const speedFile = path.join(__dirname, 'speedtest.txt');

// ========== Minimum Requirements ==========
const MIN_REQUIREMENTS = {
  RAM: 4,       // GB
  DISK: 50,     // GB
  CPU: 2,       // cores
  DOWNLOAD: 10, // Mbps
  UPLOAD: 5     // Mbps
};

// ========== Helper Functions ==========
function runCommand(cmd) {
  try {
    return execSync(cmd, { stdio: 'pipe', timeout: 30000 }).toString().trim();
  } catch (e) {
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

// ========== Auto Speedtest Detection ==========
function autoSpeedTest() {
  console.log('📶 Running network speed test...');
  let result = '';
  let download = 0;
  let upload = 0;

  // 1️⃣ Try official Ookla CLI first
  result = runCommand(`speedtest --accept-license --accept-gdpr --format=json`);
  if (result) {
    try {
      const json = JSON.parse(result);
      download = (json.download.bandwidth * 8) / 1e6; // bits → Mbps
      upload = (json.upload.bandwidth * 8) / 1e6;
    } catch {
      console.log('⚠️ Error parsing Ookla JSON output');
    }
  }

  // 2️⃣ If fail or upload 0, try fast-cli
  if (!download || upload === 0) {
    console.warn('⚠️  Ookla CLI failed or upload = 0, trying fast-cli...');
    result = runCommand(`npx --yes fast-cli --upload --json`);
    if (result) {
      try {
        const json = JSON.parse(result);
        download = json.downloadSpeed || download;
        upload = json.uploadSpeed || upload;
      } catch {
        console.log('⚠️ Error parsing fast-cli output');
      }
    }
  }

  // 3️⃣ Still nothing? fallback to default safe values
  if (!download) download = 1;
  if (!upload) upload = 0.1;

  // ✅ Always save results to speedtest.txt
  fs.writeFileSync(speedFile, `${download.toFixed(2)} ${upload.toFixed(2)}`);

  console.log(`✅ Speed Test Completed — Download: ${download.toFixed(2)} Mbps, Upload: ${upload.toFixed(2)} Mbps`);
  console.log(`💾 Results saved to: ${speedFile}`);

  return { download, upload };
}

// ========== Continuous Speed Test ==========
function startContinuousSpeedTest() {
  console.log('🔄 Starting continuous speed test (every 3 seconds)...');
  
  // Initial test
  autoSpeedTest();
  
  // Continuous test every 3 seconds
  setInterval(() => {
    autoSpeedTest();
  }, 3000);
}

// ========== Power Score Calculation ==========
function calculatePowerScore(download, upload) {
  const cpuCores = os.cpus().length;
  const totalRAM = os.totalmem() / (1024 ** 3); // GB
  const availableDisk = diskusage.checkSync('/').available / (1024 ** 3); // GB
  const freeDiskRounded = Math.floor(availableDisk);

  const power = {
    cpu: Math.min(cpuCores * 10, 40),
    ram: Math.min(totalRAM * 15, 60),
    disk: Math.min(freeDiskRounded * 0.2, 40),
    network: Math.min(download * 2 + upload * 1, 50),
    get total() {
      return this.cpu + this.ram + this.disk + this.network;
    }
  };

  return {
    ...power,
    cpuCores,
    totalRAM: totalRAM.toFixed(1),
    freeDisk: freeDiskRounded,
    download,
    upload
  };
}

// ========== Main System Check ==========
async function fullSystemCheck() {
  console.log('\n🔍 Starting Full System Check...\n');

  // Step 1: Start continuous speed monitoring
  console.log('📶 [1/3] Starting Continuous Speed Monitoring...');
  startContinuousSpeedTest();

  // Step 2: System requirements
  console.log('\n🧠 [2/3] Checking Minimum System Requirements...');
  runScript(requirementsPath);

  // Step 3: Power score (using latest speed data)
  console.log('\n⚡ [3/3] Calculating Node Power Score...');
  
  // Read latest speed from file
  let download, upload;
  try {
    const speedData = fs.readFileSync(speedFile, 'utf8').trim();
    [download, upload] = speedData.split(' ').map(parseFloat);
  } catch {
    // Fallback if file not ready
    download = 1;
    upload = 0.1;
  }
  
  const power = calculatePowerScore(download, upload);

  console.log(`\n📊 Power Breakdown:`);
  console.log(`- CPU Power     : ${power.cpu} (${power.cpuCores} cores)`);
  console.log(`- RAM Power     : ${power.ram} (${power.totalRAM} GB)`);
  console.log(`- Disk Power    : ${power.disk} (${power.freeDisk} GB Available)`);
  console.log(`- Network Power : ${power.network} (${power.download}↓ / ${power.upload}↑ Mbps)`);

  console.log(`\n🚀 TOTAL POWER SCORE: ${power.total} / 190\n`);

  if (power.total < 100) {
    console.log('❌  System does not meet the minimum power requirement of 100.');
    process.exit(1);
  } else {
    console.log('✅  All checks passed! System is ready for Netrum Lite Node operation.');
    console.log('📊  Speed test will continue running every 3 seconds...');
  }
}

// ========== Start ==========
fullSystemCheck().catch(err => {
  console.error('❌ Unexpected error:', err.message);
});
