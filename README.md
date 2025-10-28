# What is Netrum Lite Node CLI?

 - Netrum Lite Node CLI is a lightweight command-line tool that allows anyone to participate in the Netrum decentralized compute network.
 - It securely creates a wallet, connects to the Netrum server, registers the node on-chain, syncs uptime data, mines NPT tokens, and allows daily token claiming — all from your terminal.

 - Ideal for VPS and low-resource devices, this node is designed for fast setup, full transparency, and passive token rewards.

---

#  Hardware & Network Requirements

 - To run the Netrum Lite Node smoothly, make sure your system meets the following minimum requirements:

   ### Hardware Requirements

      | Component       | Minimum            | Recommended        |
      |-----------------|--------------------|--------------------|
      | **CPU**         | 2 Cores            | 2+ Cores           |
      | **RAM**         | 4 GB               | 6 GB or more       |
      | **Disk Space**  | 50 GB SSD          | 100 GB SSD         |

       SSD storage is highly recommended for faster performance and node stability.


   ### Network Requirements

      | Type              | Minimum Speed     |
      |-------------------|-------------------|
      | **Download**      | 10 Mbps           |
      | **Upload**        | 10 Mbps           |

      > A stable and fast internet connection is important for uptime sync, mining tasks, and daily reward claims.


--- 

# Netrum Lite Node – Setup Guide

  - Follow these steps to install and run the Netrum Lite Node CLI on Ubuntu/Linux:

    ### Clone the Repository

     ```bash
     git clone https://github.com/NetrumLabs/netrum-lite-node.git
     ```
     
    ###  Navigate to Project Directory

     ```bash
     cd netrum-lite-node
     ```

    ### Install Required Dependencies

     ```bash
     sudo apt update && sudo apt install -y curl bc jq speedtest-cli nodejs npm
     ```
     
    ### (Recommended) Install Node.js v20

     - Check your current Node version:

     ```bash
     node -v
     ```

     > If not v20.x.x, install it:

     ```bash
     curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
     sudo apt install -y nodejs
     ```

    ### Install Project Dependencies

     ```bash
     npm install
     ```

    ### Link the CLI Globally

     ```bash
     npm link
     ```

    ### Test the CLI

     ```bash
     netrum
     ```

     > You should see the Netrum Lite Node CLI interface.

     ```bash
       Netrum CLI  Version v2.0.0
       Light-weight node & wallet toolkit for the Netrum network.

       Available Commands:
       netrum-update          Cli Update
       netrum-system          System status & logs
       netrum-new-wallet      Create / new a wallet
       netrum-import-wallet   Create / import a wallet
       netrum-wallet          Create / inspect a wallet
       netrum-wallet-key      Export private key
       netrum-wallet-remove   Delete wallet files
       netrum-check-basename  Check basename conflicts
       netrum-node-id         Show current Node ID
       netrum-node-id-remove  Clear Node ID
       netrum-node-sign       Sign a message with node key
       netrum-node-register   Register node on-chain
       netrum-task-allow      Node allow task permission
       netrum-task            Node TTS task on
       netrum-task-log        Node TTS task Live logs
       netrum-sync            Sync blockchain data
       netrum-sync-log        Node sync logs
       netrum-mining          Start mining
       netrum-mining-log      Node mining logs
       netrum-claim           Claim rewards

       Run netrum <command> --help for command-specific options.
     ```

---

# How to Use Netrum CLI Commands

- **`netrum-system` :** This command checks your VPS system status, including CPU, RAM, and internet speed. Use it to make sure your machine meets the basic requirements before setup.


- **`netrum-new-wallet` :** Creates a new EVM-compatible wallet directly from the CLI. It will generate your public address and private key, all of which you should store securely.


- **`netrum-import-wallet` :** Allows you to import an existing wallet by entering your private key. This is useful if you already have a Base domain tied to a wallet you control.


- **`netrum-check-basename` :** Checks whether your current wallet has a registered Base domain name. Your Base name will also become your Netrum Node ID.


- **`netrum-node-id` :** Displays the current Node ID associated with your wallet. This is your official node identity on the Netrum network.


- **`netrum-node-sign` :** Generates a signed identity message using your wallet's private key. This signature verifies that you own the node and wallet.


- **`netrum-node-register` :** Registers your node on-chain and with the backend system. This step requires a small amount of BASE for gas (typically between 0.0002 and 0.0005 BASE).


- **`netrum-task` :** The TTS module allows and starts the task.


- **`netrum-sync` :** Starts the syncing process between your node and the Netrum network. This keeps your node active and eligible to earn mining rewards.


- **`netrum-sync-log` :** Displays real-time logs showing your sync status, heartbeat signals, and activity tracking. Use this to confirm your node is working correctly.


- **`netrum-mining` :** Begins the mining process for NPT tokens. Your node will now start earning rewards based on uptime and active sync.


- **`netrum-mining-log` :** Shows live mining logs and confirms whether your node is earning tokens correctly. This is useful for monitoring daily activity


- **`netrum-claim` :** Lets you claim your mined NPT tokens after 24 hours of uptime. Once claimed, mining will automatically restart. This step requires a small amount of BASE for gas (around 0.00002 to 0.00003 BASE).


- **`netrum-wallet` :** Displays wallet information including your public address and NPT balance. Use this to check if your mined rewards have been received.


- **`netrum-wallet-key` :** Reveals both the public and private keys of your wallet. Only use this in a secure environment and never share your private key.


- **`netrum-wallet-remove` :** Deletes your wallet from the local VPS. Make sure to back up your private key or seed phrase before running this command, as this action cannot be undone.



# Features of Netrum Lite Node
These are the core capabilities of the Netrum Lite Node CLI, designed for speed, simplicity, and transparency.

### 1. Secure Wallet Management 
- You can create a new EVM-compatible wallet or import an existing one directly through the CLI.
Wallets are stored locally on your VPS, and your private key is never exposed or sent externally.

### 2. Unique Node Identity 
- Each node generates a unique identity like `netrum.lite.base.username`, linked to your Base domain.
This identity is signed and verified both by Netrum’s backend and the on-chain smart contract.

### 3. Server Sync & Uptime Tracking 
- The node maintains a real-time connection with the Netrum backend to report uptime and status.
Your uptime is continuously tracked to determine mining eligibility and is preserved across restarts.

### 4. On-Chain Registration 
- Your node is registered directly on a smart contract, ensuring your wallet and Node ID are verifiably linked.
This brings full transparency, decentralized ownership, and traceability to the entire setup.

### 5. Live NPT Token Mining 
- NPT tokens are mined based on your node’s uptime and contribution to the network.There’s no hardware mining involved, just consistent uptime and on-chain proof-of-participation.

### 6. Daily Reward Claim
- You can claim your mined NPT tokens every 24 hours through a simple one-line command.
Each claim is recorded on-chain, and tokens are sent directly to your connected wallet.

### 7. Lightweight & Easy to Use
- The CLI is fast, intuitive, and optimized for both developers and first-time node runners.
It runs smoothly on low-resource VPS machines and can be fully set up in under five minutes.



---

## 🛠️ Support

If you face any errors while setting up your wallet, registering your node, or during mining:

➡ **Join the official Netrum Discord for help and community support:**

🔗 [https://discord.gg/Mv6uKBKCZM](https://discord.gg/Mv6uKBKCZM)

The team and community members are active and ready to assist you.

---

## ⚠️ Disclaimer

This software is in early development and is part of the Netrum testnet/lite-node program. Use at your own risk. Make sure to securely store your private keys and never share them with anyone. Any loss of tokens due to incorrect usage, deletion of files, or private key leaks is your responsibility.

---
