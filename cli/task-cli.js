#!/usr/bin/env node
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const filePath = path.join(__dirname, '../src/task/service.js');

// If user runs --help
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
🎯  Netrum Task CLI
Usage:
  netrum-task                Start task processing
  netrum-task --help         Show this help message

Description:
  Process tasks from Netrum server using distributed node power.

Features:
  - Connects to Netrum task system
  - Processes text-to-speech tasks using 2GB RAM
  - Fast 3-second polling for new tasks
  - Automatic task completion
  - Systemd service compatible

Requirements:
  - Active Netrum node with mining token
  - System permission enabled
  - Minimum 2GB available RAM for tasks
  - Stable internet connection

Service Commands:
  sudo systemctl status netrum-task.service    # Check service status
  sudo journalctl -u netrum-task.service -f    # View live logs
  sudo systemctl restart netrum-task.service   # Restart service
`);
  process.exit(0);
}

// Run task.js using node
spawn('node', [filePath], { stdio: 'inherit' });