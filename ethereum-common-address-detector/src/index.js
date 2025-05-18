/**
 * Ethereum Common Address Detector
 * 
 * This script identifies addresses that have direct transactions with
 * multiple addresses from your input list (CSV file).
 * 
 */

const axios = require('axios');
const fs = require('fs');
const csv = require('csv-parser');
const { createObjectCsvWriter } = require('csv-writer');
const path = require('path');

// Configuration
const CONFIG = {
  // Etherscan API key
  ETHERSCAN_API_KEY: 'your api key',
  
  // Process settings
  BATCH_SIZE: 5,
  BATCH_DELAY: 2000,
  REQUEST_DELAY: 500,
  MAX_RETRIES: 3,
  MIN_COMMON_ADDRESSES: 2,  // Minimum input addresses a counterparty must interact with
  
  // Files
  INPUT_CSV: 'addresses.csv',
  OUTPUT_DIR: 'results',
  OUTPUT_FILE: 'common_connections.csv',
  
  // Address filtering
  EXCLUDE_EXCHANGES: true,  // Exclude known exchange and service addresses
  
  // Exchange and service addresses to exclude
  KNOWN_SERVICES: [
    // Major exchanges
    '0x28c6c06298d514db089934071355e5743bf21d60', // Binance
    '0xdfd5293d8e347dfe59e90efd55b2956a1343963d', // Binance
    '0x3f5ce5fbfe3e9af3971dd833d26ba9b5c936f0be', // Binance 
    '0xd551234ae421e3bcba99a0da6d736074f22192ff', // Binance
    '0x564286362092d8e7936f0549571a803b203aaced', // Binance
    '0x0681d8db095565fe8a346fa0277bffde9c0edbbf', // Binance
    '0xfe9e8709d3215310075d67e3ed32a380ccf451c8', // Binance
    '0x4e9ce36e442e55ecd9025b9a6e0d88485d628a67', // Binance
    '0xbe0eb53f46cd790cd13851d5eff43d12404d33e8', // Binance
    '0xf977814e90da44bfa03b6295a0616a897441acec', // Binance
    '0x8315177ab297ba92a06054ce80a67ed4dbd7ed3a', // Binance
    
    '0x2faf487a4414fe77e2327f0bf4ae2a264a776ad2', // Coinbase
    '0xeb2629a2734e272bcc07bda959863f316f4bd4cf', // Coinbase
    '0x503828976d22510aad0201ac7ec88293211d23da', // Coinbase
    '0xddfabcdc4d8ffc6d5beaf154f18b778f892a0740', // Coinbase
    
    '0x4ad64983349c49defe8d7a4686202d24b25f366f', // Kraken
    '0x267be1c1d684f78cb4f6a176c4911b741e4ffdc0', // Kraken
    
    '0x701c484bfb40ac628afa487b6082f084b14af0bd', // Gemini
    '0xd24400ae8bfebb18ca49be86258a3c749cf46853', // Gemini
    
    '0x05f51aab068caa6ab7eeb672f88c180f67f17ec7', // Kucoin
    
    // DEXes and swap services
    '0x11111112542d85b3ef69ae05771c2dccff4faa26', // 1inch
    '0x1111111254fb6c44bac0bed2854e76f90643097d', // 1inch
    '0x1111111254eeb25477b68fb85ed929f73a960582', // 1inch
    
    '0x7a250d5630b4cf539739df2c5dacb4c659f2488d', // Uniswap Router
    '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45', // Uniswap Router
    '0xd9e1ce17f2641f24ae83637ab66a2cca9c378b9f', // SushiSwap
    
    '0x881d40237659c251811cec9c364ef91dc08d300c', // Metamask Swap Router
    
    // Non-custodial services
    '0x00000000219ab540356cbb839cbe05303d7705fa', // Ethereum 2.0 Deposit Contract
    '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', // WETH (Wrapped Ether)
    '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', // USDC
    '0xdac17f958d2ee523a2206206994597c13d831ec7', // USDT
    '0x6b175474e89094c44da98b954eedeac495271d0f', // DAI
    
    // Known high-volume traders or market makers
    '0x3883f5e181cacd4fdf2a2d6724999b12ce1dc93c', // Theta
    '0x08638ef1a205be6762a8b935f5da9b700cf7322c', // Wintermute
    
    // Add more services as needed
  ]
};

// File paths
const API_URL = 'https://api.etherscan.io/api';
const OUTPUT_PATH = path.join(CONFIG.OUTPUT_DIR, CONFIG.OUTPUT_FILE);

// Create output directory if it doesn't exist
if (!fs.existsSync(CONFIG.OUTPUT_DIR)) {
  fs.mkdirSync(CONFIG.OUTPUT_DIR, { recursive: true });
}

// Logging function with colored output
function log(message, type = 'info') {
  const timestamp = new Date().toISOString();
  let formattedMessage;
  
  switch(type) {
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
      formattedMessage = `\n[${timestamp}] === ${message.toUpperCase()} ===\n`;
      break;
    case 'progress':
      // No timestamp for progress updates to keep the line clean
      formattedMessage = message;
      break;
    default:
      formattedMessage = `[${timestamp}] ${message}`;
  }
  
  // For progress updates, use process.stdout.write to stay on the same line
  if (type === 'progress') {
    process.stdout.write(formattedMessage);
  } else {
    console.log(formattedMessage);
  }
}

// Progress bar function
function getProgressBar(current, total, width = 30) {
  const percentage = Math.min(100, Math.round((current / total) * 100));
  const filledWidth = Math.round((current / total) * width);
  const emptyWidth = width - filledWidth;
  
  const filled = '█'.repeat(filledWidth);
  const empty = '░'.repeat(emptyWidth);
  
  return `[${filled}${empty}] ${percentage}% (${current}/${total})`;
}

// Sleep function
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Format ETH value from wei
function formatEth(wei) {
  return parseFloat(wei) / 1e18;
}

// Format timestamp
function formatTimestamp(timestamp) {
  return new Date(parseInt(timestamp) * 1000).toISOString();
}

// Make request to Etherscan API with retry logic
async function etherscanRequest(params, retries = 0) {
  try {
    const response = await axios.get(API_URL, {
      params: {
        ...params,
        apikey: CONFIG.ETHERSCAN_API_KEY
      },
      timeout: 10000
    });
    
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
    log(`Request error. Retrying in ${waitTime/1000}s`, 'warning');
    await sleep(waitTime);
    return etherscanRequest(params, retries + 1);
  }
}

// Get all transactions for an address
async function getTransactions(address) {
  log(`Getting transactions for ${address}`);
  const normAddress = address.toLowerCase();
  
  const transactions = {
    normal: [],
    internal: [],
    token: []
  };
  
  // 1. Get normal transactions
  const normalTxParams = {
    module: 'account',
    action: 'txlist',
    address: normAddress,
    startblock: 0,
    endblock: 99999999,
    page: 1,
    offset: 10000,
    sort: 'desc'
  };
  
  const normalTxResponse = await etherscanRequest(normalTxParams);
  if (normalTxResponse.result && Array.isArray(normalTxResponse.result)) {
    transactions.normal = normalTxResponse.result;
    log(`- Found ${transactions.normal.length} normal transactions`);
  }
  
  await sleep(CONFIG.REQUEST_DELAY);
  
  // 2. Get internal transactions
  const internalTxParams = {
    module: 'account',
    action: 'txlistinternal',
    address: normAddress,
    startblock: 0,
    endblock: 99999999,
    page: 1,
    offset: 10000,
    sort: 'desc'
  };
  
  const internalTxResponse = await etherscanRequest(internalTxParams);
  if (internalTxResponse.result && Array.isArray(internalTxResponse.result)) {
    transactions.internal = internalTxResponse.result;
    log(`- Found ${transactions.internal.length} internal transactions`);
  }
  
  await sleep(CONFIG.REQUEST_DELAY);
  
  // 3. Get token transactions
  const tokenTxParams = {
    module: 'account',
    action: 'tokentx',
    address: normAddress,
    startblock: 0,
    endblock: 99999999,
    page: 1,
    offset: 10000,
    sort: 'desc'
  };
  
  const tokenTxResponse = await etherscanRequest(tokenTxParams);
  if (tokenTxResponse.result && Array.isArray(tokenTxResponse.result)) {
    transactions.token = tokenTxResponse.result;
    log(`- Found ${transactions.token.length} token transactions`);
  }
  
  return transactions;
}

// Extract all counterparties from transactions
function extractCounterparties(address, transactions) {
  const normAddress = address.toLowerCase();
  const counterparties = new Map(); // counterparty => [transactions]
  
  function processTransactions(txList, txType) {
    for (const tx of txList) {
      // Skip transactions with missing from/to
      if (!tx.from || !tx.to) continue;
      
      const txFrom = tx.from.toLowerCase();
      const txTo = tx.to.toLowerCase();
      
      let counterparty;
      let direction;
      
      // Determine the counterparty
      if (txFrom === normAddress) {
        counterparty = txTo;
        direction = 'outgoing';
      } else if (txTo === normAddress) {
        counterparty = txFrom;
        direction = 'incoming';
      } else {
        continue; // Not related to this address
      }
      
      // Skip self-transactions
      if (counterparty === normAddress) continue;
      
      // Store the transaction with additional metadata
      if (!counterparties.has(counterparty)) {
        counterparties.set(counterparty, []);
      }
      
      counterparties.get(counterparty).push({
        ...tx,
        txType,
        direction,
        ethValue: formatEth(tx.value),
        formattedTimestamp: formatTimestamp(tx.timeStamp)
      });
    }
  }
  
  // Process all transaction types
  processTransactions(transactions.normal, 'normal');
  processTransactions(transactions.internal, 'internal');
  processTransactions(transactions.token, 'token');
  
  return counterparties;
}

// Process list of addresses
async function processAddressList() {
  log(`ETHEREUM COMMON ADDRESS DETECTOR`, 'title');
  log(`Looking for common counterparties across multiple input addresses`);
  
  try {
    // Read addresses from CSV
    const addresses = [];
    
    if (!fs.existsSync(CONFIG.INPUT_CSV)) {
      log(`Input file ${CONFIG.INPUT_CSV} does not exist!`, 'error');
      throw new Error(`Input file ${CONFIG.INPUT_CSV} does not exist!`);
    }
    
    // Read CSV
    await new Promise((resolve, reject) => {
      fs.createReadStream(CONFIG.INPUT_CSV)
        .pipe(csv())
        .on('data', (row) => {
          const address = row.eth_address || row.ETH_ADDRESS;
          
          if (address) {
            if (!address.startsWith('0x')) {
              log(`Warning: Address ${address} may be invalid`, 'warning');
            }
            
            addresses.push({
              address
            });
          }
        })
        .on('end', () => {
          log(`Loaded ${addresses.length} addresses from CSV`, 'success');
          resolve();
        })
        .on('error', (error) => {
          reject(error);
        });
    });
    
    if (addresses.length === 0) {
      throw new Error('No addresses found in the CSV file!');
    }
    
    // Counter to track the source addresses that interact with each counterparty
    // Format: counterparty => Set of source addresses
    const counterpartyTracker = new Map();
    
    // Store all transactions for common counterparties
    // Format: counterparty => [transactions]
    const commonCounterpartyTransactions = new Map();
    
    // Display stats before processing
    log(`Starting analysis of ${addresses.length} addresses for common counterparties`, 'title');
    log(`Minimum connections required: ${CONFIG.MIN_COMMON_ADDRESSES}`);
    log(`Processing in batches of ${CONFIG.BATCH_SIZE} with ${CONFIG.BATCH_DELAY}ms delay between batches`);
    
    // Process each address in batches
    for (let i = 0; i < addresses.length; i += CONFIG.BATCH_SIZE) {
      const batch = addresses.slice(i, Math.min(i + CONFIG.BATCH_SIZE, addresses.length));
      const batchNumber = Math.floor(i/CONFIG.BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(addresses.length/CONFIG.BATCH_SIZE);
      
      log(`Processing batch ${batchNumber}/${totalBatches}`, 'title');
      
      for (let j = 0; j < batch.length; j++) {
        const item = batch[j];
        const currentAddressIndex = i + j + 1;
        
        // Update progress
        log(`\r${getProgressBar(currentAddressIndex, addresses.length)} Processing: ${item.address}`, 'progress');
        
        try {
          // Get all transactions
          const transactions = await getTransactions(item.address);
          
          // Extract all counterparties
          const counterparties = extractCounterparties(item.address, transactions);
          
          // Update counterparty tracker
          for (const [counterparty, txs] of counterparties.entries()) {
            if (!counterpartyTracker.has(counterparty)) {
              counterpartyTracker.set(counterparty, new Set());
            }
            
            // Add source address to the set of addresses that interact with this counterparty
            counterpartyTracker.get(counterparty).add(item.address.toLowerCase());
            
            // Store transactions for this counterparty
            if (!commonCounterpartyTransactions.has(counterparty)) {
              commonCounterpartyTransactions.set(counterparty, []);
            }
            
          
          // Clear line after progress bar
          process.stdout.write('\r' + ' '.repeat(100) + '\r');
          log(`✓ Processed ${item.address} ${counterparties.size} counterparties`);
          
        } catch (error) {
          // Clear line after progress bar
          process.stdout.write('\r' + ' '.repeat(100) + '\r');
          log(`Error processing ${item.address}: ${error.message}`, 'error');
        }
      }
      
      // Delay between batches
      if (i + CONFIG.BATCH_SIZE < addresses.length) {
        log(`Batch ${batchNumber} complete. Pausing for ${CONFIG.BATCH_DELAY/1000} seconds before next batch...`);
        await sleep(CONFIG.BATCH_DELAY);
      }
    }
    
    // Clear any progress bar remnants
    process.stdout.write('\r' + ' '.repeat(100) + '\r');
    
    // Filter for common counterparties (interact with multiple source addresses)
    log(`ANALYZING RESULTS`, 'title');
    log(`Found ${counterpartyTracker.size} total counterparties across all addresses`);
    
    const commonCounterparties = [];
    let excludedServices = 0;
    
    for (const [counterparty, sourceAddresses] of counterpartyTracker.entries()) {
      // Skip if this is a known service/exchange and filtering is enabled
      if (CONFIG.EXCLUDE_EXCHANGES && 
          CONFIG.KNOWN_SERVICES.some(service => service.toLowerCase() === counterparty.toLowerCase())) {
        log(`Excluding known service: ${counterparty}`, 'warning');
        excludedServices++;
        continue;
      }
      
      if (sourceAddresses.size >= CONFIG.MIN_COMMON_ADDRESSES) {
        commonCounterparties.push({
          address: counterparty,
          interactionCount: sourceAddresses.size,
          sourceAddresses: Array.from(sourceAddresses)
        });
        
        log(`Found common counterparty: ${counterparty} (interacts with ${sourceAddresses.size} addresses)`, 'success');
      }
    }
    
    log(`Found ${commonCounterparties.length} common counterparties that interact with at least ${CONFIG.MIN_COMMON_ADDRESSES} addresses`, 'success');
    
    if (excludedServices > 0) {
      log(`Excluded ${excludedServices} known exchange/service addresses from results`, 'warning');
    }
    
    // Prepare records for CSV
    const csvRecords = [];
    
    // Special check for the problematic address
    const checkAddress = '0x9d3f6c33f1d81a5174701f94ac18b385f092aaa5'.toLowerCase();
    if (counterpartyTracker.has(checkAddress)) {
      const sources = counterpartyTracker.get(checkAddress);
      log(`SPECIAL CHECK: ${checkAddress} interacts with ${sources.size} addresses:`, 'title');
      sources.forEach(source => log(`- ${source}`));
    }
    
    // Format transaction records for CSV
    log(`Preparing CSV output records...`);
    for (const commonCounterparty of commonCounterparties) {
      const transactions = commonCounterpartyTransactions.get(commonCounterparty.address) || [];
      
      for (const tx of transactions) {
        csvRecords.push({
          wallet: tx.sourceAddress,
          common_address: commonCounterparty.address,  // Added common address
          tx_hash: tx.hash,
          amount: tx.txType === 'token' && tx.tokenSymbol
            ? `${tx.value} ${tx.tokenSymbol}`
            : `${tx.ethValue} ETH`
        });
      }
    }
    
    log(`Generated ${csvRecords.length} records for CSV output`);
    
    // Write to CSV
    const csvWriter = createObjectCsvWriter({
      path: OUTPUT_PATH,
      header: [
        { id: 'wallet', title: 'WALLET' },
        { id: 'common_address', title: 'COMMON_ADDRESS' },  // Added to header
        { id: 'tx_hash', title: 'TX_HASH' },
        { id: 'amount', title: 'AMOUNT' }
      ]
    });
    
    if (csvRecords.length > 0) {
      await csvWriter.writeRecords(csvRecords);
      log(`Saved ${csvRecords.length} records to ${OUTPUT_PATH}`, 'success');
    } else {
      log(`No common counterparties found. No output file created.`, 'warning');
    }
    
    // Create a summary file with counts
    const summaryPath = path.join(CONFIG.OUTPUT_DIR, 'common_addresses_summary.csv');
    const summaryWriter = createObjectCsvWriter({
      path: summaryPath,
      header: [
        { id: 'common_address', title: 'COMMON_ADDRESS' },
        { id: 'interaction_count', title: 'SOURCE_ADDRESS_COUNT' },
        { id: 'transaction_count', title: 'TRANSACTION_COUNT' }
      ]
    });
    
    const summaryRecords = commonCounterparties.map(cc => ({
      common_address: cc.address,
      interaction_count: cc.interactionCount,
      transaction_count: commonCounterpartyTransactions.get(cc.address).length
    }));
    
    await summaryWriter.writeRecords(summaryRecords);
    log(`Saved summary to ${summaryPath}`, 'success');
    
    return {
      totalAddresses: addresses.length,
      commonCounterparties: commonCounterparties.length,
      transactions: csvRecords.length
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
    console.log(`COMMON ADDRESS ANALYSIS SUMMARY:`);
    console.log(`- Input addresses analyzed: ${result.totalAddresses}`);
    console.log(`- Common counterparties found: ${result.commonCounterparties}`);
    console.log(`- Total transactions: ${result.transactions}`);
    console.log(`- Exchange/service filtering: ${CONFIG.EXCLUDE_EXCHANGES ? 'ON' : 'OFF'}`);
    console.log(`- Results saved to: ${OUTPUT_PATH}`);
    console.log(`- Summary saved to: ${path.join(CONFIG.OUTPUT_DIR, 'common_addresses_summary.csv')}`);
    console.log("==================================================\n");
  })
  .catch(error => {
    console.error(`Process failed: ${error.message}`);
  });
