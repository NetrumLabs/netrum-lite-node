#!/usr/bin/env node
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const filePath = path.join(__dirname, '../src/task/task.js');

// If user runs --help
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
🎯  Netrum TTS Task CLI
Usage:
  netrum-tts-task                Start TTS task processing
  netrum-tts-task --help         Show this help message

Description:
  Process TTS tasks from Netrum server using distributed node power.

Features:
  - Connects to Netrum TTS task system
  - Processes text-to-speech tasks using 2GB RAM
  - Fast 3-second polling for new tasks
  - Automatic task completion
  - Systemd service compatible

Requirements:
  - Active Netrum node with mining token
  - System permission enabled
  - Minimum 2GB available RAM for TTS tasks
  - Stable internet connection

Service Commands:
  sudo systemctl status netrum-tts.service    # Check service status
  sudo journalctl -u netrum-tts.service -f    # View live logs
  sudo systemctl restart netrum-tts.service   # Restart service
`);
  process.exit(0);
}

// Run task.js using node
spawn('node', [filePath], { stdio: 'inherit' });