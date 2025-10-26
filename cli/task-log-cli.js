#!/usr/bin/env node
import { spawn } from 'child_process';

// Check for --help flag
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
🎯 Netrum Task Log Viewer

Usage:
  netrum-task-log       View live task logs
  netrum-task-log --help  Show this help

Description:
  Displays real-time task processing logs from your Netrum node.
  Shows task assignments, processing status, and performance metrics.
  
  This connects to systemd's journalctl to show:
  - Task assignment and completion status (Task-T & Task-B)
  - RAM usage and allocation details
  - API connection status
  - Processing errors and retries
  - Task count updates

Live Logs Include:
  ✅ Task-T received (2GB RAM) - Real processing tasks
  ✅ Task-B received (1GB RAM) - Blank tasks  
  🔄 Task processing status
  ⏳ No task available messages
  ❌ API connection errors
  📊 Performance metrics
  🔢 Task count updates

Service: netrum-task.service
`);
  process.exit(0);
}

// Run journalctl to view netrum-task.service logs
console.log('📊 Starting Netrum Task Log Viewer...');
console.log('👀 Watching: netrum-task.service');
console.log('────────────────────────────────────');

const journalctl = spawn('journalctl', [
  '-u', 'netrum-task.service',
  '-f',  // follow mode
  '-n', '50',  // show last 50 lines initially
  '--no-pager'  // don't use a pager
]);

// Pipe output to console
journalctl.stdout.pipe(process.stdout);
journalctl.stderr.pipe(process.stderr);

// Handle exit
journalctl.on('close', (code) => {
  if (code !== 0) {
    console.log(`\n❌ Journalctl exited with code ${code}`);
    console.log('💡 Check if netrum-task.service is running:');
    console.log('   sudo systemctl status netrum-task.service');
  }
  process.exit(code);
});

// Handle errors
journalctl.on('error', (err) => {
  console.log(`\n❌ Failed to start journalctl: ${err.message}`);
  console.log('💡 Make sure systemd is available on your system');
  process.exit(1);
});