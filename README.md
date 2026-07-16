# Escrow Ledger — Decentralized Freelance Escrow

> A trust-minimized escrow smart contract for freelance engagements, with a live React dashboard that talks to it directly from MetaMask. No middleman ever holds the funds.

---

## The Pitch

Hiring a freelancer usually means trusting an escrow platform — or trusting the other party. **Escrow Ledger** removes both. Funds are locked in a smart contract the moment a job is created, and they only move on explicit on-chain actions: release to the freelancer, refund to the client, or a split decided by an arbitrator. The accompanying dashboard reads job state straight from the contract and updates in **real time** as events fire — no refresh button, no backend, no database.

**TL;DR for skimmers:** Solidity + React, deployed on Sepolia, real MetaMask interactions, real-time on-chain event updates, written with security-first Solidity patterns and a full Hardhat test suite.

---

## The Problem

Traditional freelance escrow has three failure modes:

1. **Custodial risk** — a platform holds the funds and can freeze, lose, or misappropriate them.
2. **Trust asymmetry** — the client can ghost after delivery; the freelancer can vanish after being paid.
3. **Opaque state** — disputes and payouts happen inside a private database you can't audit.

Off-chain arbitration is slow and depends on the platform's goodwill.

---

## The Solution

A single Solidity contract encodes the entire job lifecycle as on-chain state transitions, each guarded by role-based modifiers and emitting an event:

- **Create & fund** (`createJob`, payable) — client deposits ETH; the contract holds it.
- **Deliver → Release** — freelancer marks delivered, client releases funds straight to the freelancer.
- **Dispute** — client raises a dispute; a trusted arbitrator splits the funds by basis points (`resolveDispute`).
- **Autonomous exits (no arbitrator needed):**
  - `refundIfExpired` — client recovers funds after the deadline passes with no delivery.
  - `claimIfUnresponsive` — freelancer self-claims after a grace period if the client ghosts a delivered job.

A **React/Vite dashboard** connects via MetaMask (`window.ethereum`), signs actions with `ethers` v6, and subscribes to contract events (`JobCreated`, `JobDelivered`, `JobReleased`, `JobDisputed`, `JobResolved`, `JobRefunded`) so the UI stays in sync the instant anything changes on-chain.

---

## Tech Stack

| Layer | Technology |
|------|------------|
| Smart contract | Solidity 0.8.28, OpenZeppelin Contracts v5 (`ReentrancyGuard`) |
| Tooling & tests | Hardhat 3 (Ignition deploy, ethers v6), Mocha + ethers integration tests, Foundry-style unit tests |
| Frontend | React 18 + Vite, ethers v6, MetaMask (`window.ethereum`) |
| Hosting | Vercel (static build of the dashboard) |
| Network | Sepolia testnet |

---

## System Design

### Contract architecture

```
            ┌─────────────┐
   client ─▶│             │◀─ freelancer
            │  Escrow.sol │
   arbitrator ──▶ (disputes)
            │             │
            └──────┬──────┘
                   │ holds ETH
                   ▼
              on-chain state (Job[])
                   │
        emits events on every transition
                   │
                   ▼
            React dashboard (real-time listeners)
```

- **State:** a `Job` struct (`client`, `freelancer`, `amount`, `deadline`, `deliveredAt`, `status`) in a `mapping(uint256 => Job)`. A `nextJobId` counter acts as the job ID.
- **Status enum:** `Created → Funded → Delivered → Disputed → Released / Refunded / Resolved`.
- **Roles:** enforced by modifiers — `onlyClient`, `onlyFreelancer`, `onlyArbitrator`, `onlyWhenStatus`. Invalid calls revert with a clear reason string.
- **Arbitrator:** a single address set once at deploy (`constructor(address arbitrator_)`). *Known v1 limitation — see below.*

### Job lifecycle (happy path + edges)

```
createJob (payable)        → Funded
markDelivered              → Delivered
releaseFunds               → Released  (funds → freelancer)
raiseDispute               → Disputed
resolveDispute(bps)        → Resolved  (split by clientShareBps)
refundIfExpired (past dl)  → Refunded  (funds → client)
claimIfUnresponsive (grace)→ Released  (funds → freelancer)
```

### Security design decisions

- **Checks–Effects–Interactions, everywhere.** In every fund-moving function (`releaseFunds`, `resolveDispute`, `refundIfExpired`, `claimIfUnresponsive`) the job's `status` is updated *before* the external `.call(){value:}` transfer. State is committed before any external code runs — the primary defense against reentrancy.
- **`ReentrancyGuard`** on all state-changing functions as a belt-and-suspenders backstop, with NatSpec documenting the security intent on each function.
- **Fail-fast access control** via modifiers: callers can't act out of turn or out of role.
- **Events as the source of truth.** The contract emits on every transition, so the UI never trusts local state — it just subscribes. This is why updates are instant and why any off-chain indexer can reconstruct history.
- **Deadline + `GRACE_PERIOD`** drive the two autonomous exit paths, reducing how often the arbitrator is actually needed.

### Known v1 limitations (called out honestly)

- **Single trusted arbitrator.** Set at deploy, it's a centralization/trust assumption kept deliberately simple for v1. A production system would graduate to a multisig, a curated arbitrator set, or an upgradeable, governance-controlled arbitrator.
- **No on-chain titles/metadata.** The contract stores only what's needed for settlement (parties, amount, deadline). Human-readable titles are kept client-side keyed by job ID.
- **Testnet demo.** Deployed on Sepolia; no real funds move.

---

## Links

- **Live demo:** https://<your-demo-url>  *(replace with the deployed Vercel URL)*
- **Deployed contract (Sepolia Etherscan):** https://sepolia.etherscan.io/address/<YOUR_CONTRACT_ADDRESS>  *(replace with the deployed address)*

---

## Run it locally

**Prerequisites:** Node 18+, [Foundry](https://book.getfoundry.sh) (optional, for Solidity unit tests), MetaMask, and Sepolia test ETH.

### Smart contract (on-chain, via Hardhat — not Vercel)

```shell
# 1. Install
npm install

# 2. Configure secrets (root .env — gitignored)
#    SEPOLIA_RPC_URL=https://sepolia.drpc.org
#    SEPOLIA_PRIVATE_KEY=0x...

# 3. Tell Ignition who the arbitrator is (ignition/parameters.json)
#    { "EscrowModule": { "arbitrator": "0xYOUR_ARBITRATOR_ADDRESS" } }

# 4. Compile & deploy to Sepolia
npx hardhat compile
echo y | npx hardhat ignition deploy ignition/modules/Escrow.ts --network sepolia --parameters ignition/parameters.json
```

Copy the printed `Escrow` address.

### Frontend (Vercel)

```shell
cd escrow-dashboard
npm install
cp .env.example .env        # set VITE_APP_CONTRACT_ADDRESS + VITE_APP_SEPOLIA_RPC_URL
npm run dev                 # open the printed localhost URL, connect MetaMask on Sepolia
```

**Deploy to Vercel:** import the GitHub repo, set **Root Directory = `escrow-dashboard`**, framework **Vite**, build `npm run build`, output `dist`. Add the environment variable **`VITE_APP_CONTRACT_ADDRESS`** = your deployed address (it's baked in at build time, so also Redeploy after setting it). The contract address is public on-chain, so exposing it via a `VITE_` var is safe — never put `SEPOLIA_PRIVATE_KEY` in a `VITE_` var.

> The contract address referenced in the UI is a placeholder. Point `VITE_APP_CONTRACT_ADDRESS` at your deployed instance to make it fully live.

---

## Project Layout

```
contracts/Escrow.sol          # main contract (7 functions, 6 events, ReentrancyGuard)
contracts/AttackEscrow.sol    # reentrancy attack stub for tests
foundry/Escrow.t.sol          # Foundry unit tests (when forge is installed)
test/Escrow.test.ts           # Hardhat + ethers integration tests
ignition/modules/Escrow.ts    # deploy module (takes `arbitrator` param)
hardhat.config.ts             # networks + solidity profiles
escrow-dashboard/             # React + Vite frontend
  src/App.jsx                 # UI + ethers wiring + MetaMask + event listeners
  src/abi/Escrow.json         # contract ABI
  vercel.json                 # Vercel build config
```
