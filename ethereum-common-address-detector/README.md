# Ethereum Common Address Detector

## Overview
A specialized blockchain analysis tool that identifies Ethereum addresses that have direct transactions with multiple addresses from your input list. This helps detect common counterparties across a set of wallets.

## Features
- Identifies addresses that interact with multiple wallets from your input list
- Filters out known exchanges and services to focus on meaningful connections
- Processes normal, internal, and token transactions
- Generates detailed CSV reports of found connections with transaction details
- Creates summary reports of common counterparties
- Implements intelligent batch processing with rate limiting

## Technologies
- JavaScript (Node.js)
- Etherscan API for blockchain data retrieval
- CSV processing for input and output
- Advanced data mapping and correlation analysis
- Intelligent filtering of high-traffic service addresses

## How It Works
1. Reads a list of Ethereum addresses from a CSV file
2. For each address, retrieves the complete transaction history
3. Extracts all counterparties (addresses that sent to or received from input addresses)
4. Identifies counterparties that interact with multiple input addresses
5. Filters out known exchange and service addresses for more focused results
6. Compiles detailed transaction data and relationship summaries

## Configuration Options
The tool offers various configuration options:
- Minimum connection threshold customization
- Exchange/service address filtering
- Batch processing settings
- API rate limit handling
- Output customization

## Use Cases
- Identifying common service providers across multiple wallets
- Detecting relationships between seemingly unrelated addresses
- Mapping transaction patterns in the Ethereum ecosystem
- Forensic analysis of wallet clusters
