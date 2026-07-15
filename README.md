# Escrow Ledger — Decentralized Freelance Escrow

A trust-minimized escrow smart contract for freelance engagements, plus a live React dashboard that talks to it directly from MetaMask. Funds are locked in the contract the moment a job is created and only released, refunded, or split by dispute resolution — there is no middleman holding funds.

**TL;DR for skimmers:** Solidity + React, deployed on Sepolia, real MetaMask interactions, real-time on-chain event updates, written with security-first Solidity patterns and a full Hardhat test suite.

---

## What it does

- **Create & fund a job** in one tx — client sends ETH, contract holds it (`createJob`, payable).
- **Deliver → Release**: freelancer marks delivered, client releases funds straight to the freelancer.
- **Disputes**: client raises a dispute, a trusted arbitrator splits the funds by basis points (`resolveDispute`).
- **Autonomous exits** that don't need the arbitrator:
  - client `refundIfExpired` after the deadline passes with no delivery,
  - freelancer `claimIfUnresponsive` after a grace period if the client ghosts a delivered job.
- **Live dashboard**: a React/Vite app reads job state from chain, signs actions via MetaMask, and **updates in real time** by listening to contract events (`JobCreated`, `JobDelivered`, `JobReleased`, `JobDisputed`, `JobResolved`, `JobRefunded`) — no polling, no refresh button.

## Tech stack

| Layer | Tech |
|------|------|
| Smart contract | Solidity 0.8.28, OpenZeppelin Contracts v5 (`ReentrancyGuard`) |
| Tooling / tests | Hardhat 3 (Ignition deploy, ethers v6), Mocha + ethers integration tests, Foundry-style unit tests |
| Frontend | React 18 + Vite, ethers v6, MetaMask (`window.ethereum`) |
| Network | Sepolia testnet |

## Why these design decisions

- **Checks–Effects–Interactions, everywhere.** In every fund-moving function (`releaseFunds`, `resolveDispute`, `refundIfExpired`, `claimIfUnresponsive`) the job's status is updated *before* the external `.call(){value:}` transfer. State is committed before any external code runs, which is the primary defense against reentrancy.
- **`ReentrancyGuard` on all state-changing functions** as a belt-and-suspenders backstop, with NatSpec documenting the security intent on each function.
- **Fail-fast access control via modifiers** (`onlyClient`, `onlyFreelancer`, `onlyArbitrator`, `onlyWhenStatus`). Callers can't act out of turn or out of role; invalid calls revert with a clear reason string.
- **Events on every state transition.** The contract is the source of truth; the UI never trusts local state. Events let the dashboard (and any off-chain indexer) stay in sync by simply subscribing, which is why updates are instant.
- **Single trusted arbitrator, set once at deploy** (`constructor(address arbitrator_)`).
  - *Known v1 limitation:* this is a centralization/trust assumption. It keeps v1 simple and is appropriate for a demo, but a production system would graduate to a multisig, a curated arbitrator set, or an upgradeable governance-controlled arbitrator. Flagged honestly as a trade-off, not hidden.
- **Deadline + `GRACE_PERIOD`** drive the two autonomous exit paths above, reducing how often the arbitrator is actually needed.

## Links

- **Live demo:** https://<your-demo-url>  *(replace with the deployed Vercel/Netlify URL)*
- **Deployed contract (Sepolia Etherscan):** https://sepolia.etherscan.io/address/<YOUR_CONTRACT_ADDRESS>  *(replace with the deployed address)*

## Run it locally

**Prerequisites:** Node 18+, [Foundry](https://book.getfoundry.sh) (optional, for the Solidity unit tests), MetaMask, and Sepolia test ETH.

```shell
# 1. Install
npm install

# 2. Compile
npx hardhat compile

# 3. Run the test suite
npx hardhat test

# 4. Deploy to Sepolia (needs SEPOLIA_RPC_URL + SEPOLIA_PRIVATE_KEY)
npx hardhat ignition deploy --network sepolia ignition/modules/Escrow.ts
```

**Dashboard:**

```shell
cd escrow-dashboard
npm install
cp .env.example .env      # set VITE_APP_CONTRACT_ADDRESS + VITE_APP_SEPOLIA_RPC_URL
npm run dev                 # open the printed localhost URL, connect MetaMask on Sepolia
```

> The contract address currently referenced in the UI is a placeholder. Point `VITE_APP_CONTRACT_ADDRESS` at your deployed instance to make it fully live.
