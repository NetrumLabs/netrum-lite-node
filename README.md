<p align="center">
  <img src="assets/banner.png" width="100%">
</p>

# Netrum Lite Node v3

> Lightweight CLI node for the Netrum decentralized compute network.

---

# What is Netrum Lite Node v3?

Netrum Lite Node v3 is a lightweight command-line application that allows anyone to participate in the Netrum decentralized compute network.

It securely creates a wallet, registers your node on-chain, synchronizes node information, receives compute tasks, mines NPT tokens, and allows you to claim rewards directly from your terminal.

Designed for VPS and low-resource servers, Netrum Lite Node v3 provides a fast setup experience with fully automated workers, background services, and continuous synchronization.

### Key Features

- Lightweight CLI application
- One-command installation
- Secure local wallet management
- On-chain node registration
- Automatic node synchronization
- Background mining worker
- Automatic task worker
- Token management
- Daily reward claiming
- Auto update support
- Ubuntu systemd services
- Built for VPS and dedicated servers

---

# Hardware & Network Requirements

To run **Netrum Lite Node v3** smoothly, your system should meet the following minimum requirements.

## Hardware Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| CPU | 2 Cores | 2+ Cores |
| RAM | 4 GB | 6 GB or More |
| Disk | 50 GB SSD | 100 GB SSD |

> SSD storage is highly recommended for better node performance and stability.

## Network Requirements

| Connection | Minimum |
|------------|----------|
| Download | 10 Mbps |
| Upload | 10 Mbps |

> A stable internet connection is required for synchronization, mining, task execution, and reward claiming.

---

# Supported Operating System

| Operating System | Status |
|------------------|--------|
| Ubuntu 20.04 LTS | ✅ Supported |
| Ubuntu 22.04 LTS | ✅ Supported |
| Ubuntu 24.04 LTS | ✅ Supported |

---

# Architecture Overview

Netrum Lite Node v3 consists of several independent background workers.

- Node Registration Worker
- Mining Worker
- Task Worker
- Auto Update Worker
- Sync Worker
- Claim System
- Health Check & Debug System

All workers communicate securely with the Netrum API Server while maintaining local configuration through the environment manager.

---