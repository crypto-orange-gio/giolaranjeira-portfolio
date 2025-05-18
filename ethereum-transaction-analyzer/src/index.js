/**
 * Ethereum Direct Connection Detector
 * 
 * This script analyzes Ethereum addresses to find direct connections
 * with a specific target address. It checks for direct transactions 
 * (incoming or outgoing) between the provided addresses and the target.
 * 
 * Output: CSV file with participant code, wallet address, transaction hash, 
 * and ETH amount sent or received.
 */

const axios = require('axios');
const fs = require('fs');
const csv = require('csv-parser');
const { createObjectCsvWriter } = require('csv-writer');
const path = require('path');

// ===== CONFIGURATION =====
const CONFIG = {
  // Target address
  TARGET_ADDRESS: 'depositaddress/wallet',
  
  // Etherscan API key
  ETHERSCAN_API_KEY: 'your api key',
  
  // Process settings
  BATCH_SIZE: 5,                // Number of addresses to process in each batch
  BATCH_DELAY: 2000,            // Delay between batches (ms)
  REQUEST_DELAY: 500,           // Delay between API requests (ms)
  MAX_RETRIES: 3,               // Maximum retries for API requests
  
  // Files
  INPUT_CSV: 'addresses.csv',   // Input CSV file with addresses and participant codes
  OUTPUT_DIR: 'results',        // Output directory for results
  
  // Console output settings
  VERBOSE: true,                // Show detailed logs
  SHOW_PROGRESS_BAR: true       // Show progress bar for batch processing
};

// ===== FILE PATHS =====
const API_URL = 'https://api.etherscan.io/api';
const OUTPUT_FILE = path.join(CONFIG.OUTPUT_DIR, 'direct_connections.csv');
const LOG_FILE = path.join(CONFIG.OUTPUT_DIR, 'scan.log');

// Create output directory if it doesn't exist
if (!fs.existsSync(CONFIG.OUTPUT_DIR)) {
  fs.mkdirSync(CONFIG.OUTPUT_DIR, { recursive: true });
}

// Clear log file
fs.writeFileSync(LOG_FILE, '');

// ===== HELPER FUNCTIONS =====

/**
 * Log function with timestamp
 * @param {string} message - Message to log
 * @param {string} level - Log level (info, success, warning, error)
 */
function log(message, level = 'info') {
  const timestamp = new Date().toISOString();
  let formattedMessage;
  
  switch(level) {
    case 'success':
      formattedMessage = `[${timestamp}] ✅ ${message}`;
      break;
    case 'warning':
      formattedMessage = `[${timestamp}] ⚠️ ${message}`;
      break;
    case 'error':
      formattedMessage = `[${timestamp}] ❌ ${message}`;
      break;
    case 'title':
      formattedMessage = `\n[${timestamp}] === ${message} ===\n`;
      break;
    default:
      formattedMessage = `[${timestamp}] ${message}`;
  }
  
  // Only log to console if verbose mode is enabled or for important messages
  if (CONFIG.VERBOSE || ['success', 'error', 'title'].includes(level)) {
    console.log(formattedMessage);
  }
  
  // Log to file
  fs.appendFileSync(LOG_FILE, formattedMessage + '\n');
}

/**
 * Format ETH value from wei
 * @param {string} wei - Value in wei
 * @returns {number} - Value in ETH
 */
function formatEth(wei) {
  return parseFloat(wei) / 1e18;
}

/**
 * Format Unix timestamp to readable date
 * @param {string} timestamp - Unix timestamp
 * @returns {string} - ISO date string
 */
function formatTimestamp(timestamp) {
  return new Date(parseInt(timestamp) * 1000).toISOString();
}

/**
 * Sleep function for delays
 * @param {number} ms - Milliseconds to sleep
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create a progress bar for console output
 * @param {number} current - Current progress
 * @param {number} total - Total items
 * @param {number} barSize - Size of the bar in characters
 * @returns {string} - Formatted progress bar
 */
function getProgressBar(current, total, barSize = 30) {
  if (!CONFIG.SHOW_PROGRESS_BAR) return '';
  
  const percentage = Math.min(100, Math.round((current / total) * 100));
  const filledSize = Math.round((current / total) * barSize);
  const emptySize = barSize - filledSize;
  
  const filledBar = '█'.repeat(filledSize);
  const emptyBar = '░'.repeat(emptySize);
  
  return `[${filledBar}${emptyBar}] ${percentage}% (${current}/${total})`;
}

/**
 * Make request to Etherscan API with retry logic
 * @param {Object} params - API parameters
 * @param {number} retries - Current retry count
 * @returns {Object} - API response
 */
async function etherscanRequest(params, retries = 0) {
  try {
    const response = await axios.get(API_URL, {
      params: {
        ...params,
        apikey: CONFIG.ETHERSCAN_API_KEY
      },
      timeout: 10000 // 10 second timeout
    });
    
    // Check for rate limiting or other API errors
    if (response.data.status === '0') {
      if (response.data.message && response.data.message.includes('rate limit')) {
        if (retries >= CONFIG.MAX_RETRIES) {
          log(`API rate limit hit. Maximum retries exceeded.`, 'error');
          return { result: [] };
        }
        
        const waitTime = 5000 * (retries + 1);
        log(`API rate limit hit. Waiting ${waitTime/1000} seconds...`, 'warning');
        await sleep(waitTime);
        return etherscanRequest(params, retries + 1);
      } else if (response.data.message && response.data.message.includes('No transactions found')) {
        return { result: [] };
      } else {
        log(`API Error: ${response.data.message || 'Unknown error'}`, 'warning');
        return { result: [] };
      }
    }
    
    return response.data;
  } catch (error) {
    if (retries >= CONFIG.MAX_RETRIES) {
      log(`Request failed after ${CONFIG.MAX_RETRIES} retries: ${error.message}`, 'error');
      return { result: [] };
    }
    
    const waitTime = 2000 * (retries + 1);
    log(`Request error: ${error.message}. Retrying in ${waitTime/1000}s`, 'warning');
    await sleep(waitTime);
    return etherscanRequest(params, retries + 1);
  }
}

/**
 * Get transactions for an address from Etherscan
 * @param {string} address - Ethereum address to check
 * @returns {Object} - Transactions grouped by type
 */
async function getTransactions(address) {
  const transactions = {
    normal: [],
    internal: [],
    token: []
  };
  
  // 1. Get normal transactions
  const normalTxParams = {
    module: 'account',
    action: 'txlist',
    address: address,
    startblock: 0,
    endblock: 99999999,
    page: 1,
    offset: 10000,
    sort: 'desc'
  };
  
  const normalTxResponse = await etherscanRequest(normalTxParams);
  if (normalTxResponse.result && Array.isArray(normalTxResponse.result)) {
    transactions.normal = normalTxResponse.result;
    log(`Found ${transactions.normal.length} normal transactions for ${address}`);
  }
  
  await sleep(CONFIG.REQUEST_DELAY);
  
  // 2. Get internal transactions
  const internalTxParams = {
    module: 'account',
    action: 'txlistinternal',
    address: address,
    startblock: 0,
    endblock: 99999999,
    page: 1,
    offset: 10000,
    sort: 'desc'
  };
  
  const internalTxResponse = await etherscanRequest(internalTxParams);
  if (internalTxResponse.result && Array.isArray(internalTxResponse.result)) {
    transactions.internal = internalTxResponse.result;
    log(`Found ${transactions.internal.length} internal transactions for ${address}`);
  }
  
  await sleep(CONFIG.REQUEST_DELAY);
  
  // 3. Get token transactions
  const tokenTxParams = {
    module: 'account',
    action: 'tokentx',
    address: address,
    startblock: 0,
    endblock: 99999999,
    page: 1,
    offset: 10000,
    sort: 'desc'
  };
  
  const tokenTxResponse = await etherscanRequest(tokenTxParams);
  if (tokenTxResponse.result && Array.isArray(tokenTxResponse.result)) {
    transactions.token = tokenTxResponse.result;
    log(`Found ${transactions.token.length} token transactions for ${address}`);
  }
  
  return transactions;
}

/**
 * Find direct connections between an address and the target address
 * @param {string} address - Ethereum address to check
 * @param {string} participantCode - Participant identifier
 * @returns {Array} - Direct connections found
 */
async function findDirectConnections(address, participantCode) {
  log(`Checking direct connections for ${address}`);
  
  // Get all transactions
  const transactions = await getTransactions(address);
  
  // Direct connections to target
  const directConnections = [];
  
  // Case-insensitive comparison for Ethereum addresses
  const addressLower = address.toLowerCase();
  const targetLower = CONFIG.TARGET_ADDRESS.toLowerCase();
  
  // Process normal transactions
  function processTransactions(txList, txType) {
    for (const tx of txList) {
      // Skip transactions with missing from/to
      if (!tx.from || !tx.to) continue;
      
      const txFrom = tx.from.toLowerCase();
      const txTo = tx.to.toLowerCase();
      
      // Check for direct connection to target
      if (txFrom === addressLower && txTo === targetLower) {
        // Outgoing transaction to target
        directConnections.push({
          type: txType,
          direction: 'outgoing',
          hash: tx.hash,
          from: tx.from,
          to: tx.to,
          value: tx.value,
          ethValue: formatEth(tx.value),
          timestamp: tx.timeStamp,
          tokenName: tx.tokenName || null,
          tokenSymbol: tx.tokenSymbol || null,
          participantCode: participantCode
        });
        
        log(`Found outgoing ${txType} transaction to target: ${tx.hash}`, 'success');
      } 
      else if (txTo === addressLower && txFrom === targetLower) {
        // Incoming transaction from target
        directConnections.push({
          type: txType,
          direction: 'incoming',
          hash: tx.hash,
          from: tx.from,
          to: tx.to,
          value: tx.value,
          ethValue: formatEth(tx.value),
          timestamp: tx.timeStamp,
          tokenName: tx.tokenName || null,
          tokenSymbol: tx.tokenSymbol || null,
          participantCode: participantCode
        });
        
        log(`Found incoming ${txType} transaction from target: ${tx.hash}`, 'success');
      }
    }
  }
  
  // Process all transaction types
  processTransactions(transactions.normal, 'normal');
  processTransactions(transactions.internal, 'internal');
  processTransactions(transactions.token, 'token');
  
  if (directConnections.length > 0) {
    log(`✅ Found ${directConnections.length} direct connections for ${address}`, 'success');
  } else {
    log(`No direct connections found for ${address}`, 'info');
  }
  
  return directConnections;
}

/**
 * Format transaction for CSV output
 * @param {Object} tx - Transaction data
 * @returns {Object} - Formatted transaction for CSV
 */
function formatTransactionForCSV(tx) {
  return {
    participant_code: tx.participantCode || '',
    wallet: tx.from === CONFIG.TARGET_ADDRESS.toLowerCase() ? tx.to : tx.from,
    tx_hash: tx.hash,
    direction: tx.direction,
    amount: tx.type === 'token' && tx.tokenSymbol
      ? `${tx.value} ${tx.tokenSymbol}`
      : `${tx.ethValue} ETH`,
    timestamp: formatTimestamp(tx.timestamp),
    tx_type: tx.type
  };
}

/**
 * Main function to process the CSV file
 */
async function processAddressList() {
  log(`ETHEREUM DIRECT CONNECTION DETECTOR`, 'title');
  log(`Target address: ${CONFIG.TARGET_ADDRESS}`);
  log(`Looking for direct connections only`);
  log(`Input file: ${CONFIG.INPUT_CSV}`);
  
  // Setup CSV writer for direct connections
  const csvWriter = createObjectCsvWriter({
    path: OUTPUT_FILE,
    header: [
      { id: 'participant_code', title: 'PARTICIPANT_CODE' },
      { id: 'wallet', title: 'WALLET' },
      { id: 'tx_hash', title: 'TX_HASH' },
      { id: 'direction', title: 'DIRECTION' },
      { id: 'amount', title: 'AMOUNT' },
      { id: 'timestamp', title: 'TIMESTAMP' },
      { id: 'tx_type', title: 'TYPE' }
    ]
  });
  
  try {
    // Read addresses from CSV
    const addresses = [];
    
    // If CSV file doesn't exist, handle error
    if (!fs.existsSync(CONFIG.INPUT_CSV)) {
      log(`Input file ${CONFIG.INPUT_CSV} does not exist!`, 'error');
      throw new Error(`Input file ${CONFIG.INPUT_CSV} does not exist!`);
    }
    
    // Read addresses from CSV
    await new Promise((resolve, reject) => {
      fs.createReadStream(CONFIG.INPUT_CSV)
        .pipe(csv())
        .on('data', (row) => {
          // Extract address and code from the row
          const address = row.eth_address || row.ETH_ADDRESS;
          const participantCode = row.participant_code || row.PARTICIPANT_CODE;
          
          if (address) {
            // Basic validation
            if (!address.startsWith('0x')) {
              log(`Warning: Address ${address} doesn't start with 0x, may be invalid`, 'warning');
            }
            
            addresses.push({
              address: address,
              participantCode: participantCode || ''
            });
          }
        })
        .on('end', () => {
          log(`Loaded ${addresses.length} addresses from CSV`);
          resolve();
        })
        .on('error', (error) => {
          log(`Error reading CSV: ${error.message}`, 'error');
          reject(error);
        });
    });
    
    if (addresses.length === 0) {
      log('No addresses found in the CSV file!', 'error');
      throw new Error('No addresses found in the CSV file!');
    }
    
    // All transactions that will be saved to CSV
    const allTransactions = [];
    
    // Process addresses in batches
    log(`Beginning analysis of ${addresses.length} addresses`, 'title');
    
    for (let i = 0; i < addresses.length; i += CONFIG.BATCH_SIZE) {
      const batch = addresses.slice(i, Math.min(i + CONFIG.BATCH_SIZE, addresses.length));
      const batchNumber = Math.floor(i / CONFIG.BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(addresses.length / CONFIG.BATCH_SIZE);
      
      log(`Processing batch ${batchNumber}/${totalBatches} (${batch.length} addresses)`, 'title');
      
      // Process each address in batch
      for (let j = 0; j < batch.length; j++) {
        const item = batch[j];
        const currentIndex = i + j + 1;
        
        if (CONFIG.SHOW_PROGRESS_BAR) {
          process.stdout.write(`\r${getProgressBar(currentIndex, addresses.length)} `);
        }
        
        try {
          if (!item.address) {
            log(`Skipping invalid address at position ${currentIndex}`, 'warning');
            continue;
          }
          
          // Find direct connections only
          const connections = await findDirectConnections(item.address, item.participantCode);
          
          // If connections found, format for CSV
          if (connections.length > 0) {
            for (const connection of connections) {
              allTransactions.push(formatTransactionForCSV(connection));
            }
          }
        } catch (error) {
          log(`Error processing ${item.address}: ${error.message}`, 'error');
        }
      }
      
      // Save results after each batch
      if (allTransactions.length > 0) {
        await csvWriter.writeRecords(allTransactions);
        log(`Saved ${allTransactions.length} transactions to CSV`);
      }
      
      // Delay between batches
      if (i + CONFIG.BATCH_SIZE < addresses.length) {
        log(`Batch complete. Pausing for ${CONFIG.BATCH_DELAY/1000} seconds before next batch...`);
        await sleep(CONFIG.BATCH_DELAY);
      }
    }
    
    // Final stats
    const incomingTxs = allTransactions.filter(tx => tx.direction === 'incoming').length;
    const outgoingTxs = allTransactions.filter(tx => tx.direction === 'outgoing').length;
    
    log(`ANALYSIS COMPLETED`, 'title');
    log(`Found ${allTransactions.length} direct transactions with target address`, 'success');
    log(`- Incoming transactions (from target): ${incomingTxs}`);
    log(`- Outgoing transactions (to target): ${outgoingTxs}`);
    log(`Results saved to: ${OUTPUT_FILE}`);
    
    return {
      totalAddresses: addresses.length,
      totalTransactions: allTransactions.length,
      incomingTransactions: incomingTxs,
      outgoingTransactions: outgoingTxs
    };
    
  } catch (error) {
    log(`Fatal error: ${error.message}`, 'error');
    throw error;
  }
}

// Run the main function
processAddressList()
  .then(result => {
    console.log("\n==================================================");
    console.log(`INVESTIGATION SUMMARY:`);
    console.log(`- Target address: ${CONFIG.TARGET_ADDRESS}`);
    console.log(`- Addresses analyzed: ${result.totalAddresses}`);
    console.log(`- Direct transactions found: ${result.totalTransactions}`);
    console.log(`  - Incoming (from target): ${result.incomingTransactions}`);
    console.log(`  - Outgoing (to target): ${result.outgoingTransactions}`);
    console.log(`- Results saved to: ${OUTPUT_FILE}`);
    console.log("==================================================\n");
  })
  .catch(error => {
    console.error(`Process failed: ${error.message}`);
  });
