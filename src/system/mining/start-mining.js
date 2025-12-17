#!/usr/bin/env node

/* ================= IMPORTS ================= */
import fetch from 'node-fetch';
import { ethers } from 'ethers';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

/* ================= CONFIG ================= */

const API_URL = 'https://node.netrumlabs.dev/mining/start-mining';
const RPC_URL = 'https://mainnet.base.org';
const CHAIN_ID = 8453;               // Base Mainnet
const INITIAL_DELAY_MS = 60000;      // 60s before first call
const RETRY_DELAY_MS = 300000;       // ⏳ 5 min wait for new token
const DEFAULT_GAS_LIMIT = 600000n;

/* ================= LOGGING ================= */

process.stdout._handle.setBlocking(true);
process.stderr._handle.setBlocking(true);

const log = (msg) => {
  process.stderr.write(`[${new Date().toISOString()}] ${msg}\n`);
};

/* ================= PATHS ================= */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const keyFile    = path.resolve(__dirname, '../../wallet/key.txt');
const nodeIdFile = path.resolve(__dirname, '../../identity/node-id/id.txt');
const tokenFile  = path.resolve(__dirname, './miningtoken.txt');

/* ================= HELPERS ================= */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function loadWalletAndNodeId() {
  const wallet = JSON.parse(await fs.readFile(keyFile, 'utf-8'));
  const nodeId = (await fs.readFile(nodeIdFile, 'utf-8')).trim();

  if (!wallet.privateKey || !wallet.address) {
    throw new Error('wallet/key.txt missing data');
  }
  if (!nodeId) throw new Error('node-id file empty');

  return {
    address: wallet.address,
    privateKey: wallet.privateKey.replace(/^0x/, ''),
    nodeId
  };
}

async function loadMiningToken() {
  const token = (await fs.readFile(tokenFile, 'utf-8')).trim();
  if (!token) throw new Error('Mining token empty');
  return token;
}

/* ================= MAIN ================= */

(async () => {
  try {
    const { address, privateKey, nodeId } = await loadWalletAndNodeId();
    const short = `${address.slice(0, 6)}...${address.slice(-4)}`;

    log(`⛏️ Mining wallet: ${short}`);
    log(`🔗 Node ID: ${nodeId}`);
    log(`⏳ Initial wait ${INITIAL_DELAY_MS / 1000}s...`);

    await sleep(INITIAL_DELAY_MS);

    while (true) {
      let miningToken;

      try {
        miningToken = await loadMiningToken();
      } catch {
        log('🔄 Token not found yet, waiting for sync...');
        await sleep(RETRY_DELAY_MS);
        continue;
      }

      log('📡 Calling start-mining API...');
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeId, miningToken })
      });

      let res;
      try {
        res = await response.json();
      } catch {
        throw new Error(`Invalid JSON from API (${response.status})`);
      }

      /* ---------- TOKEN ROTATION HANDLING ---------- */

      if (response.status === 401) {
        log('🔁 Token rotated or expired.');
        log('⏳ Waiting for next sync to receive new token...');
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      
      if (response.status === 400) {
        log('⚠️ Mining cannot start due to a requirement issue:');
        log(`👉 ${res?.detail || res?.message || 'Unknown reason'}`);
        log('🛑 Please fix the above issue and run mining again.');
        return; // STOP — user action required
      }
      
      if (response.status === 429) {
        log('⏳ Cooldown active. Please wait before retrying.');
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      
      if (!response.ok) {
        log(`❌ Server error (${response.status}). Try again later.`);
        await sleep(RETRY_DELAY_MS);
        continue;
      }


      if (res.status === 'already_mining') {
        console.log('✅ Mining already active — no TX needed.');
        return;
      }

      if (res.status !== 'ready_to_mine' || !res.txData) {
        throw new Error(res?.message || 'Unexpected mining API response');
      }

      /* ---------- SIGN & SEND TX ---------- */
      log('✍️ Signing transaction...');
      const provider = new ethers.JsonRpcProvider(RPC_URL);
      const signer = new ethers.Wallet(privateKey, provider);

      const tx = {
        ...res.txData,
        chainId: CHAIN_ID,
        gasLimit: res.txData.gasLimit
          ? BigInt(res.txData.gasLimit)
          : DEFAULT_GAS_LIMIT
      };

      const txResp = await signer.sendTransaction(tx);
      console.log(`✅ TX submitted: https://basescan.org/tx/${txResp.hash}`);
      return;
    }

  } catch (err) {
    log(`❌ ${err.message}`);
    process.exit(1);
  }
})();
