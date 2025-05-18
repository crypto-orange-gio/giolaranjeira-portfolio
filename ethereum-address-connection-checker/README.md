# Ethereum Address Connection Checker

## Overview
A focused blockchain analysis tool that detects direct transaction connections between a target Ethereum address and a list of addresses to check. This tool performs comprehensive analysis across multiple transaction types to uncover any historical interactions.

## Features
- Checks for connections across six different transaction types:
  - Normal transactions from address
  - Normal transactions from target
  - Internal transactions from address
  - Internal transactions from target
  - ERC20 token transfers from address
  - ERC20 token transfers from target
- Implements intelligent retry logic for API rate limits
- Processes addresses in configurable batches
- Reports detailed transaction data including direction, values, and types
- Handles both ETH and token transfers

## Technologies
- JavaScript (Node.js)
- Etherscan API for comprehensive blockchain data analysis
- Robust error handling and retry mechanisms
- Asynchronous batch processing
- Detailed transaction logging and reporting

## How It Works
1. Configures a target address and addresses to check
2. Processes addresses in small batches to manage API rate limits
3. For each address, performs six different types of transaction checks:
   - Outgoing ETH transactions
   - Incoming ETH transactions
   - Outgoing internal transactions
   - Incoming internal transactions
   - Outgoing token transfers
   - Incoming token transfers
4. Filters and identifies any transactions connecting the address with the target
5. Provides detailed transaction reports including hash, type, direction, and value

## Use Cases
- Forensic investigation of blockchain addresses
- Verification of transaction connections between addresses
- Discovery of previously unknown relationships between wallets
- Compliance checks for cryptocurrency businesses
- Enhanced due diligence on blockchain addresses
