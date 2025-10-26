#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, '../..');

// Fixed paths - make sure these point to actual files, not directories
const TX_HASH_PATH = path.join(__dirname, '../node-lite/register-tx-hash.txt'); // Fixed path
const SIGN_FILE = path.join(__dirname, '../identity/sign/signMsg.txt'); // Fixed path
const OUTPUT_FILE = path.join(__dirname, '../node-lite/data.txt'); // Fixed path

function parseSignFile() {
  try {
    const content = fs.readFileSync(SIGN_FILE, 'utf-8');
    const data = {
      nodeId: content.match(/NodeID:\s*(.*)/)[1].trim(),
      signerAddress: content.match(/SignerAddress:\s*(.*)/)[1].trim(),
      timestamp: content.match(/Timestamp:\s*(.*)/)[1].trim(),
      signature: content.match(/Signature:\s*(.*)/)[1].trim()
    };
    return data;
  } catch (error) {
    console.error('❌ Error reading sign file:', error.message);
    process.exit(1);
  }
}

async function registerNode() {
  try {
    // step 1 User On-Chain Register check 
    if (!fs.existsSync(TX_HASH_PATH) || !fs.readFileSync(TX_HASH_PATH, 'utf-8').trim()) {
      console.error("❌ You are not registered on-chain. Please complete on-chain registration first.");
      return;
    }
    
    // Step 2 Check if data file already exists
    if (fs.existsSync(OUTPUT_FILE)) {
      console.log("ℹ️ This address is already registered onchain, Data already exist in Data file");
      return;
    }

    // Parse sign file
    const { nodeId, signerAddress, timestamp, signature } = parseSignFile();

    // Read transaction hash
    const TX_HASH = fs.readFileSync(TX_HASH_PATH, 'utf-8').trim();
    
    const payload = {
      wallet: signerAddress,
      nodeId: nodeId,
      timestamp: parseInt(timestamp),
      signature: signature,
      txHash: TX_HASH
    };

    console.log('🚀 Sending registration data to server...');
    
    const response = await fetch('https://api.v2.netrumlabs.com/api/node/register-node/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const apiResponse = await response.text();

    // Ensure directory exists
    fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
    
    // Save response
    fs.writeFileSync(OUTPUT_FILE, apiResponse);

    if (apiResponse.includes('Node already registered')) {
      console.log('⚠️ Node already registered on Netrum Server.');
    } else if (response.ok) {
      console.log(`✅ Registration successful! Data saved to ${OUTPUT_FILE}`);
    } else {
      console.log('❌ Registration failed. Server response:');
      console.log(apiResponse);
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Registration request failed:', error.message);
    process.exit(1);
  }
}

registerNode();
