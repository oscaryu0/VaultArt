# VaultArt

VaultArt is a privacy-preserving NFT marketplace built on Zama FHEVM. Anyone can mint one ArtNFT for free, list it for a fixed price, and collect encrypted bids that only the listing owner can decrypt.

## At a Glance

- One free mint per wallet (gas only)
- Fixed-price listings with on-chain settlement
- Encrypted bids using FHE (bid values never revealed on-chain)
- Owner-only bid decryption via Zama tooling
- React + Vite frontend with viem reads and ethers writes

## Why VaultArt

NFT marketplaces often expose bidding activity publicly, which enables bid sniping, price anchoring, and pressure tactics. VaultArt keeps bid values confidential while still allowing a transparent, trustless sale flow for listed prices. The result is a marketplace that respects bidder privacy without sacrificing on-chain settlement.

## Key Advantages

- Bid privacy: bid values are encrypted end-to-end using FHE
- Seller control: only the listing owner can decrypt submitted bids
- Simple UX: mint once, list, buy, or place a bid
- On-chain clarity: listings and purchases are transparent and verifiable

## What Problems It Solves

- Protects bidders from revealing their willingness to pay
- Reduces public price signaling and bid sniping
- Keeps listing and settlement logic fully on-chain
- Eliminates reliance on off-chain order books for bids

## Core Features

- Free minting of a single ArtNFT per wallet
- On-chain listings with seller-set prices in wei
- Direct purchase with ETH and automatic seller payout
- Encrypted bids per listed token using Zama FHEVM
- Owner-only bid decryption through CLI or frontend tooling

## How It Works

1. Mint: a wallet calls `mintArt(tokenURI)` and receives one NFT.
2. List: the owner calls `listToken(tokenId, price)` to create a fixed-price listing.
3. Bid: a bidder encrypts a uint64 price and submits it via `placeBid`.
4. Decrypt: the listing owner decrypts bids off-chain to evaluate offers.
5. Buy: any buyer can pay the listed price to purchase via `buyListed`.

Note: bids are informational only. The contract does not auto-accept bids or escrow funds. A seller can choose to adjust the listing price or negotiate off-chain.

## Smart Contract Overview

Contract: `contracts/ArtNFT.sol`

- ERC721-like implementation with owner enumeration
- One mint per wallet enforced by `hasMinted`
- Listings stored on-chain with active list tracking
- Encrypted bids stored as `euint64` per token
- `buyListed` guarded with a simple reentrancy lock
- Events emitted for minting, listing, bidding, and purchases

### Bid Privacy Model

- Bid values are encrypted off-chain using Zama FHE tooling
- `placeBid` accepts `externalEuint64` plus an `inputProof`
- The contract allows decryption only to the listing owner
- Bidder address and timestamp are public; bid value is not

## Frontend Notes

Frontend lives in `home/` and is built with React + Vite. It intentionally:

- Uses viem for reads and ethers for writes
- Avoids environment variables and local storage
- Targets Sepolia; no local RPCs for the UI
- Keeps ABI in a TypeScript file (no JSON imports)

After every deployment, update `home/src/config/contracts.ts` using:

- Address from `deployments/sepolia/ArtNFT.json`
- ABI copied from `deployments/sepolia/ArtNFT.json`

## Tech Stack

- Solidity 0.8.27
- Hardhat + hardhat-deploy
- Zama FHEVM (`@fhevm/solidity`, relayer SDK)
- React 19 + Vite 7
- viem (read), ethers v6 (write)
- RainbowKit + wagmi for wallet connection

## Repository Layout

- `contracts/` smart contracts (ArtNFT)
- `deploy/` deployment scripts
- `tasks/` Hardhat CLI tasks
- `test/` Hardhat tests
- `home/` frontend application
- `deployments/` deployed contract metadata and ABI
- `docs/` Zama references used by this project

## Prerequisites

- Node.js 20+
- npm 7+
- An Ethereum wallet funded for Sepolia

## Installation

```bash
npm install
```

## Compile and Test

```bash
npm run compile
npm run test
```

Note: tests use the FHEVM mock and will skip on Sepolia.

## Local Development Workflow (Contracts)

Start a local Hardhat node and deploy for task testing:

```bash
npm run chain
npm run deploy:localhost
```

## Hardhat Tasks

Examples:

```bash
npx hardhat task:address --network sepolia
npx hardhat task:mint --network sepolia --uri "ipfs://your-metadata"
npx hardhat task:list --network sepolia --tokenid 1 --price 1000000000000000000
npx hardhat task:buy --network sepolia --tokenid 1 --price 1000000000000000000
npx hardhat task:place-bid --network sepolia --tokenid 1 --value 500000000000000000
npx hardhat task:decrypt-bids --network sepolia --tokenid 1
```

The decrypt task must be executed by the listing owner to read bid values.

## Deploy to Sepolia

The deployment configuration reads from `.env` via `dotenv` and expects:

- `INFURA_API_KEY`
- `PRIVATE_KEY`
- `ETHERSCAN_API_KEY` (optional, for verification)

Deploy and verify:

```bash
npm run deploy:sepolia
npm run verify:sepolia -- <DEPLOYED_CONTRACT_ADDRESS>
```

## Frontend Runbook

1. Update `home/src/config/contracts.ts` with the Sepolia address and ABI.
2. Install frontend dependencies:

```bash
cd home
npm install
```

3. Start the UI:

```bash
npm run dev
```

## Security and Privacy Considerations

- Only bid values are encrypted; bidder addresses and timestamps are public.
- Listings are public and priced in plain ETH.
- Bids are not escrowed or auto-executed; they are informational.
- The contract performs minimal validation on token URIs.

## Future Roadmap

- On-chain bid acceptance with encrypted comparison
- Bid escrow to prove funds without revealing value
- Royalty support and metadata validation
- Pagination for listings and bids
- Improved seller tooling for bid management

## License

BSD-3-Clause-Clear. See `LICENSE`.
