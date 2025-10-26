#!/usr/bin/env node
import { spawn } from 'child_process';

// Check for --help flag
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
🎯 Netrum TTS Task Log Viewer

Usage:
  netrum-tts-log       View live TTS task logs
  netrum-tts-log --help  Show this help

Description:
  Displays real-time TTS task processing logs from your Netrum node.
  Shows task assignments, processing status, and performance metrics.
  
  This connects to systemd's journalctl to show:
  - Task assignment and completion status
  - RAM usage and allocation details
  - API connection status
  - Processing errors and retries

Live Logs Include:
  ✅ Task received with RAM requirements
  🔄 Task processing status
  ⏳ No task available messages
  ❌ API connection errors
  📊 Performance metrics

Service: netrum-tts.service
`);
  process.exit(0);
}

// Run journalctl to view netrum-tts.service logs
const journalctl = spawn('journalctl', [
  '-u', 'netrum-tts.service',
  '-f',  // follow mode
  '-n', '50',  // show last 50 lines initially
  '--no-pager'  // don't use a pager
]);

// Pipe output to console
journalctl.stdout.pipe(process.stdout);
journalctl.stderr.pipe(process.stderr);

// Handle exit
journalctl.on('close', (code) => {
  process.exit(code);
});