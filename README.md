# On-chain Wordle

A On-chain Wordle game with Hardhat contracts and a Next.js frontend. Guesses are evaluated fully on-chain on Polygon Amoy (testnet). An optional ERC1155 (DailyPuzzleNFT) can be minted after wins.

## Directory Structure

```text
├── .gitignore                          # Git ignore rulesG
├── LICENSE                             # License (MIT)
├── README.md                           # Project documentation
└── packages\                           # Monorepo packages
    ├── hardhat\                        # Smart contracts package
    │   ├── .env                        # Deployment/network env vars (local, private)
    │   ├── .env.example                # Example env vars
    │   ├── .eslintignore
    │   ├── .eslintrc.json
    │   ├── .prettierrc.json
    │   ├── .solhint.json               # Solidity Lint config
    │   ├── artifacts\                 # Build artifacts
    │   ├── cache\                     # Build cache
    │   ├── contracts\                 # Contract sources
    │   │   ├── Wordle.sol             # Main Wordle contract (plaintext)
    │   │   └── DailyPuzzleNFT.sol      # Daily puzzle NFT (ERC1155)
    │   ├── deploy\                    # Deployment scripts
    │   │   └── deploy.ts               # hardhat-deploy entry script
    │   ├── deployments\               # Deployment records (addresses/ABIs)
    │   │   └── sepolia\               # Sepolia network
    │   │       ├── .chainId            # Cached chain ID
    │   │       ├── Wordle.json         # Wordle deployment info
    │   │       ├── DailyPuzzleNFT.json # DailyPuzzleNFT deployment info
    │   │       └── solcInputs\        # Cached compilation inputs
    │   ├── hardhat.config.ts           # Hardhat config
    │   ├── package-lock.json
    │   ├── package.json
    │   └── tsconfig.json               # TypeScript config
    └── nextjs\                         # Frontend application package
        ├── .env.local                  # Frontend env vars (contract addresses/chain ID)
        ├── .eslintignore
        ├── .eslintrc.json
        ├── .prettierignore
        ├── .prettierrc.json
        ├── app\                        # App Router
        │   ├── globals.css             # Global styles
        │   ├── layout.tsx              # Root layout
        │   └── page.tsx                # Homepage
        ├── components\                 # Components
        │   └── WordleGame.tsx          # Main game component
        ├── contracts\                  # ABI files
        │   ├── Wordle.json             # Wordle ABI
        │   └── DailyPuzzleNFT.json     # DailyPuzzleNFT ABI
        ├── hooks\                      # React Hooks
        │   └── useWallet.ts            # Wallet connection/network switching
        ├── next-env.d.ts               # Next.js type declarations
        ├── next.config.js              # Next.js config
        ├── package-lock.json
        ├── package.json
        ├── postcss.config.js           # PostCSS config
        ├── tailwind.config.js          # Tailwind config
        ├── tsconfig.json               # TypeScript config
        ├── types\                      # Type declarations
        │   └── global.d.ts             # Global type declarations
        └── utils\                      # Utility functions
            └── networks.ts             # Supported networks/switch params
```

## Requirements

- Node.js 18+ (recommend 18 or 20)
- npm 9+ (or pnpm/yarn; adjust commands accordingly)

## Installation and Running

### 1) Install dependencies

- Hardhat package:
  
  ```bash
  cd packages/hardhat
  npm install
  ```

- Next.js package:
  
  ```bash
  cd packages/nextjs
  npm install
  ```

### 2) Development and Build

- Frontend development:
  
  ```bash
  cd packages/nextjs
  npm run dev
  # Visit http://localhost:3000/ in the browser
  ```

- Frontend build (type-check + production build):
  
  ```bash
  cd packages/nextjs
  npm run build
  ```

- Contract compilation:
  
  ```bash
  cd packages/hardhat
  npx hardhat compile
  ```

- Contract lint (Solhint / Prettier):
  
  ```bash
  cd packages/hardhat
  npm run lint
  ```

## Environment Variables

- packages/nextjs/.env.local
  
  - Required:
    - NEXT_PUBLIC_CONTRACT_ADDRESS: Wordle contract address (must be deployed on Amoy).
    - NEXT_PUBLIC_CHAIN_ID: 80002 (Polygon Amoy testnet).
  - Optional:
    - NEXT_PUBLIC_NFT_ADDRESS: DailyPuzzleNFT address (leave empty to skip NFT checks).
    - NEXT_PUBLIC_RPC_URL: RPC URL for Amoy (e.g. https://rpc-amoy.polygon.technology).
    - NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: WalletConnect project ID (enables WalletConnect QR login).
  - Behavior:
    - If WalletConnect project ID is missing, injected wallets still work via RainbowKit. Ensure the network is Amoy (80002).

- packages/hardhat/.env
  
  - For deployment or interacting with public networks, configure:
    - PRIVATE_KEY: Private key of the deployment account (keep it secret).
    - INFURA_API_KEY: Infura project ID (or use another RPC).
    - ETHERSCAN_API_KEY: For contract verification (optional).

> Note: Do not commit any private keys or sensitive information to the repository.

## Backend-Frontend Sync (Deployment → Frontend)

- In `packages/hardhat/deploy/deploy.ts`, use hardhat-deploy to deploy contracts to the target network and:
  
  - Write/sync the latest addresses into the frontend `.env.local` (CONTRACT and NFT).
  - Sync ABIs to `packages/nextjs/contracts/*.json` to ensure frontend and on-chain contract ABIs are consistent.

- Common commands:
  
  ```bash
  # Local network deployment (start a local node first)
  cd packages/hardhat
  npm run deploy:localhost
  
  # Polygon Amoy testnet deployment (requires .env configured)
  cd packages/hardhat
  npm run deploy:amoy
  ```
  
  After successful deployment, the frontend can directly use the addresses in `.env.local` and the ABIs in `contracts/*.json` to interact.

## Frontend Interaction Guide

- Component `components/WordleGame.tsx`:
  
  - Load ABIs from `contracts/Wordle.json` and `contracts/DailyPuzzleNFT.json`.
  - Read `NEXT_PUBLIC_CONTRACT_ADDRESS` and `NEXT_PUBLIC_NFT_ADDRESS` environment variables.
  - Use `ethers.Contract` and `BrowserProvider` to sign and call transactions.
  - On load, verify the address is deployed on the current network (`provider.getCode(address)`) to avoid misuse.
  - Game interaction: plaintext guesses are submitted via `submitGuess(...)` and evaluated on-chain; the contract returns `uint8[5]` statuses used to update the board and keyboard.

- Wallet control `hooks/useWallet.ts`:
  
  - Detect connection status, current account, and chain ID (`eth_accounts`, `eth_chainId`).
  - Support connecting the wallet (`eth_requestAccounts`).
  - Support switching networks (`wallet_switchEthereumChain`) and auto-adding if missing (`wallet_addEthereumChain`).
  - Automatically listen to `accountsChanged` and `chainChanged` and refresh state.

- Network params `utils/networks.ts`:
  
  - Polygon Amoy supported by default (chain ID 80002). Use `getNetworkSwitchParams` to generate MetaMask switch params.

## On-chain Flow

- User enters a 5-letter guess.
- Frontend calls `submitGuess(guess)` on the `Wordle` contract.
- Contract compares against today's secret word and returns `uint8[5]` result per letter (0 gray, 1 yellow, 2 green).
- Frontend updates the board and keyboard; after a win, optionally mint today's `DailyPuzzleNFT` via `mintSolved(todayId)`.
- Daily initialization is performed via `initializeDailyGame()` when `hasNewDailyWord()` indicates a new day.
## Script Overview

- packages/hardhat
  
  - `npx hardhat compile` Compile contracts
  - `npm run lint` Solhint + Prettier check
  - `npm run deploy:localhost` Local deployment (hardhat-deploy)
  - `npm run deploy:amoy` Polygon Amoy deployment (hardhat-deploy)

- packages/nextjs
  
  - `npm run dev` Start local dev server
  - `npm run build` Production build (with type-check)
  - `npm run lint` ESLint check
  - `npm run prettier:check` Format check
  - `npm run prettier:write` Auto-fix formatting

## Local Demo

1. In `packages/hardhat`, compile and optionally deploy to local/testnet:
   
   ```bash
   cd packages/hardhat
   npx hardhat compile
   # Or use the deploy scripts above to deploy to Amoy
   ```
2. Fill deployed contract addresses into `packages/nextjs/.env.local`:
   
   ```env
   NEXT_PUBLIC_CONTRACT_ADDRESS=0x...
   NEXT_PUBLIC_NFT_ADDRESS=0x...
   ```
3. Start the frontend:
   
   ```bash
   cd packages/nextjs
   npm run dev
   ```
4. Open `http://localhost:3000/` in the browser, click Connect Wallet, ensure the network and addresses match, then try the Wordle game.

## License

This project uses the MIT License. See the `LICENSE` file in the repository root for details.
