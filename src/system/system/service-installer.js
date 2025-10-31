#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

/* ── Paths ─────────────────────────────────────────────── */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const templatePath = path.join(__dirname, 'service.txt');
const serviceDest = '/etc/systemd/system/netrum-node.service';
const logDir = '/var/log/netrum';
const logFile = `${logDir}/netrum-node.log`;
const errorFile = `${logDir}/netrum-node.error.log`;

/* ── Main Installation Function ────────────────────────── */
function installService() {
    console.log('🚀 Installing Netrum Node System Service...\n');
    
    try {
        /* ── Step 1: Check if template exists ───────────── */
        console.log('📝 Step 1: Reading service template...');
        if (!fs.existsSync(templatePath)) {
            throw new Error(`Service template not found at: ${templatePath}`);
        }
        
        const serviceTemplate = fs.readFileSync(templatePath, 'utf8');
        console.log('✅ Service template loaded');

        /* ── Step 2: Write systemd service file ─────────── */
        console.log('📄 Step 2: Creating systemd service file...');
        fs.writeFileSync('/tmp/netrum-service.tmp', serviceTemplate);
        execSync(`sudo mv /tmp/netrum-service.tmp ${serviceDest}`);
        execSync(`sudo chmod 644 ${serviceDest}`);
        console.log('✅ Service file created at:', serviceDest);

        /* ── Step 3: Prepare logs directory ─────────────── */
        console.log('📁 Step 3: Setting up log directories...');
        execSync(`sudo mkdir -p ${logDir}`);
        execSync(`sudo touch ${logFile}`);
        execSync(`sudo touch ${errorFile}`);
        execSync(`sudo chown root:root ${logDir} ${logFile} ${errorFile}`);
        execSync(`sudo chmod 755 ${logDir}`);
        execSync(`sudo chmod 644 ${logFile} ${errorFile}`);
        console.log('✅ Log directories created');

        /* ── Step 4: Reload and start service ───────────── */
        console.log('🔄 Step 4: Reloading systemd...');
        execSync('sudo systemctl daemon-reload');
        
        console.log('🔧 Step 5: Enabling service...');
        execSync('sudo systemctl enable netrum-node.service');
        
        console.log('▶️  Step 6: Starting service...');
        execSync('sudo systemctl restart netrum-node.service');
        
        console.log('⏳ Waiting for service to start...');
        execSync('sleep 3');
        
        /* ── Step 5: Verify service status ──────────────── */
        console.log('🔍 Step 7: Checking service status...');
        const status = execSync('sudo systemctl is-active netrum-node.service').toString().trim();
        
        if (status === 'active') {
            console.log('\n🎉 SUCCESS: Netrum Node Service installed and running!');
        } else {
            console.log('\n⚠️  Service installed but not active. Current status:', status);
        }

    } catch (error) {
        console.error('\n❌ ERROR:', error.message);
        process.exit(1);
    }
}

/* ── Final Instructions ────────────────────────────────── */
function showInstructions() {
    console.log('\n📋 Service Management Commands:');
    console.log('  Check status : sudo systemctl status netrum-node.service');
    console.log('  Start service: sudo systemctl start netrum-node.service');
    console.log('  Stop service : sudo systemctl stop netrum-node.service');
    console.log('  View logs    : sudo journalctl -u netrum-node.service -f');
    console.log('  Restart      : sudo systemctl restart netrum-node.service');
    
    console.log('\n📊 Log Files:');
    console.log('  Output log  :', logFile);
    console.log('  Error log   :', errorFile);
}

/* ── Start Installation ────────────────────────────────── */
installService();
showInstructions();
