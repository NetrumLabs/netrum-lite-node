#!/usr/bin/env node
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

// Get current directory
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

// Self-update function with commit details
async function checkForUpdates() {
  try {
    console.log('🔁 Checking for updates...');
    
    // First fetch updates quietly
    execSync('git fetch origin main', { cwd: projectRoot, stdio: 'ignore' });
    
    // Get commit information
    const getCommit = (ref) => execSync(`git rev-parse ${ref}`, { 
      cwd: projectRoot 
    }).toString().trim();
    
    const currentCommit = getCommit('HEAD');
    const remoteCommit = getCommit('origin/main');

    if (currentCommit === remoteCommit) {
      console.log('✅ Already up-to-date');
      return;
    }

    // Get formatted commit log
    const commitLog = execSync(
      `git log --pretty=format:"%C(yellow)%h%Creset - %s %Cgreen(%an, %cr)%Creset" ${currentCommit}..${remoteCommit}`,
      { cwd: projectRoot }
    ).toString();

    // Perform the pull
    console.log('\n📥 Pulling updates...');
    const pullOutput = execSync('git pull origin main', { 
      cwd: projectRoot 
    }).toString();
    console.log(pullOutput.trim());

    // Show what's new
    console.log('\n✨ New updates:');
    console.log(commitLog);

    // Check for package.json changes
    if (pullOutput.includes('package.json')) {
      console.log('\n📦 Installing dependencies...');
      execSync('npm install', { 
        cwd: projectRoot,
        stdio: 'inherit' 
      });
    }

  } catch (error) {
    console.log('⚠️ Update check failed:', error.message);
  }
}

// Main function
async function main() {
  await checkForUpdates();
  console.log('\n🚀 Starting Netrum Node...');
  // ... rest of your application
}

main().catch(console.error);
