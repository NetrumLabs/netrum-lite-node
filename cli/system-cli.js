#!/usr/bin/env node
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const filePath = path.join(__dirname, '../src/system/system/service-installer.js');

// If user runs --help
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
??️  Netrum Node System Checker

Usage:
  netrum-system              Run system requirement check
  netrum-system --help       Show this help message

Description:
  Minimum system requirements for running a Netrum Lite Node:

  ✅  4 GB RAM  
  ✅  2 Core CPU  
  ✅  50 GB Disk  
  ✅  10 Mbps Download & Upload Internet Speed
`);
  process.exit(0);
}

// Run system.js using node
spawn('node', [filePath], { stdio: 'inherit' });
