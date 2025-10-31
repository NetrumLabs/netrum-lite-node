
#!/usr/bin/env node
import { spawn } from 'child_process';

// Check for --help flag
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
🎯 Netrum System Service Live Log Viewer

Usage:
  netrum-system-log       View live system service logs
  netrum-system-log --help  Show this help

Description:
  Displays real-time system monitoring logs from Netrum Node System Service.
  Shows continuous speed tests, system metrics, and health status.
  
  This connects to systemd's journalctl to show:
  - Continuous speed test results (every 3 seconds)
  - System resource monitoring (CPU, RAM, Disk)
  - Power score calculations
  - Network connectivity status
  - Service health and errors

Live Logs Include:
  📶 Speed Test Results - Download/Upload speeds
  🧠 System Requirements Check
  ⚡ Power Score Breakdown
  🔄 Continuous Monitoring Status
  ❌ Error and Warning Messages
  ✅ Service Startup and Health

Service: netrum-node-system.service
Logs: /var/log/netrum/netrum-node-system.log
`);
  process.exit(0);
}

// Run journalctl to view netrum-node-system.service logs
console.log('📊 Starting Netrum System Service Live Log Viewer...');
console.log('👀 Watching: netrum-node-system.service');
console.log('📶 Monitoring: Continuous Speed Tests (every 3 seconds)');
console.log('──────────────────────────────────────────────────────');

const journalctl = spawn('journalctl', [
  '-u', 'netrum-node-system.service',
  '-f',  // follow mode
  '-n', '30',  // show last 30 lines initially
  '--no-pager',  // don't use a pager
  '--since', '1 hour ago'  // show logs from last hour
]);

// Pipe output to console with custom formatting
journalctl.stdout.on('data', (data) => {
  const lines = data.toString().split('\n');
  lines.forEach(line => {
    if (line.trim()) {
      // Add emojis based on log content for better visualization
      let formattedLine = line;
      
      if (line.includes('📶') || line.includes('Speed Test')) {
        formattedLine = `🚀 ${line}`;
      } else if (line.includes('✅') || line.includes('Completed')) {
        formattedLine = `✅ ${line}`;
      } else if (line.includes('❌') || line.includes('Error')) {
        formattedLine = `❌ ${line}`;
      } else if (line.includes('⚠️') || line.includes('Warning')) {
        formattedLine = `⚠️  ${line}`;
      } else if (line.includes('🧠') || line.includes('System Check')) {
        formattedLine = `🧠 ${line}`;
      } else if (line.includes('⚡') || line.includes('Power Score')) {
        formattedLine = `⚡ ${line}`;
      } else if (line.includes('💾') || line.includes('saved')) {
        formattedLine = `💾 ${line}`;
      } else if (line.includes('Download:') || line.includes('Upload:')) {
        formattedLine = `📊 ${line}`;
      } else if (line.includes('Starting') || line.includes('Service')) {
        formattedLine = `🔄 ${line}`;
      }
      
      console.log(formattedLine);
    }
  });
});

journalctl.stderr.pipe(process.stderr);

// Handle exit
journalctl.on('close', (code) => {
  if (code !== 0) {
    console.log(`\n❌ Journalctl exited with code ${code}`);
    console.log('💡 Check if netrum-node-system.service is running:');
    console.log('   sudo systemctl status netrum-node-system.service');
    console.log('💡 Check log files directly:');
    console.log('   tail -f /var/log/netrum/netrum-node-system.log');
  }
  process.exit(code);
});

// Handle errors
journalctl.on('error', (err) => {
  console.log(`\n❌ Failed to start journalctl: ${err.message}`);
  console.log('💡 Make sure systemd is available on your system');
  console.log('💡 Alternative: View log file directly:');
  console.log('   tail -f /var/log/netrum/netrum-node-system.log');
  process.exit(1);
});

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('\n👋 Stopping Netrum System Log Viewer...');
  journalctl.kill();
  process.exit(0);
});
