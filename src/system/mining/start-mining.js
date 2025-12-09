#!/usr/bin/env node
import { ethers } from 'ethers';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

/* ---------- config ---------- */
const API_URL = 'https://node.netrumlabs.dev/mining/start-mining';
const RPC_URL = 'https://mainnet.base.org';
const CHAIN_ID = 8453;               // Base Mainnet
const DELAY_MS = 60000;              // ⏱️ Delay before API call in milliseconds

/* ---------- logging ---------- */
process.stdout._handle.setBlocking(true);
process.stderr._handle.setBlocking(true);
const log = (m) => process.stderr.write(`[${new Date().toISOString()}] ${m}\n`);

/* ---------- paths ---------- */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const keyFile = path.resolve(__dirname, '../../wallet/key.txt');
const nodeIdFile = path.resolve(__dirname, '../../identity/node-id/id.txt');
const tokenFile = path.resolve(__dirname, './miningtoken.txt');

async function loadWalletAndNodeId() {
  // Load wallet
  const { privateKey, address } = JSON.parse(await fs.readFile(keyFile, 'utf-8'));
  if (!address || !privateKey) throw new Error('wallet/key.txt missing data');
  
  // Load node ID
  const nodeId = (await fs.readFile(nodeIdFile, 'utf-8')).trim();
  if (!nodeId) throw new Error('identity/node-id/id.txt is empty');
  
  return { 
    address, 
    privateKey: privateKey.replace(/^0x/, ''),
    nodeId
  };
}

async function loadMiningToken() {
  try {
    const token = (await fs.readFile(tokenFile, 'utf-8')).trim();
    if (!token) throw new Error('Token file empty');
    return token;
  } catch (err) {
    throw new Error('Please start netrum-sync service first to generate mining token');
  }
}

/* ---------- main ---------- */
(async () => {
  try {
    // Load required data
    const { address, privateKey, nodeId } = await loadWalletAndNodeId();
    const miningToken = await loadMiningToken();
    
    const short = `${address.slice(0, 6)}...${address.slice(-4)}`;
    log(`⛏️ Node: ${address}`);
    log(`🔗 Node ID: ${nodeId}`);
    console.log(`⛏️ Mining Node: ${short}`);

    /* --- delay before API --- */
    log(`⏳ Waiting ${DELAY_MS / 1000} seconds before contacting API...`);
    await new Promise((r) => setTimeout(r, DELAY_MS));

    /* --- hit start-mining API --- */
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        nodeId,
        miningToken 
      })
    }).then((r) => r.json());

    if (!res.success) throw new Error(res.error || 'API error');

    if (res.status === 'already_mining') {
      console.log('✅ Mining already active – no TX needed.');
      return;
    }
    if (res.status !== 'ready_to_mine' || !res.txData) {
      throw new Error(res.message || 'Unexpected API response');
    }

    /* --- sign & submit tx --- */
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const signer = new ethers.Wallet(privateKey, provider);
    const txResp = await signer.sendTransaction({ ...res.txData, chainId: CHAIN_ID });
    console.log(`✅ TX submitted: https://basescan.org/tx/${txResp.hash}`);

  } catch (err) {
    log(`❌ ${err.message}`);
    process.exit(1);
  }
})();
