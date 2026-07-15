# TDD: Decentralized Escrow / Freelance Payment Platform

## 1. Architecture overview

```
┌─────────────────────┐        ┌───────────────────────┐
│   Frontend (React)  │ ───▶   │  Ethers.js / wagmi     │
│   dashboard.html     │        │  wallet connection     │
└─────────────────────┘        └───────────┬────────────┘
                                            │ JSON-RPC
                                            ▼
                                 ┌────────────────────────┐
                                 │  Escrow.sol (Sepolia)   │
                                 │  - Job struct/mapping   │
                                 │  - State machine logic  │
                                 └───────────┬────────────┘
                                             │ events
                                             ▼
                                 ┌────────────────────────┐
                                 │  The Graph / event log  │
                                 │  polling for job history│
                                 └────────────────────────┘
```

Single contract, no proxy/upgradeability in v1 (keep it simple and auditable — upgradeability is a v2 discussion point that shows maturity if asked about in an interview, but adds real risk if implemented sloppily).

## 2. Contract design

### 2.1 Data model

```solidity
enum Status { Created, Funded, Delivered, Disputed, Released, Refunded, Resolved }

struct Job {
    address client;
    address freelancer;
    uint256 amount;
    uint256 deadline;       // unix timestamp, delivery due by
    uint256 deliveredAt;    // set when freelancer delivers, used for grace period
    Status status;
}

mapping(uint256 => Job) public jobs;
uint256 public nextJobId;
address public arbitrator;
uint256 public constant GRACE_PERIOD = 3 days;
```

### 2.2 Key functions

| Function | Caller | Preconditions | Effect |
|---|---|---|---|
| `createJob(address freelancer, uint256 deadline)` (payable) | Client | `msg.value > 0` | Creates job in `Funded` state (creation + funding combined into one tx for UX simplicity) |
| `markDelivered(uint256 jobId)` | Freelancer | status == `Funded`, caller == job.freelancer | status → `Delivered`, sets `deliveredAt` |
| `releaseFunds(uint256 jobId)` | Client | status == `Delivered`, caller == job.client | Transfers `amount` to freelancer, status → `Released` |
| `raiseDispute(uint256 jobId)` | Client | status == `Delivered`, caller == job.client | status → `Disputed` |
| `resolveDispute(uint256 jobId, uint256 clientShareBps)` | Arbitrator | status == `Disputed` | Splits funds per `clientShareBps` (0–10000), status → `Resolved` |
| `refundIfExpired(uint256 jobId)` | Client | status == `Funded`, `block.timestamp > deadline` | Refunds client, status → `Refunded` |
| `claimIfUnresponsive(uint256 jobId)` | Freelancer | status == `Delivered`, `block.timestamp > deliveredAt + GRACE_PERIOD` | Pays freelancer, status → `Released` |

### 2.3 Security measures

- **Checks-Effects-Interactions**: state is updated *before* any external call (`.call{value: amount}("")`) to prevent reentrancy.
- **`ReentrancyGuard`** (OpenZeppelin) on every function that transfers ETH, as defense in depth.
- **Pull-over-push** considered but rejected for v1 in favor of push payments for simpler UX; documented as a conscious tradeoff (a `withdraw()` pull-pattern is noted as the safer alternative for v2 at scale).
- **No `selfdestruct`, no `delegatecall`** to untrusted addresses.
- **Explicit `require` checks** on caller identity and state for every function — no function trusts `msg.sender` implicitly.
- **Integer math**: Solidity ^0.8.x has built-in overflow/underflow protection, no need for SafeMath.
- **Arbitrator split validated**: `clientShareBps` must be `<= 10000` to prevent over-allocation.

### 2.4 Events

```solidity
event JobCreated(uint256 indexed jobId, address indexed client, address indexed freelancer, uint256 amount, uint256 deadline);
event JobDelivered(uint256 indexed jobId, uint256 deliveredAt);
event JobReleased(uint256 indexed jobId, address to, uint256 amount);
event JobDisputed(uint256 indexed jobId);
event JobResolved(uint256 indexed jobId, uint256 clientAmount, uint256 freelancerAmount);
event JobRefunded(uint256 indexed jobId, uint256 amount);
```

Events are the source of truth for the frontend's job history — no need for a separate backend/indexer at this scale; the frontend queries logs directly via `ethers.js` `contract.queryFilter()`.

## 3. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Smart contract | Solidity ^0.8.24 | Industry standard, built-in overflow protection |
| Dev framework | Hardhat | Best-in-class testing/debugging, gas reporting |
| Libraries | OpenZeppelin Contracts | Audited primitives (`ReentrancyGuard`, `Ownable`) — signals you don't reinvent security-critical code |
| Frontend | React + ethers.js (or wagmi + viem) | Standard, well-documented wallet integration |
| Network | Sepolia testnet | Free, widely supported by wallets/faucets |
| Contract verification | Etherscan Sourcify plugin | Lets recruiters read the verified source directly on Etherscan |

## 4. Testing plan

- **Unit tests** (Hardhat + Chai) for every function's happy path and every `require` revert condition.
- **Adversarial tests**:
  - Attempt reentrancy via malicious receiver contract → must revert.
  - Non-client tries to release funds → must revert.
  - Non-freelancer tries to mark delivered → must revert.
  - Double-release attempt on same job → must revert (status guard).
  - Arbitrator tries to resolve a non-disputed job → must revert.
- **Fuzz testing** on `resolveDispute` split logic (via Hardhat/Foundry fuzzing) to confirm amounts always sum correctly and never exceed `job.amount`.
- **Gas report** included in README to show cost-consciousness.

## 5. Frontend design (dashboard.html)

- Single-page dashboard, wallet-connect gated.
- Role-aware UI: the actions shown (Fund / Deliver / Release / Dispute / Resolve) depend on whether the connected address is the client, freelancer, or arbitrator for a given job.
- Job list with visual state-machine timeline per job (mirrors the state diagram in the PRD) so a non-technical recruiter can immediately grasp "this is a state machine, and the contract enforces the transitions."
- Built as a static HTML/CSS/JS file for this deliverable (no build step) so it's trivial to open and review; a production version would migrate this to the React + ethers.js stack described above.

## 6. Deployment plan

1. Write + test contract locally with Hardhat.
2. Deploy to Sepolia via Hardhat script, using an Alchemy/Infura RPC endpoint.
3. Verify contract source on Etherscan.
4. Point frontend's contract address + ABI at the deployed instance.
5. Host frontend on Vercel/Netlify/GitHub Pages for a live demo link.

## 7. Open questions / decisions to revisit

- Should `createJob` and funding be separate transactions (more flexible, e.g. allow job negotiation before funds move) vs. combined (simpler UX, fewer txs)? v1 combines them; documented as a tradeoff.
- Single arbitrator address is a trust bottleneck — acceptable for a portfolio demo, explicitly flagged as not production-ready without decentralized arbitration (e.g. Kleros).
