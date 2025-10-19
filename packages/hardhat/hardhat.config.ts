import '@nomicfoundation/hardhat-chai-matchers';
import '@nomicfoundation/hardhat-ethers';
import '@nomicfoundation/hardhat-verify';
import '@typechain/hardhat';
import 'hardhat-deploy';
import 'hardhat-gas-reporter';
import type { HardhatUserConfig } from 'hardhat/config';
import 'solidity-coverage';
import * as dotenv from 'dotenv';

// Load .env file
dotenv.config();

const PRIVATE_KEY: string = process.env.PRIVATE_KEY || '';
const ETHERSCAN_API_KEY: string = process.env.ETHERSCAN_API_KEY || '';

const config: HardhatUserConfig = {
  defaultNetwork: 'hardhat',
  namedAccounts: { deployer: 0 },
  etherscan: {
    apiKey: ETHERSCAN_API_KEY,
    customChains: [
      {
        network: 'amoy',
        chainId: 80002,
        urls: {
          // Etherscan v2 aggregator base endpoint; plugin will append chainid automatically
          apiURL: 'https://api.etherscan.io/v2/api',
          browserURL: 'https://amoy.polygonscan.com',
        },
      },
    ],
  },
  gasReporter: {
    currency: 'USD',
    enabled: process.env.REPORT_GAS ? true : false,
    excludeContracts: [],
  },
  networks: {
    hardhat: { chainId: 31337 },
    localhost: { url: 'http://127.0.0.1:8545', chainId: 31337 },
    anvil: { accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [], chainId: 31337, url: 'http://localhost:8545' },
    amoy: {
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      chainId: 80002,
      url: 'https://rpc-amoy.polygon.technology/',
      // Adjust fees to satisfy minimum tip and stay under 1 POL cap
      maxFeePerGas: 33_000_000_000, // 33 gwei
      maxPriorityFeePerGas: 25_000_000_000, // 25 gwei
    },
  },
  paths: {
    artifacts: './artifacts',
    cache: './cache',
    sources: './contracts',
    tests: './test',
  },
  solidity: {
    version: '0.8.27',
    settings: {
      metadata: { bytecodeHash: 'none' },
      optimizer: { enabled: true, runs: 800 },
      evmVersion: 'cancun',
    },
  },
  typechain: { outDir: 'types', target: 'ethers-v6' },
};

export default config;
