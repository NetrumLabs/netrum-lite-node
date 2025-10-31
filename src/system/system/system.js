#!/usr/bin/env node

import { execSync, spawn } from 'child_process';
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
  DOWNLOAD: 5,  // Mbps
  UPLOAD: 5     // Mbps
};

// ========== Improved Helper Functions ==========
function runCommand(cmd, timeout = 45000) {
  try {
    return execSync(cmd, { 
      stdio: 'pipe', 
      timeout: timeout,
      encoding: 'utf8'
    }).toString().trim();
  } catch (e) {
    console.log(`Command failed: ${cmd}`, e.message);
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

// ========== IMPROVED Speedtest with Better Timeout ==========
function autoSpeedTest() {
  console.log('📶 Running network speed test...');
  let download = 0;
  let upload = 0;
  let success = false;

  // 1️⃣ Try official Ookla CLI with longer timeout
  console.log('🔧 Trying Ookla speedtest...');
  let result = runCommand(`speedtest --accept-license --accept-gdpr --format=json`, 60000);
  
  if (result) {
    try {
      const json = JSON.parse(result);
      download = (json.download.bandwidth * 8) / 1e6; // bits → Mbps
      upload = (json.upload.bandwidth * 8) / 1e6;
      console.log(`✅ Ookla Result: ${download.toFixed(2)}↓ / ${upload.toFixed(2)}↑ Mbps`);
      success = true;
    } catch (parseError) {
      console.log('⚠️ Error parsing Ookla JSON, trying alternative...');
    }
  }

  // 2️⃣ If Ookla fails, try fast-cli with longer timeout
  if (!success || download === 0 || upload === 0) {
    console.log('🔄 Trying fast-cli as backup...');
    result = runCommand(`npx --yes fast-cli --upload --json --timeout 45000`, 60000);
    
    if (result) {
      try {
        const json = JSON.parse(result);
        download = json.downloadSpeed || download;
        upload = json.uploadSpeed || upload;
        console.log(`✅ Fast-cli Result: ${download.toFixed(2)}↓ / ${upload.toFixed(2)}↑ Mbps`);
        success = true;
      } catch (parseError) {
        console.log('⚠️ Error parsing fast-cli output');
      }
    }
  }

  // 3️⃣ Final fallback - direct speedtest command without JSON
  if (!success || download === 0 || upload === 0) {
    console.log('🔄 Trying direct speedtest command...');
    try {
      result = runCommand(`speedtest --accept-license --accept-gdpr`, 60000);
      if (result) {
        // Parse the text output
        const lines = result.split('\n');
        for (const line of lines) {
          if (line.includes('Download:') && line.includes('Mbit/s')) {
            const match = line.match(/Download:\s+([\d.]+)\s+Mbit\/s/);
            if (match) download = parseFloat(match[1]);
          }
          if (line.includes('Upload:') && line.includes('Mbit/s')) {
            const match = line.match(/Upload:\s+([\d.]+)\s+Mbit\/s/);
            if (match) upload = parseFloat(match[1]);
          }
        }
        console.log(`✅ Direct Result: ${download.toFixed(2)}↓ / ${upload.toFixed(2)}↑ Mbps`);
        success = true;
      }
    } catch (error) {
      console.log('⚠️ Direct speedtest also failed');
    }
  }

  // 4️⃣ Ultimate fallback to minimum values
  if (!success || download === 0) {
    download = 1;
    upload = 0.1;
    console.log('⚠️ Using minimum fallback speeds');
  }

  // ✅ Save results
  fs.writeFileSync(speedFile, `${download.toFixed(2)} ${upload.toFixed(2)}`);
  console.log(`💾 Results saved: ${download.toFixed(2)}↓ / ${upload.toFixed(2)}↑ Mbps`);

  return { download, upload };
}

// ========== Continuous Speed Test ==========
function startContinuousSpeedTest() {
  console.log('🔄 Starting continuous speed test (every 30 seconds)...');
  
  // Initial test
  autoSpeedTest();
  
  // Continuous test every 30 seconds (reduced frequency)
  setInterval(() => {
    console.log('🔄 Running scheduled speed test...');
    autoSpeedTest();
  }, 30000);
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

  // Step 1: Network test with auto fallback
  console.log('📶 [1/3] Checking Internet Speed...');
  const { download, upload } = autoSpeedTest();

  // Step 2: System requirements
  console.log('\n🧠 [2/3] Checking Minimum System Requirements...');
  runScript(requirementsPath);

  // Step 3: Power score
  console.log('\n⚡ [3/3] Calculating Node Power Score...');
  const power = calculatePowerScore(download, upload);

  console.log(`\n📊 Power Breakdown:`);
  console.log(`- CPU Power     : ${power.cpu} (${power.cpuCores} cores)`);
  console.log(`- RAM Power     : ${power.ram} (${power.totalRAM} GB)`);
  console.log(`- Disk Power    : ${power.disk} (${power.freeDisk} GB Available)`);
  console.log(`- Network Power : ${power.network} (${power.download}↓ / ${power.upload}↑ Mbps)`);

  console.log(`\n🚀 TOTAL POWER SCORE: ${power.total} / 190\n`);

  if (power.total < 100) {
    console.log('❌ System does not meet the minimum power requirement of 100.');
    process.exit(1);
  } else {
    console.log('✅ All checks passed! System is ready for Netrum Lite Node operation.');
    console.log('📊 Speed test will continue running every 30 seconds...');
    
    // Start continuous monitoring after successful check
    startContinuousSpeedTest();
  }
}

// ========== Start ==========
fullSystemCheck().catch(err => {
  console.error('❌ Unexpected error:', err.message);
  process.exit(1);
});
