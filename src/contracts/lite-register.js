#!/usr/bin/env node
import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Required for Node.js fetch
const fetch = global.fetch || (await import('node-fetch')).default;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅  Configuration
const RPC_URL = "https://mainnet.base.org/";
const API_URL = "https://node.netrumlabs.dev/register/register-node"; // FIX THIS URL
const CONTRACT_ADDRESS = "0x23b67235Cf602CC6793C45dA86E6DB2246220702";

// ✅  File Paths
const walletFilePath = path.resolve(__dirname, '../wallet/key.txt');
const signMessagePath = path.resolve(__dirname, '../identity/sign/signMsg.txt');
const txHashPath = path.resolve(__dirname, '../node-lite/register-tx-hash.txt');

// ✅  Helpers
function getField(textLines, key) {
  const line = textLines.find(line => line.startsWith(key));
  if (!line) throw new Error(`Field ${key} not found`);
  return line.split(':')[1].trim();
}

async function checkIfRegistered(signerAddress) {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const contract = new ethers.Contract(
    CONTRACT_ADDRESS,
    ["function getUserType(address) view returns (string)"],
    provider
  );
  const userType = await contract.getUserType(signerAddress);
  return userType !== "None";
}

async function registerLiteNode() {
  try {
    // 1. Load Wallet
    const walletContent = fs.readFileSync(walletFilePath, "utf8").trim();
    const privateKey = walletContent.startsWith('{')
      ? JSON.parse(walletContent).privateKey
      : walletContent;
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(privateKey, provider);

    // 2. Load Signature File
    const signText = fs.readFileSync(signMessagePath, 'utf8').split('\n');
    const nodeId = getField(signText, "NodeID");
    const signerAddress = getField(signText, "SignerAddress");
    const timestamp = parseInt(getField(signText, "Timestamp"));
    const signature = getField(signText, "Signature");

    // 3. Check if already registered
    if (await checkIfRegistered(signerAddress)) {
      console.log("ℹ️ This address is already registered");
      return { alreadyRegistered: true };
    }

    // 4. Get encoded data from API
    console.log("🔍 Preparing registration...");
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nodeId,
        signerAddress,
        timestamp,
        signature,
        nodeType: 'lite'
      })
    });

    // First check if response is OK
    if (!response.ok) {
      const errorText = await response.text();
      console.error('API Error Response:', errorText);
      throw new Error(`API request failed with status ${response.status}`);
    }

    // Then try to parse as JSON
    const data = await response.json();
    
    // 5. Check user balance before proceeding
    const requiredFee = BigInt(data.feeWei);
    console.log(`💵 You need ${ethers.formatEther(requiredFee)} ETH for Registration Fee`);
    
    const balance = await provider.getBalance(wallet.address);
    console.log(`💰 Your current balance: ${ethers.formatEther(balance)} ETH`);
    
    if (balance < requiredFee) {
      console.log("❌ Insufficient balance for registration fee");
      console.log("ℹ️ Please deposit more ETH and try again");
      return { error: "Insufficient balance", requiredFee: requiredFee.toString() };
    }
    
    // 6. Ask for user confirmation
    console.log("\n⚠️ WARNING: This will send a transaction with the following details:");
    console.log(`- To: ${CONTRACT_ADDRESS}`);
    console.log(`- Value: ${ethers.formatEther(requiredFee)} ETH`);
    console.log(`- Estimated Gas: ${data.estimatedGas}`);
    
    // In a real CLI application, you might want actual user confirmation here
    // For now, we'll proceed automatically since this is a script
    console.log("\n⏳ Proceeding with transaction...");
    
    // 7. Send transaction with fee from API
    console.log("📤 Sending transaction...");
    const tx = await wallet.sendTransaction({
      to: CONTRACT_ADDRESS,
      data: data.encodedData,
      gasLimit: BigInt(data.estimatedGas),
      value: requiredFee
    });

    console.log("⏳ Waiting for confirmation...");
    await tx.wait();
    console.log("✅ Registration successful!");
    fs.writeFileSync(txHashPath, tx.hash);
    return { success: true, txHash: tx.hash };
  } catch (error) {
    console.error("❌ Error:", error.message);
    if (error.message.includes("Already Lite registered")) {
      return { alreadyRegistered: true };
    }
    return { error: error.message };
  }
}

// ▶️ Execute
registerLiteNode().then(result => {
  if (result?.alreadyRegistered) {
    console.log("No action needed - already registered");
  } else if (result?.error === "Insufficient balance") {
    console.log(`Please deposit at least ${ethers.formatEther(result.requiredFee)} ETH and try again`);
  } else if (result?.error) {
    console.log("Registration failed");
  } else if (result?.success) {
    console.log(`Transaction hash: ${result.txHash}`);
  }
});
