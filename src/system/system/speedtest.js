#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outputFile = path.join(__dirname, 'speedtest.txt');
const fallbackTestURL = 'https://proof.ovh.net/files/10Mb.dat';
const tempFilePath = path.join(__dirname, 'temp_test_file');
const MIN_SPEED = 5; // Mbps threshold

console.log("🌐 Checking Internet Speed...");

async function runSpeedTest() {
  let download = 0;
  let upload = 0;

  // 🥇 Try Ookla speedtest CLI
  try {
    console.log("📡 Running official Ookla speedtest...");
    const result = execSync("speedtest --accept-license --accept-gdpr --format=json", { timeout: 45000 }).toString();
    const data = JSON.parse(result);

    download = (data.download?.bandwidth || 0) * 8 / 1e6;
    upload = (data.upload?.bandwidth || 0) * 8 / 1e6;

    console.log(`⬇️  Download: ${download.toFixed(2)} Mbps`);
    console.log(`⬆️  Upload  : ${upload.toFixed(2)} Mbps`);
  } catch {
    console.log("⚠️  Ookla CLI failed. Trying fast-cli...");
  }

  // 🥈 Try fast-cli if Ookla failed or upload 0
  if (!download || upload === 0) {
    try {
      const fast = execSync("npx --yes fast-cli --upload --json", { timeout: 40000 }).toString();
      const json = JSON.parse(fast);
      // fast-cli output is already in Mbps
      download = json.downloadSpeed || download;
      upload = json.uploadSpeed || upload;

      console.log(`⬇️  Download: ${download.toFixed(2)} Mbps (fast.com)`);
      console.log(`⬆️  Upload  : ${upload.toFixed(2)} Mbps (fast.com)`);
    } catch {
      console.log("⚠️  fast-cli failed. Trying manual download test...");
    }
  }

  // 🥉 Manual fallback if both fail
  if (!download) {
    try {
      console.log("📥 Performing manual download test...");
      const start = Date.now();
      const file = fs.createWriteStream(tempFilePath);

      await new Promise((resolve, reject) => {
        https.get(fallbackTestURL, (res) => {
          res.pipe(file);
          res.on("error", reject);
          file.on("finish", () => file.close(resolve));
        }).on("error", reject);
      });

      const elapsed = (Date.now() - start) / 1000;
      const fileSize = fs.statSync(tempFilePath).size;
      fs.unlinkSync(tempFilePath);

      download = ((fileSize * 8) / 1e6) / elapsed;
      console.log(`⬇️  Approx Download: ${download.toFixed(2)} Mbps`);
      console.log("⬆️  Upload: Skipped (manual test)");
      upload = 0;
    } catch (err) {
      console.error("❌ Manual fallback also failed:", err.message);
    }
  }

  // Final result output
  if (!download) download = 0;
  if (!upload) upload = 0;

  fs.writeFileSync(outputFile, `${download.toFixed(2)} ${upload.toFixed(2)}`);

  console.log(`\n💾 Saved Results → ${outputFile}`);
  console.log(`⬇️  Download Speed : ${download.toFixed(2)} Mbps`);
  console.log(`⬆️  Upload Speed   : ${upload.toFixed(2)} Mbps`);

  if (download < MIN_SPEED || upload < MIN_SPEED) {
    console.warn(`⚠️  Warning: Download or Upload speed is below ${MIN_SPEED} Mbps`);
  } else {
    console.log("✅ Internet speed check passed successfully!");
  }

  return { download, upload };
}

// Run
runSpeedTest().catch(err => {
  console.error("❌ Unexpected error:", err.message);
  process.exit(1);
});
