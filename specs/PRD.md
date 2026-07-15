# PRD: Decentralized Escrow / Freelance Payment Platform

## 1. Overview

**Problem:** Freelance work is built on trust between two parties who often don't know each other. Clients worry about paying upfront and getting nothing. Freelancers worry about delivering work and never getting paid. Centralized platforms (Upwork, Fiverr) solve this but take 10-20% in fees and act as an opaque middleman holding funds.

**Solution:** A smart-contract-based escrow system where funds are locked on-chain when a job starts, and released automatically (or via arbitration if there's a dispute) when both parties agree the job is done — no platform, no custody, no cut.

**Target user for this project:** This is a portfolio project, so the "user" is really a recruiter or hiring manager evaluating blockchain engineering skill. Every feature should double as a demonstration of a core Solidity/Web3 concept.

## 2. Goals

- Demonstrate mastery of smart contract state machines, access control, and secure fund handling.
- Ship a working, deployed (testnet) product with a usable frontend — not just contract code.
- Keep scope small enough to finish and polish, rather than large and half-built.

## 3. Non-goals

- Real-money / mainnet deployment.
- Reputation systems, search/discovery of freelancers, messaging, KYC.
- Multi-token support (v1 is ETH only) — mentioned as a "future work" item instead.

## 4. User roles

| Role | Description |
|---|---|
| **Client** | Creates a job, deposits funds into escrow, approves or disputes delivery. |
| **Freelancer** | Accepts a job, marks work as delivered. |
| **Arbitrator** | A neutral third party (in v1, a single admin address; in v2, a small DAO/multisig) who resolves disputes. |

## 5. Core user flows

### 5.1 Happy path
1. Client creates a job: title, description, amount, freelancer's address, deadline.
2. Client funds the escrow contract with the agreed amount (funds locked in contract).
3. Freelancer delivers the work off-chain (e.g. shares a link/file) and marks the job as **Delivered** on-chain.
4. Client reviews and clicks **Release Funds** — freelancer is paid instantly, job closes as **Completed**.

### 5.2 Dispute path
1. After delivery, if the client is unhappy, they click **Raise Dispute** instead of releasing funds.
2. Job status moves to **Disputed**. Funds stay locked.
3. Arbitrator reviews (off-chain evidence) and calls `resolveDispute()`, choosing to release funds to the freelancer, refund the client, or split the amount.

### 5.3 Timeout / no-response path
1. If the freelancer never delivers by the deadline, the client can reclaim funds via `refundIfExpired()`.
2. If the client never responds after delivery (goes silent past a grace period), the freelancer can call `claimIfUnresponsive()` to release funds to themselves.

## 6. Functional requirements

- **FR1** — Client can create a job with amount, freelancer address, and deadline.
- **FR2** — Contract must hold funds in escrow (`payable`, tracked per job ID).
- **FR3** — Only the assigned freelancer can mark a job as delivered.
- **FR4** — Only the client can release funds or raise a dispute, and only after delivery.
- **FR5** — Only the arbitrator can resolve a dispute, and only while status is `Disputed`.
- **FR6** — Funds must never be withdrawable by anyone outside the defined state transitions (no arbitrary withdraw function).
- **FR7** — All state changes emit events (`JobCreated`, `JobFunded`, `JobDelivered`, `JobReleased`, `JobDisputed`, `JobResolved`, `JobRefunded`).
- **FR8** — Frontend dashboard shows job status, timeline, and available actions based on connected wallet's role.
- **FR9** — Platform fee is 0% in v1 (explicitly a differentiator from centralized platforms — call this out in the README).

## 7. State machine

```
Created → Funded → Delivered → Released (terminal)
                        ↓
                    Disputed → Resolved (terminal, splits per arbitrator decision)
Funded → Refunded (terminal, via deadline expiry)
```

A job can only ever move forward through this graph — no backward transitions. This is the core invariant the smart contract enforces.

## 8. Success metrics (for a portfolio project)

- Contract deployed and verified on Sepolia testnet.
- 90%+ unit test coverage on the contract, including adversarial/attack tests (reentrancy, wrong-caller, double-release).
- Live demo link where a recruiter can connect MetaMask and walk through a full job lifecycle in under 2 minutes.
- Clean README explaining architecture decisions, not just usage.

## 9. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Reentrancy attack on fund release | Use checks-effects-interactions pattern + OpenZeppelin's `ReentrancyGuard`. |
| Arbitrator is a centralization/trust weak point | Documented explicitly as a known v1 limitation; propose multisig/DAO arbitration as v2. |
| Client funds a job then disappears | Deadline + `refundIfExpired()` prevents funds being stuck forever. |
| Freelancer delivers but client goes silent | Grace period + `claimIfUnresponsive()` prevents funds being stuck forever. |

## 10. Future work (v2 ideas, mention but don't build)

- ERC-20 token support (pay in USDC/DAI, not just ETH).
- Milestone-based partial releases for larger projects.
- Multisig or Kleros-style decentralized arbitration.
- On-chain reputation score per address.
