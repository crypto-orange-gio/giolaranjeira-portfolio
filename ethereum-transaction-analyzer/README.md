# Ethereum Transaction Analyzer

## Overview
A powerful Node.js tool that analyzes Ethereum blockchain data to detect direct connections between wallet addresses. This tool uses the Etherscan API to retrieve transaction history and identify specific transaction patterns.

## Features
- Searches for direct connections (transactions) between target and source addresses
- Analyzes normal, internal, and token transactions
- Handles API rate limiting with intelligent retry logic
- Processes addresses in configurable batches for optimal performance
- Generates detailed CSV reports of found connections
- Provides comprehensive logging with timestamps

## Technologies
- JavaScript (Node.js)
- Etherscan API for blockchain data retrieval
- CSV processing for input and output
- Batch processing with rate limiting
- Error handling with retry mechanisms

## How It Works
1. Reads a list of Ethereum addresses from a CSV file
2. Connects to Etherscan API to retrieve transaction history for each address
3. Analyzes transactions to identify direct connections with the target address
4. Categorizes connections as incoming or outgoing
5. Formats and saves results to a CSV file
6. Provides detailed logs and progress information

## Configuration Options
The tool offers various configuration options:
- Target address specification
- API key configuration
- Batch processing settings
- Input/output file paths
- Logging verbosity control

## Use Cases
- Blockchain forensic analysis
- Transaction pattern detection
- Cryptocurrency flow tracking
- Wallet relationship mapping
