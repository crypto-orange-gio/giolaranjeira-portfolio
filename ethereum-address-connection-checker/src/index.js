const axios = require('axios');
const fs = require('fs');

// Configuration
const TARGET_ADDRESS = '0x9d3f5b2a32a0928123cd9440e94a15d37ec1aaa5'.toLowerCase();
const ETHERSCAN_API_KEY = 'your api key';
const ETHERSCAN_API_URL = 'https://api.etherscan.io/api';

// Array of addresses to check (replace with your addresses)
const ADDRESSES_TO_CHECK = [
    '0x6fab69f3ba81ed9b2aab93a6558651e3deecf1d6'
];

// Rate limiting settings
const BATCH_DELAY = 6000; // 6 seconds between batches
const REQUEST_DELAY = 300; // 300ms between individual requests
const MAX_RETRIES = 3;
const RETRY_DELAY = 3000; // 3 seconds before retry

// Log function that writes to console only
function log(message) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}`;
    console.log(logMessage);
}

// Make a request to the Etherscan API with retry logic
async function makeEtherscanRequest(params) {
    let retries = 0;
    
    while (retries <= MAX_RETRIES) {
        try {
            const response = await axios.get(ETHERSCAN_API_URL, {
                params: {
                    ...params,
                    apikey: ETHERSCAN_API_KEY
                }
            });
            
            if (response.data.status === '0' && response.data.message.includes('rate limit')) {
                retries++;
                
                if (retries > MAX_RETRIES) {
                    log(`ERROR: Rate limit exceeded after ${MAX_RETRIES} retries. Giving up on this request.`);
                    return { error: 'Rate limit exceeded' };
                }
                
                const waitTime = RETRY_DELAY * retries;
                log(`Rate limit hit. Retry ${retries}/${MAX_RETRIES} after ${waitTime/1000} seconds...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
            } else {
                return response.data;
            }
            
        } catch (error) {
            retries++;
            
            if (retries > MAX_RETRIES) {
                log(`API error after ${MAX_RETRIES} retries: ${error.message}`);
                return { error: error.message };
            }
            
            const waitTime = RETRY_DELAY * retries;
            log(`API error. Retry ${retries}/${MAX_RETRIES} after ${waitTime/1000} seconds...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
    }
}

// Check if an address has any transactions with the target address
async function checkAddressConnection(address) {
    const formattedAddress = address.toLowerCase();
    log(`Checking address: ${formattedAddress}`);
    
    try {
        // Collection to store all relevant transaction hashes
        const connectionTxs = [];
        
        // METHOD 1: Check transactions SENT by the checked address
        const outgoingTxParams = {
            module: 'account',
            action: 'txlist',
            address: formattedAddress,
            startblock: 0,
            endblock: 99999999,
            page: 1,
            offset: 1000,
            sort: 'desc'
        };
        
        const outgoingTxResponse = await makeEtherscanRequest(outgoingTxParams);
        
        if (outgoingTxResponse.result && Array.isArray(outgoingTxResponse.result)) {
            for (const tx of outgoingTxResponse.result) {
                if (tx.to && tx.to.toLowerCase() === TARGET_ADDRESS) {
                    log(`✅ CONNECTION FOUND! ${formattedAddress} sent to ${TARGET_ADDRESS} in tx ${tx.hash}`);
                    
                    connectionTxs.push({
                        hash: tx.hash,
                        type: 'normal',
                        direction: 'outgoing',
                        blockNumber: tx.blockNumber,
                        timestamp: tx.timeStamp,
                        value: tx.value
                    });
                }
            }
        }
        
        await new Promise(resolve => setTimeout(resolve, REQUEST_DELAY));
        
        // METHOD 2: Check transactions RECEIVED by the checked address
        const targetTxParams = {
            module: 'account',
            action: 'txlist',
            address: TARGET_ADDRESS,
            startblock: 0,
            endblock: 99999999,
            page: 1,
            offset: 1000,
            sort: 'desc'
        };
        
        const targetTxResponse = await makeEtherscanRequest(targetTxParams);
        
        if (targetTxResponse.result && Array.isArray(targetTxResponse.result)) {
            for (const tx of targetTxResponse.result) {
                if (tx.to && tx.to.toLowerCase() === formattedAddress) {
                    log(`✅ CONNECTION FOUND! ${formattedAddress} received from ${TARGET_ADDRESS} in tx ${tx.hash}`);
                    
                    connectionTxs.push({
                        hash: tx.hash,
                        type: 'normal',
                        direction: 'incoming',
                        blockNumber: tx.blockNumber,
                        timestamp: tx.timeStamp,
                        value: tx.value
                    });
                }
                
                // Also check sender
                if (tx.from && tx.from.toLowerCase() === formattedAddress) {
                    log(`✅ CONNECTION FOUND! ${formattedAddress} sent to ${TARGET_ADDRESS} in tx ${tx.hash} (from target tx list)`);
                    
                    // Check if we already added this transaction
                    if (!connectionTxs.some(existingTx => existingTx.hash === tx.hash)) {
                        connectionTxs.push({
                            hash: tx.hash,
                            type: 'normal',
                            direction: 'outgoing',
                            blockNumber: tx.blockNumber,
                            timestamp: tx.timeStamp,
                            value: tx.value
                        });
                    }
                }
            }
        }
        
        await new Promise(resolve => setTimeout(resolve, REQUEST_DELAY));
        
        // METHOD 3: Check internal transactions of the checked address
        const internalTxParams = {
            module: 'account',
            action: 'txlistinternal',
            address: formattedAddress,
            startblock: 0,
            endblock: 99999999,
            page: 1,
            offset: 1000,
            sort: 'desc'
        };
        
        const internalTxResponse = await makeEtherscanRequest(internalTxParams);
        
        if (internalTxResponse.result && Array.isArray(internalTxResponse.result)) {
            for (const tx of internalTxResponse.result) {
                if (tx.to && tx.to.toLowerCase() === TARGET_ADDRESS) {
                    log(`✅ CONNECTION FOUND! ${formattedAddress} sent internal tx to ${TARGET_ADDRESS} in tx ${tx.hash}`);
                    
                    if (!connectionTxs.some(existingTx => existingTx.hash === tx.hash)) {
                        connectionTxs.push({
                            hash: tx.hash,
                            type: 'internal',
                            direction: 'outgoing',
                            blockNumber: tx.blockNumber,
                            timestamp: tx.timeStamp,
                            value: tx.value
                        });
                    }
                } else if (tx.from && tx.from.toLowerCase() === TARGET_ADDRESS) {
                    log(`✅ CONNECTION FOUND! ${formattedAddress} received internal tx from ${TARGET_ADDRESS} in tx ${tx.hash}`);
                    
                    if (!connectionTxs.some(existingTx => existingTx.hash === tx.hash)) {
                        connectionTxs.push({
                            hash: tx.hash,
                            type: 'internal', 
                            direction: 'incoming',
                            blockNumber: tx.blockNumber,
                            timestamp: tx.timeStamp,
                            value: tx.value
                        });
                    }
                }
            }
        }
        
        await new Promise(resolve => setTimeout(resolve, REQUEST_DELAY));
        
        // METHOD 4: Check internal transactions of the target address
        const targetInternalTxParams = {
            module: 'account',
            action: 'txlistinternal',
            address: TARGET_ADDRESS,
            startblock: 0,
            endblock: 99999999,
            page: 1,
            offset: 1000,
            sort: 'desc'
        };
        
        const targetInternalTxResponse = await makeEtherscanRequest(targetInternalTxParams);
        
        if (targetInternalTxResponse.result && Array.isArray(targetInternalTxResponse.result)) {
            for (const tx of targetInternalTxResponse.result) {
                if (tx.to && tx.to.toLowerCase() === formattedAddress) {
                    log(`✅ CONNECTION FOUND! ${formattedAddress} received internal tx from ${TARGET_ADDRESS} in tx ${tx.hash} (from target internal list)`);
                    
                    if (!connectionTxs.some(existingTx => existingTx.hash === tx.hash)) {
                        connectionTxs.push({
                            hash: tx.hash,
                            type: 'internal',
                            direction: 'incoming',
                            blockNumber: tx.blockNumber,
                            timestamp: tx.timeStamp,
                            value: tx.value
                        });
                    }
                } else if (tx.from && tx.from.toLowerCase() === formattedAddress) {
                    log(`✅ CONNECTION FOUND! ${formattedAddress} sent internal tx to ${TARGET_ADDRESS} in tx ${tx.hash} (from target internal list)`);
                    
                    if (!connectionTxs.some(existingTx => existingTx.hash === tx.hash)) {
                        connectionTxs.push({
                            hash: tx.hash,
                            type: 'internal',
                            direction: 'outgoing',
                            blockNumber: tx.blockNumber,
                            timestamp: tx.timeStamp,
                            value: tx.value
                        });
                    }
                }
            }
        }
        
        await new Promise(resolve => setTimeout(resolve, REQUEST_DELAY));
        
        // METHOD 5: Check ERC20 token transfers of the checked address
        const erc20TxParams = {
            module: 'account',
            action: 'tokentx',
            address: formattedAddress,
            startblock: 0,
            endblock: 99999999,
            page: 1,
            offset: 1000,
            sort: 'desc'
        };
        
        const erc20TxResponse = await makeEtherscanRequest(erc20TxParams);
        
        if (erc20TxResponse.result && Array.isArray(erc20TxResponse.result)) {
            for (const tx of erc20TxResponse.result) {
                if (tx.to && tx.to.toLowerCase() === TARGET_ADDRESS) {
                    log(`✅ CONNECTION FOUND! ${formattedAddress} sent token to ${TARGET_ADDRESS} in tx ${tx.hash}`);
                    
                    if (!connectionTxs.some(existingTx => existingTx.hash === tx.hash)) {
                        connectionTxs.push({
                            hash: tx.hash,
                            type: 'erc20',
                            direction: 'outgoing',
                            blockNumber: tx.blockNumber,
                            timestamp: tx.timeStamp,
                            value: tx.value,
                            tokenName: tx.tokenName,
                            tokenSymbol: tx.tokenSymbol
                        });
                    }
                } else if (tx.from && tx.from.toLowerCase() === TARGET_ADDRESS) {
                    log(`✅ CONNECTION FOUND! ${formattedAddress} received token from ${TARGET_ADDRESS} in tx ${tx.hash}`);
                    
                    if (!connectionTxs.some(existingTx => existingTx.hash === tx.hash)) {
                        connectionTxs.push({
                            hash: tx.hash,
                            type: 'erc20',
                            direction: 'incoming',
                            blockNumber: tx.blockNumber,
                            timestamp: tx.timeStamp, 
                            value: tx.value,
                            tokenName: tx.tokenName,
                            tokenSymbol: tx.tokenSymbol
                        });
                    }
                }
            }
        }
        
        await new Promise(resolve => setTimeout(resolve, REQUEST_DELAY));
        
        // METHOD 6: Check ERC20 token transfers of the target address
        const targetErc20TxParams = {
            module: 'account',
            action: 'tokentx',
            address: TARGET_ADDRESS,
            startblock: 0,
            endblock: 99999999,
            page: 1,
            offset: 1000,
            sort: 'desc'
        };
        
        const targetErc20TxResponse = await makeEtherscanRequest(targetErc20TxParams);
        
        if (targetErc20TxResponse.result && Array.isArray(targetErc20TxResponse.result)) {
            for (const tx of targetErc20TxResponse.result) {
                if (tx.to && tx.to.toLowerCase() === formattedAddress) {
                    log(`✅ CONNECTION FOUND! ${formattedAddress} received token from ${TARGET_ADDRESS} in tx ${tx.hash} (from target token list)`);
                    
                    if (!connectionTxs.some(existingTx => existingTx.hash === tx.hash)) {
                        connectionTxs.push({
                            hash: tx.hash,
                            type: 'erc20',
                            direction: 'incoming',
                            blockNumber: tx.blockNumber,
                            timestamp: tx.timeStamp,
                            value: tx.value,
                            tokenName: tx.tokenName,
                            tokenSymbol: tx.tokenSymbol
                        });
                    }
                } else if (tx.from && tx.from.toLowerCase() === formattedAddress) {
                    log(`✅ CONNECTION FOUND! ${formattedAddress} sent token to ${TARGET_ADDRESS} in tx ${tx.hash} (from target token list)`);
                    
                    if (!connectionTxs.some(existingTx => existingTx.hash === tx.hash)) {
                        connectionTxs.push({
                            hash: tx.hash,
                            type: 'erc20',
                            direction: 'outgoing',
                            blockNumber: tx.blockNumber,
                            timestamp: tx.timeStamp,
                            value: tx.value,
                            tokenName: tx.tokenName,
                            tokenSymbol: tx.tokenSymbol
                        });
                    }
                }
            }
        }
        
        // Sort transactions by block number (descending)
        connectionTxs.sort((a, b) => parseInt(b.blockNumber) - parseInt(a.blockNumber));
        
        // Return results
        if (connectionTxs.length > 0) {
            log(`Found ${connectionTxs.length} transactions connecting ${formattedAddress} with ${TARGET_ADDRESS}`);
            return { 
                connected: true,
                transactions: connectionTxs
            };
        } else {
            log(`No connection found for ${formattedAddress}`);
            return { connected: false };
        }
        
    } catch (error) {
        log(`Error checking address ${formattedAddress}: ${error.message}`);
        return { connected: false };
    }
}

// Main function to process the address array
async function processAddressList() {
    // Log start of processing
    log(`Starting the processing of addresses...`);
    
    // Initialize empty result arrays
    const connectedAddresses = [];
    const detailedResults = {};
    
    log(`Starting to process ${ADDRESSES_TO_CHECK.length} addresses.`);
    
    // Process addresses in small batches to manage rate limits
    const BATCH_SIZE = 5; // Small batch size to avoid rate limits
    
    for (let i = 0; i < ADDRESSES_TO_CHECK.length; i += BATCH_SIZE) {
        const batch = ADDRESSES_TO_CHECK.slice(i, Math.min(i + BATCH_SIZE, ADDRESSES_TO_CHECK.length));
        log(`Processing batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(ADDRESSES_TO_CHECK.length/BATCH_SIZE)}`);
        
        // Process each address in the batch sequentially
        for (const address of batch) {
            try {
                if (!address || !address.startsWith('0x')) {
                    log(`Skipping invalid address: ${address}`);
                    continue;
                }
                
                const connection = await checkAddressConnection(address);
                
                if (connection.connected) {
                    // Format transaction hashes as comma-separated string
                    const txHashes = connection.transactions.map(tx => tx.hash).join(',');
                    
                    const result = {
                        address: address,
                        connected: true,
                        txHashes: txHashes
                    };
                    
                    connectedAddresses.push(result);
                    
                    // Save detailed data for this address
                    detailedResults[address] = {
                        address: address,
                        transactions: connection.transactions
                    };
                    
                    log(`Found connection: ${address} with ${connection.transactions.length} transactions`);
                    
                    // Log detailed connection info for this address
                    log(`DETAILED CONNECTION: ${JSON.stringify(connection.transactions, null, 2)}`);
                }
                
                // Delay between addresses in the same batch
                await new Promise(resolve => setTimeout(resolve, REQUEST_DELAY));
                
            } catch (error) {
                log(`Error processing address ${address}: ${error.message}`);
            }
        }
        
        // Delay between batches
        if (i + BATCH_SIZE < ADDRESSES_TO_CHECK.length) {
            log(`Batch complete. Pausing for ${BATCH_DELAY/1000} seconds before next batch...`);
            await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
        }
        
        // Log progress
        log(`Progress: ${Math.min(i + BATCH_SIZE, ADDRESSES_TO_CHECK.length)}/${ADDRESSES_TO_CHECK.length} addresses checked`);
        log(`Total connections found so far: ${connectedAddresses.length}`);
    }
    
    // Print complete detailed results to console
    log(`COMPLETE DETAILED RESULTS:`);
    log(JSON.stringify(detailedResults, null, 2));
    
    // Also print the results to console for immediate viewing
    log("CONNECTED ADDRESSES SUMMARY:");
    for (const conn of connectedAddresses) {
        log(`✅ ${conn.address}: Found ${conn.txHashes.split(',').length} transactions`);
    }
    
    log(`Process complete! Found ${connectedAddresses.length} connected addresses.`);
    
    // Return the results for programmatic use
    return {
        connectedAddresses,
        detailedResults
    };
}

// Run the main function
processAddressList().catch(error => {
    log(`FATAL ERROR: ${error.message}`);
    log(`Stack trace: ${error.stack}`);
});
