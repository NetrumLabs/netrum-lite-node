#!/usr/bin/env node
import { ethers } from 'ethers';
import fetch from 'node-fetch';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import readline from 'readline/promises';

// Configuration
const API_URL = 'https://node.netrumlabs.dev/claim/claim-tokens';
const RPC_URL = 'https://mainnet.base.org';
const CHAIN_ID = 8453;

// Get paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const keyFile = path.resolve(__dirname, '../../wallet/key.txt');

async function main() {
  try {
    // Load wallet
    const { address, privateKey } = await loadWallet();
    console.log(`?? Your Mining Address: ${address}`);

    // Check claim eligibility
    const { canClaim, claimData, message } = await checkClaimEligibility(address);
    
    if (!canClaim) {
      console.log(`⏳ ${message}`);
      return;
    }

    // Display claim info
    console.log(`\n?? Claimable Tokens: ${ethers.formatUnits(claimData.minedTokens, 18)} NPT`);
    console.log(`⛽ Required Fee: ${ethers.formatUnits(claimData.feeWei, 18)} ETH`);

    // Check balance
    const balance = await getBalance(address);
    console.log(`?? Your Balance: ${ethers.formatUnits(balance, 18)} ETH`);

    if (balance < BigInt(claimData.feeWei)) {
      const needed = BigInt(claimData.feeWei) - balance;
      console.log(`\n❌ Insufficient funds. Need ${ethers.formatUnits(needed, 18)} more ETH`);
      console.log('Run: netrum-wallet to deposit funds');
      return;
    }

    // Confirm and send transaction
    if (await confirmAction()) {
      await sendClaimTransaction(privateKey, claimData);
    }

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

async function loadWallet() {
  const data = JSON.parse(await fs.readFile(keyFile, 'utf-8'));
  const privateKey = data.privateKey?.replace('0x', '');
  const address = data.address?.trim();
  if (!privateKey || !address) throw new Error('Invalid wallet file');
  return { address, privateKey };
}

async function checkClaimEligibility(address) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nodeAddress: address })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'API request failed');
  return data;
}

async function getBalance(address) {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  return provider.getBalance(address);
}

async function sendClaimTransaction(privateKey, claimData) {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const signer = new ethers.Wallet(privateKey, provider);
  
  console.log('\n✍️ Signing transaction...');
  const tx = await signer.sendTransaction({
    to: claimData.txData.to,
    data: claimData.txData.data,
    value: claimData.feeWei,
    gasLimit: claimData.txData.gasLimit,
    chainId: CHAIN_ID
  });
  
  console.log(`\n✅ Transaction sent: https://basescan.org/tx/${tx.hash}`);
  console.log('⏳ Waiting for confirmation...');
  
  await tx.wait();
  console.log('\n?? Tokens successfully claimed!');
}

async function confirmAction() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  try {
    const answer = await rl.question('\nConfirm transaction? (y/n) ');
    return answer.toLowerCase() === 'y';
  } finally {
    rl.close();
  }
}

main();
