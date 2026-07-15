import React, { useState, useEffect, Fragment, createContext, useContext } from 'react';
import { ethers } from 'ethers';

import EscrowABI from './abi/Escrow.json';

const CONTRACT_ADDRESS = import.meta.env.VITE_APP_CONTRACT_ADDRESS;
const SEPOLIA_RPC_URL = import.meta.env.VITE_APP_SEPOLIA_RPC_URL || 'https://sepolia.drpc.org';
const CHAIN_ID = import.meta.env.VITE_APP_CHAIN_ID || 11155111;
const ETH_USD = 2600;

const AppContext = createContext();

export const useApp = () => useContext(AppContext);

const fmtEth = (n) => `${parseFloat(n).toFixed(2)} ETH`;
const fmtUsd = (n) => '$' + Math.round(parseFloat(n) * ETH_USD).toLocaleString('en-US');
const shortAddr = (a) => (a ? `${a.slice(0, 6)}...${a.slice(-4)}` : '');
const fmtDate = (d) =>
  d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'TBD';

function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [account, setAccount] = useState(null);
  const [role, setRole] = useState('client');
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [escrowContract, setEscrowContract] = useState(null);

  const [jobs, setJobs] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isWalletConnecting, setIsWalletConnecting] = useState(false);
  const [newJobForm, setNewJobForm] = useState({ title: '', freelancer: '', deadline: '', amount: '' });
  const [jobTitles, setJobTitles] = useState({});
  const [lastEvent, setLastEvent] = useState(null);

  const connectWallet = async () => {
    if (!window.ethereum) {
      alert('MetaMask is not installed. Please install MetaMask to continue.');
      return;
    }

    try {
      setIsWalletConnecting(true);
      const web3Provider = new ethers.BrowserProvider(window.ethereum);

      const network = await web3Provider.getNetwork();
      if (network.chainId !== BigInt(CHAIN_ID)) {
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: `0x${BigInt(CHAIN_ID).toString(16)}` }],
          });
        } catch (switchError) {
          if (switchError.code === 4902) {
            await window.ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [
                {
                  chainId: `0x${BigInt(CHAIN_ID).toString(16)}`,
                  chainName: 'Sepolia Testnet',
                  rpcUrls: [SEPOLIA_RPC_URL],
                  nativeCurrency: { name: 'Sepolia ETH', symbol: 'ETH', decimals: 18 },
                  blockExplorerUrls: ['https://sepolia.etherscan.io'],
                },
              ],
            });
          } else {
            throw switchError;
          }
        }
      }

      const accounts = await web3Provider.send('eth_requestAccounts', []);
      const ethersSigner = await web3Provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, EscrowABI, ethersSigner);

      setProvider(web3Provider);
      setSigner(ethersSigner);
      setAccount(accounts[0]);
      setEscrowContract(contract);
      setIsConnected(true);

      await loadUserJobs(accounts[0]);
    } catch (error) {
      console.error('Failed to connect wallet:', error);
      alert('Failed to connect wallet. Please try again.');
    } finally {
      setIsWalletConnecting(false);
    }
  };

  const loadUserJobs = async (userAddress) => {
    if (!escrowContract) return;

    try {
      setIsLoading(true);
      const jobCount = await escrowContract.nextJobId();
      const userJobs = [];
      const arbitrator = (await escrowContract.arbitrator()).toLowerCase();

      for (let i = 0; i < jobCount; i++) {
        try {
          const job = await escrowContract.jobs(i);
          if (job.client === ethers.ZeroAddress && job.freelancer === ethers.ZeroAddress) continue;

          const isClient = userAddress.toLowerCase() === job.client.toLowerCase();
          const isFreelancer = userAddress.toLowerCase() === job.freelancer.toLowerCase();
          const isArbitrator = userAddress.toLowerCase() === arbitrator;

          const statusMap = {
            0: 'Created',
            1: 'Funded',
            2: 'Delivered',
            3: 'Disputed',
            4: 'Released',
            5: 'Refunded',
            6: 'Resolved',
          };

          userJobs.push({
            id: i,
            client: job.client,
            freelancer: job.freelancer,
            amount: ethers.formatEther(job.amount),
            deadline: job.deadline > 0n ? new Date(Number(job.deadline) * 1000) : null,
            deliveredAt: job.deliveredAt > 0n ? new Date(Number(job.deliveredAt) * 1000) : null,
            status: statusMap[Number(job.status)] || job.status,
            isClient,
            isFreelancer,
            isArbitrator,
          });
        } catch (error) {
          console.error(`Error loading job ${i}:`, error);
        }
      }

      setJobs(userJobs);
    } catch (error) {
      console.error('Failed to load jobs:', error);
      alert('Failed to load jobs. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const refreshJobs = async () => {
    if (account) await loadUserJobs(account);
  };

  const createJob = async () => {
    const { title, freelancer, amount, deadline } = newJobForm;
    if (!title || !freelancer || !amount || !deadline) {
      alert('Fill in a title, freelancer address, amount, and deadline.');
      return;
    }
    if (!ethers.isAddress(freelancer)) {
      alert('Freelancer address is not a valid Ethereum address.');
      return;
    }
    const deadlineTs = Math.floor(new Date(deadline).getTime() / 1000);
    if (isNaN(deadlineTs) || deadlineTs <= Math.floor(Date.now() / 1000)) {
      alert('Deadline must be a future date and time.');
      return;
    }

    try {
      setIsLoading(true);
      const value = ethers.parseEther(amount.toString());
      const tx = await escrowContract.createJob(freelancer, deadlineTs, { value, gasLimit: 500000 });
      await tx.wait();

      const newId = Number(await escrowContract.nextJobId()) - 1;
      setJobTitles((prev) => ({ ...prev, [newId]: title.trim() }));
      setNewJobForm({ title: '', freelancer: '', deadline: '', amount: '' });
      setLastEvent({ message: `Job #${newId} created`, at: Date.now() });
      await refreshJobs();
    } catch (error) {
      console.error('Failed to create job:', error);
      alert(`Failed to create job: ${error.reason || error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const markDelivered = async (jobId) => {
    try {
      setIsLoading(true);
      const tx = await escrowContract.markDelivered(jobId);
      await tx.wait();
      await refreshJobs();
    } catch (error) {
      console.error('Failed to mark delivered:', error);
      alert(`Failed to mark delivered: ${error.reason || error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const releaseFunds = async (jobId) => {
    try {
      setIsLoading(true);
      const tx = await escrowContract.releaseFunds(jobId);
      await tx.wait();
      await refreshJobs();
    } catch (error) {
      console.error('Failed to release funds:', error);
      alert(`Failed to release funds: ${error.reason || error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const raiseDispute = async (jobId) => {
    try {
      setIsLoading(true);
      const tx = await escrowContract.raiseDispute(jobId);
      await tx.wait();
      await refreshJobs();
    } catch (error) {
      console.error('Failed to raise dispute:', error);
      alert(`Failed to raise dispute: ${error.reason || error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const resolveDispute = async (jobId, clientShareBps) => {
    try {
      setIsLoading(true);
      const tx = await escrowContract.resolveDispute(jobId, clientShareBps);
      await tx.wait();
      await refreshJobs();
    } catch (error) {
      console.error('Failed to resolve dispute:', error);
      alert(`Failed to resolve dispute: ${error.reason || error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const refundIfExpired = async (jobId) => {
    try {
      setIsLoading(true);
      const tx = await escrowContract.refundIfExpired(jobId);
      await tx.wait();
      await refreshJobs();
    } catch (error) {
      console.error('Failed to refund:', error);
      alert(`Failed to refund: ${error.reason || error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const claimIfUnresponsive = async (jobId) => {
    try {
      setIsLoading(true);
      const tx = await escrowContract.claimIfUnresponsive(jobId);
      await tx.wait();
      await refreshJobs();
    } catch (error) {
      console.error('Failed to claim:', error);
      alert(`Failed to claim: ${error.reason || error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredJobs = jobs.filter((job) => {
    if (role === 'client') return job.isClient;
    if (role === 'freelancer') return job.isFreelancer;
    if (role === 'arbitrator') return job.isArbitrator;
    return true;
  });

  const getStats = () => {
    const open = jobs.filter((j) => ['Funded', 'Delivered', 'Disputed'].includes(j.status)).length;
    const locked = jobs
      .filter((j) => ['Funded', 'Delivered', 'Disputed'].includes(j.status))
      .reduce((s, j) => s + parseFloat(j.amount), 0);
    const done = jobs.filter((j) => ['Released', 'Resolved'].includes(j.status)).length;
    const disputed = jobs.filter((j) => j.status === 'Disputed').length;
    return { open, locked, done, disputed };
  };

  const stats = getStats();

  useEffect(() => {
    if (window.ethereum) {
      window.ethereum.on('accountsChanged', (accounts) => {
        if (accounts.length > 0 && accounts[0] !== account) {
          connectWallet();
        }
      });
      window.ethereum.on('chainChanged', () => {
        window.location.reload();
      });
    }
  }, [account]);

  // Real-time updates: re-fetch jobs whenever a relevant on-chain event fires.
  useEffect(() => {
    if (!escrowContract || !account) return;

    let toastTimer;
    const notify = (message) => {
      setLastEvent({ message, at: Date.now() });
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => setLastEvent(null), 5000);
    };
    const refresh = () => {
      refreshJobs();
    };

    const handlers = {
      JobCreated: (jobId, client, freelancer) => {
        if (client.toLowerCase() === account.toLowerCase() || freelancer.toLowerCase() === account.toLowerCase()) {
          notify(`Job #${jobId} created`);
          refresh();
        }
      },
      JobDelivered: (jobId) => {
        notify(`Job #${jobId} marked delivered`);
        refresh();
      },
      JobReleased: (jobId, to) => {
        if (to.toLowerCase() === account.toLowerCase()) notify(`Job #${jobId} funds released to you`);
        else notify(`Job #${jobId} funds released`);
        refresh();
      },
      JobDisputed: (jobId) => {
        notify(`Job #${jobId} disputed`);
        refresh();
      },
      JobResolved: (jobId) => {
        notify(`Job #${jobId} resolved`);
        refresh();
      },
      JobRefunded: (jobId) => {
        notify(`Job #${jobId} refunded`);
        refresh();
      },
    };

    Object.entries(handlers).forEach(([event, handler]) => {
      escrowContract.on(event, handler);
    });

    return () => {
      Object.entries(handlers).forEach(([event, handler]) => {
        escrowContract.off(event, handler);
      });
      if (toastTimer) clearTimeout(toastTimer);
    };
  }, [escrowContract, account]);

  const value = {
    isConnected,
    account,
    role,
    setRole,
    isLoading,
    isWalletConnecting,
    lastEvent,
    setLastEvent,
    newJobForm,
    setNewJobForm,
    jobTitles,
    connectWallet,
    createJob,
    markDelivered,
    releaseFunds,
    raiseDispute,
    resolveDispute,
    refundIfExpired,
    claimIfUnresponsive,
    refreshJobs,
    filteredJobs,
    stats,
  };

  return (
    <AppContext.Provider value={value}>
      <AppContent />
    </AppContext.Provider>
  );
}

function AppContent() {
  const {
    isConnected,
    account,
    role,
    setRole,
    isLoading,
    isWalletConnecting,
    lastEvent,
    setLastEvent,
    newJobForm,
    setNewJobForm,
    connectWallet,
    createJob,
    refreshJobs,
    stats,
    filteredJobs,
  } = useApp();

  return (
    <div className="wrap">
      <header className="top">
        <div className="wordmark">
          <div className="seal">E</div>
          <h1>Escrow Ledger</h1>
          <span className="tag">Sepolia Testnet</span>
        </div>
        <div className="wallet-area">
          <select className="role-select" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="client">View as Client</option>
            <option value="freelancer">View as Freelancer</option>
            <option value="arbitrator">View as Arbitrator</option>
          </select>
          {isConnected && (
            <div className="wallet-chip">
              <span className="dot"></span>
              <span>{shortAddr(account)}</span>
            </div>
          )}
          {isConnected ? (
            <button className="btn btn-primary" disabled>
              Connected
            </button>
          ) : (
            <button className="btn btn-primary" onClick={connectWallet} disabled={isWalletConnecting}>
              {isWalletConnecting ? 'Connecting...' : 'Connect Wallet'}
            </button>
          )}
        </div>
      </header>

      <section className="stats">
        <div className="stat">
          <div className="label">Open Jobs</div>
          <div className="value">{stats.open}</div>
        </div>
        <div className="stat">
          <div className="label">Value Locked</div>
          <div className="value vault">{stats.locked.toFixed(2)} ETH</div>
        </div>
        <div className="stat">
          <div className="label">Completed</div>
          <div className="value">{stats.done}</div>
        </div>
        <div className="stat">
          <div className="label">Disputed</div>
          <div className="value rust">{stats.disputed}</div>
        </div>
      </section>

      <div className="new-job">
        <h2>Create a job</h2>
        <div className="hint">
          Funds are deposited into the contract the moment a job is created — nothing sits with a middleman.
        </div>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="njTitle">Job title</label>
            <input
              id="njTitle"
              type="text"
              placeholder="Landing page redesign"
              value={newJobForm.title}
              onChange={(e) => setNewJobForm({ ...newJobForm, title: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="njAddr">Freelancer address</label>
            <input
              id="njAddr"
              type="text"
              placeholder="0x..."
              value={newJobForm.freelancer}
              onChange={(e) => setNewJobForm({ ...newJobForm, freelancer: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="njAmt">Amount (ETH)</label>
            <input
              id="njAmt"
              type="number"
              step="0.001"
              min="0"
              placeholder="1.20"
              value={newJobForm.amount}
              onChange={(e) => setNewJobForm({ ...newJobForm, amount: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="njDeadline">Deadline</label>
            <input
              id="njDeadline"
              type="datetime-local"
              value={newJobForm.deadline}
              onChange={(e) => setNewJobForm({ ...newJobForm, deadline: e.target.value })}
            />
          </div>
          <button className="btn btn-primary" onClick={createJob} disabled={isLoading}>
            {isLoading ? 'Funding...' : 'Fund & Create'}
          </button>
        </div>
      </div>

      <div className="section-head">
        <h2>Jobs</h2>
        <span className="eyebrow">{filteredJobs.length} entries</span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {isConnected && (
            <span className="live-badge" title="Listening for on-chain events">
              <span className="pulse"></span>
              Live
            </span>
          )}
          <button
            onClick={refreshJobs}
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 12,
              color: 'var(--vault)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            Refresh
          </button>
        </div>
      </div>

      {lastEvent && (
        <div className="toast">
          <span>🔔 {lastEvent.message}</span>
          <button onClick={() => setLastEvent(null)}>Dismiss</button>
        </div>
      )}

      {isLoading && jobs.length === 0 ? (
        <div className="muted-note">
          <div className="spinner"></div>
          Loading jobs...
        </div>
      ) : filteredJobs.length === 0 ? (
        <div className="muted-note">No jobs found for your current role.</div>
      ) : (
        <div className="jobs">
          {filteredJobs.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>
      )}

      <footer>
        Contract: <a href="#">0x4F2a...E71c on Etherscan</a> · Built as a portfolio demo — connect MetaMask on
        Sepolia to interact with the live escrow contract.
      </footer>
    </div>
  );
}

function Timeline({ status }) {
  const refunded = status === 'Refunded';
  const disputedPath = ['Disputed', 'Resolved'].includes(status);
  const stageList = disputedPath
    ? ['Created', 'Funded', 'Delivered', 'Disputed', 'Resolved']
    : ['Created', 'Funded', 'Delivered', 'Released'];
  const currentIndex = stageList.indexOf(refunded ? 'Funded' : status);

  return (
    <div className="timeline">
      {stageList.map((stage, i) => {
        const isAlt = stage === 'Disputed' || stage === 'Resolved';
        let cls = 'seal';
        if (refunded && stage === 'Funded') cls += ' faded';
        else if (i < currentIndex) cls += isAlt ? ' alt' : ' done';
        else if (i === currentIndex) cls += refunded ? ' alt' : isAlt ? ' alt' : ' current';
        else cls += ' faded';

        return (
          <Fragment key={stage}>
            <div className="seal-wrap">
              <div className={cls}>{stage[0]}</div>
              <div className="seal-label">{stage}</div>
            </div>
            {i < stageList.length - 1 && (
              <div
                className={
                  'seal-connector' +
                  (i < currentIndex ? (isAlt ? ' alt' : ' done') : '')
                }
              ></div>
            )}
          </Fragment>
        );
      })}
      {refunded && (
        <>
          <div className="seal-connector alt"></div>
          <div className="seal-wrap">
            <div className="seal alt">R</div>
            <div className="seal-label">Refunded</div>
          </div>
        </>
      )}
    </div>
  );
}

function JobCard({ job }) {
  const {
    role,
    isLoading,
    jobTitles,
    markDelivered,
    releaseFunds,
    raiseDispute,
    refundIfExpired,
    claimIfUnresponsive,
    resolveDispute,
  } = useApp();

  const isClient = role === 'client' && job.isClient;
  const isFreelancer = role === 'freelancer' && job.isFreelancer;
  const isArbitrator = role === 'arbitrator' && job.isArbitrator;

  const actions = [];
  if (job.status === 'Funded' && isFreelancer) {
    actions.push(
      <button key="deliver" className="btn-sm primary" disabled={isLoading} onClick={() => markDelivered(job.id)}>
        Mark Delivered
      </button>
    );
  }
  if (job.status === 'Funded' && isClient) {
    actions.push(
      <button key="refund" className="btn-sm" disabled={isLoading} onClick={() => refundIfExpired(job.id)}>
        Refund if Expired
      </button>
    );
  }
  if (job.status === 'Delivered' && isClient) {
    actions.push(
      <button key="release" className="btn-sm primary" disabled={isLoading} onClick={() => releaseFunds(job.id)}>
        Release Funds
      </button>
    );
    actions.push(
      <button key="dispute" className="btn-sm warn" disabled={isLoading} onClick={() => raiseDispute(job.id)}>
        Raise Dispute
      </button>
    );
  }
  if (job.status === 'Delivered' && isFreelancer) {
    actions.push(
      <button key="claim" className="btn-sm" disabled={isLoading} onClick={() => claimIfUnresponsive(job.id)}>
        Claim if Unresponsive
      </button>
    );
  }
  if (job.status === 'Disputed' && isArbitrator) {
    actions.push(
      <button key="res-f" className="btn-sm primary" disabled={isLoading} onClick={() => resolveDispute(job.id, 0)}>
        Resolve → Freelancer
      </button>
    );
    actions.push(
      <button key="res-c" className="btn-sm" disabled={isLoading} onClick={() => resolveDispute(job.id, 10000)}>
        Resolve → Client
      </button>
    );
  }

  const title = jobTitles[job.id] || `Job #${job.id}`;

  return (
    <div className="job">
      <div className="job-top">
        <div>
          <div className="job-id">
            JOB #{job.id} · DUE {fmtDate(job.deadline)}
          </div>
          <h3 className="job-title">{title}</h3>
          <div className="job-parties">
            <div>
              <span className="k">Client</span>
              {shortAddr(job.client)}
            </div>
            <div>
              <span className="k">Freelancer</span>
              {shortAddr(job.freelancer)}
            </div>
          </div>
          <span className={`status-pill status-${job.status}`}>{job.status}</span>
        </div>
        <div className="job-amount">
          <div className="eth">{fmtEth(job.amount)}</div>
          <div className="usd">{fmtUsd(job.amount)}</div>
        </div>
      </div>
      <Timeline status={job.status} />
      <div className="job-actions">
        {actions.length > 0 ? (
          actions
        ) : (
          <div className="no-action">No action available for your current role on this job.</div>
        )}
      </div>
    </div>
  );
}

export default App;
