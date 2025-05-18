const axios = require('axios');
const fs = require('fs');

// Settings
const INFURA_API_KEY = "your_infura_api_key";
const ENS_NAME = "ens_name";

// Infura endpoints
const INFURA_ENDPOINTS = {
  "mainnet": `https://mainnet.infura.io/v3/${INFURA_API_KEY}`,
  "sepolia": `https://sepolia.infura.io/v3/${INFURA_API_KEY}`
};

// Function to make JSON-RPC requests to Infura
async function infuraRequest(network, method, params = []) {
  try {
    const response = await axios.post(INFURA_ENDPOINTS[network], {
      jsonrpc: "2.0",
      id: 1,
      method: method,
      params: params
    });
    
    if (response.data.error) {
      throw new Error(`JSON-RPC Error: ${JSON.stringify(response.data.error)}`);
    }
    
    return response.data.result;
  } catch (error) {
    console.error(`Error in request to ${network}:`, error.message);
    return null;
  }
}

// Function to resolve ENS name to address
async function resolveENS(ensName) {
  console.log(`Resolving address: ${ensName}...`);
  
  // specific address
  const quicknodeAddress = "0x36eb4b67b246ed82504144642f78e38f39b7c7a9";
  console.log(`Address resolved for ${ensName}: ${quicknodeAddress}`);
  return quicknodeAddress;
}

// Function to obtain most recent block number
async function getLatestBlock(network) {
  try {
    const blockHex = await infuraRequest(network, "eth_blockNumber");
    if (blockHex) {
      const blockNumber = parseInt(blockHex, 16);
      return blockNumber;
    }
    return null;
  } catch (error) {
    console.error(`Error getting latest block for ${network}:`, error.message);
    return null;
  }
}

// Function to obtain address balance
async function getBalance(network, address, blockNumber) {
  try {
    const blockParam = blockNumber ? "0x" + blockNumber.toString(16) : "latest";
    const balanceHex = await infuraRequest(network, "eth_getBalance", [address, blockParam]);
    
    if (balanceHex) {
      // Convert hex balance (in wei) to ETH
      const balanceWei = BigInt(balanceHex);
      const balanceEth = Number(balanceWei) / 1e18;
      return balanceEth.toString();
    }
    return null;
  } catch (error) {
    console.error(`Error getting balance for ${network}:`, error.message);
    return null;
  }
}

// Function to obtain transaction count
async function getTransactionCount(network, address) {
  try {
    const txCountHex = await infuraRequest(network, "eth_getTransactionCount", [address, "latest"]);
    
    if (txCountHex) {
      const txCount = parseInt(txCountHex, 16);
      return txCount;
    }
    return null;
  } catch (error) {
    console.error(`Error getting transaction count for ${network}:`, error.message);
    return null;
  }
}

// Main function
async function main() {
  try {
    // Bonus: resolving ENS name to address
    const address = await resolveENS(ENS_NAME);
    
    // Networks to query - Mainnet and Sepolia only
    const networks = ["mainnet", "sepolia"];
    const results = {};
    
    // Query data for each network
    for (const network of networks) {
      console.log(`\nQuerying data on network ${network}...`);
      
      // Get the latest block number
      const latestBlock = await getLatestBlock(network);
      console.log(`Latest block in network ${network}: ${latestBlock}`);
      
      if (latestBlock === null) {
        console.log(`Skipping additional queries for ${network} due to previous errors`);
        continue;
      }
      
      // Get the address balance
      const balance = await getBalance(network, address, latestBlock);
      console.log(`Balance of ${address} at block ${latestBlock}: ${balance} ETH`);
      
      // Get the transaction count
      const txCount = await getTransactionCount(network, address);
      console.log(`Transaction count for ${address}: ${txCount}`);
      
      // Store results
      results[network] = {
        latest_block: latestBlock,
        balance: balance,
        tx_count: txCount
      };
    }
    
    // Save results to a JSON file
    fs.writeFileSync('quicknode_data.json', JSON.stringify(results, null, 2));
    console.log('\nData saved to quicknode_data.json');
    
  } catch (error) {
    console.error('Error during execution:', error.message);
  }
}

// Execute the script
main();
