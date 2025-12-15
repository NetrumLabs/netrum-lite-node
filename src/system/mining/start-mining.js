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
const DELAY_MS = 60000;              // 60s delay before API call
const DEFAULT_GAS_LIMIT = 600000n;   // Safety gas fallback

/* ================= LOGGING ================= */

process.stdout._handle.setBlocking(true);
process.stderr._handle.setBlocking(true);

const log = (msg) => {
  process.stderr.write(`[${new Date().toISOString()}] ${msg}\n`);
};

/* ================= PATHS ================= */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const keyFile   = path.resolve(__dirname, '../../wallet/key.txt');
const nodeIdFile = path.resolve(__dirname, '../../identity/node-id/id.txt');
const tokenFile = path.resolve(__dirname, './miningtoken.txt');

/* ================= LOADERS ================= */

async function loadWalletAndNodeId() {
  let walletRaw;
  try {
    walletRaw = JSON.parse(await fs.readFile(keyFile, 'utf-8'));
  } catch {
    throw new Error('wallet/key.txt not found or invalid JSON');
  }

  const { privateKey, address } = walletRaw;
  if (!privateKey || !address) {
    throw new Error('wallet/key.txt missing privateKey or address');
  }

  let nodeId;
  try {
    nodeId = (await fs.readFile(nodeIdFile, 'utf-8')).trim();
  } catch {
    throw new Error('identity/node-id/id.txt not found');
  }

  if (!nodeId) throw new Error('node-id file is empty');

  return {
    address,
    privateKey: privateKey.replace(/^0x/, ''),
    nodeId
  };
}

async function loadMiningToken() {
  try {
    const token = (await fs.readFile(tokenFile, 'utf-8')).trim();
    if (!token) throw new Error();
    return token;
  } catch {
    throw new Error(
      'Mining token not found. Please run netrum-sync service first.'
    );
  }
}

/* ================= MAIN ================= */

(async () => {
  try {
    /* ---------- sanity ---------- */
    if (typeof fetch !== 'function') {
      throw new Error('Global fetch not available. Use Node.js 18+ or node-fetch');
    }

    /* ---------- load data ---------- */
    const { address, privateKey, nodeId } = await loadWalletAndNodeId();
    const miningToken = await loadMiningToken();

    const shortAddr = `${address.slice(0, 6)}...${address.slice(-4)}`;

    log(`⛏️ Mining wallet: ${shortAddr}`);
    log(`🔗 Node ID: ${nodeId}`);

    /* ---------- delay ---------- */
    log(`⏳ Waiting ${DELAY_MS / 1000}s before contacting mining API...`);
    await new Promise((r) => setTimeout(r, DELAY_MS));

    /* ---------- API CALL ---------- */
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
      throw new Error(`Invalid JSON from API (status ${response.status})`);
    }

    if (!response.ok) {
      throw new Error(
        res?.message ||
        res?.error ||
        `API failed with status ${response.status}`
      );
    }

    if (!res.success) {
      throw new Error(res?.message || 'Mining API returned success=false');
    }

    /* ---------- already mining ---------- */
    if (res.status === 'already_mining') {
      console.log('✅ Mining already active — no transaction required.');
      return;
    }

    /* ---------- validate tx ---------- */
    if (res.status !== 'ready_to_mine' || !res.txData) {
      throw new Error(res?.message || 'Unexpected mining API response');
    }

    /* ---------- sign & submit tx ---------- */
    log('✍️  Signing transaction...');
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

  } catch (err) {
    log(`❌ ${err.message}`);
    process.exit(1);
  }
})();
