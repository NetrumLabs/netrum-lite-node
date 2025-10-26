#!/usr/bin/env node
// src/task/service.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

/* ── Paths ─────────────────────────────────────────────── */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const templatePath = path.join(__dirname, './service.txt');
const serviceDest = '/etc/systemd/system/netrum-task.service';

/* ── Log Function ──────────────────────────────────────── */
const log = (msg) => console.log(`[TTS-SERVICE] ${msg}`);

/* ── Main Setup Function ───────────────────────────────── */
const setupService = () => {
    try {
        log('🚀 Starting Netrum TTS Service Setup...');

        /* ── Step 1: Check if running as root ────────────── */
        if (process.getuid && process.getuid() !== 0) {
            log('❌ ERROR: Root access required. Run with: sudo node service.js');
            process.exit(1);
        }

        /* ── Step 2: Check if service template exists ────── */
        if (!fs.existsSync(templatePath)) {
            log(`❌ ERROR: Service template not found at: ${templatePath}`);
            process.exit(1);
        }

        /* ── Step 3: Read and write systemd service file ─── */
        log('Creating systemd service file...');
        const serviceTemplate = fs.readFileSync(templatePath, 'utf8');
        fs.writeFileSync('/tmp/netrum-task-service.tmp', serviceTemplate);
        execSync(`mv /tmp/netrum-task-service.tmp ${serviceDest}`);
        execSync(`chmod 644 ${serviceDest}`);
        log('✅ Service file created');

        /* ── Step 4: Reload and start service ────────────── */
        log('Reloading systemd...');
        execSync('systemctl daemon-reload');
        
        log('Enabling service...');
        execSync('systemctl enable netrum-task.service');
        
        log('Starting service...');
        execSync('systemctl start netrum-task.service');
        
        log('Checking service status...');
        const status = execSync('systemctl is-active netrum-task.service').toString().trim();
        
        if (status === 'active') {
            log('🎉 Netrum task Service setup completed successfully!');
        } else {
            log(`⚠️ Service status: ${status}`);
        }

        /* ── Step 5: Show useful commands ────────────────── */
        console.log('\n📋 Useful Commands:');
        console.log('  sudo systemctl status netrum-task.service    # Check status');
        console.log('  sudo journalctl -u netrum-task.service -f    # Live logs');
        console.log('  sudo systemctl restart netrum-task.service   # Restart service');
        console.log('  sudo systemctl stop netrum-task.service      # Stop service');

    } catch (error) {
        log(`❌ Setup failed: ${error.message}`);
        process.exit(1);
    }
};

/* ── Run Setup ─────────────────────────────────────────── */
setupService();