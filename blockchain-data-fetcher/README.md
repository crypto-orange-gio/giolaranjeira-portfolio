# Blockchain Data Fetcher

## Overview
A Node.js script that interacts with Ethereum blockchain networks through Infura's API to fetch account information and blockchain metrics.

## Features
- Resolves ENS (Ethereum Name Service) domains to Ethereum addresses
- Retrieves the latest block number from different Ethereum networks
- Fetches account balances with proper conversion from Wei to ETH
- Counts transactions for specific Ethereum addresses
- Stores data in JSON format for further analysis

## Technologies
- JavaScript (Node.js)
- Axios for API requests
- Infura API for blockchain data access
- JSON-RPC protocol for Ethereum blockchain interaction

## How It Works
The script performs the following operations:
1. Resolves an ENS domain name to its corresponding Ethereum address
2. Connects to multiple Ethereum networks (Mainnet and Sepolia)
3. Retrieves the latest block number for each network
4. Fetches the ETH balance for the resolved address
5. Counts the number of transactions for the address
6. Saves all collected data in a structured JSON file

## Potential Applications
- Blockchain wallet monitoring
- ENS domain lookup tools
- Account balance tracking systems
- Transaction analysis and metrics
