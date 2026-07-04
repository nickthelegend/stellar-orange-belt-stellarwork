import { useCallback, useEffect, useRef, useState } from "react";
import Header from "./components/Header.jsx";
import CreateJobForm from "./components/CreateJobForm.jsx";
import JobCard from "./components/JobCard.jsx";
import ActivityFeed from "./components/ActivityFeed.jsx";
import ReputationLookup from "./components/ReputationLookup.jsx";
import Toasts from "./components/Toasts.jsx";
import { useWallet } from "./hooks/useWallet.js";
import { useToasts } from "./hooks/useToasts.js";
import {
  createJob,
  getRecentEvents,
  listJobs,
  refundJob,
  releaseJob,
} from "./lib/soroban.js";
import { CONTRACTS, NETWORK } from "./config.js";
import { mapContractError, shortenAddress } from "./lib/format.js";

const POLL_MS = 6000;

export default function App() {
  const wallet = useWallet();
  const { toasts, toast, dismiss } = useToasts();

  const [jobs, setJobs] = useState([]);
  const [events, setEvents] = useState([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [feedLoading, setFeedLoading] = useState(true);
  const [pendingId, setPendingId] = useState(null); // which action is in flight
  const mounted = useRef(true);

  const refreshJobs = useCallback(async () => {
    try {
      const list = await listJobs();
      if (mounted.current) setJobs(list);
    } catch (err) {
      console.error("listJobs failed", err);
    } finally {
      if (mounted.current) setJobsLoading(false);
    }
  }, []);

  const refreshEvents = useCallback(async () => {
    try {
      const evs = await getRecentEvents();
      if (mounted.current) setEvents(evs);
    } catch (err) {
      console.error("getEvents failed", err);
    } finally {
      if (mounted.current) setFeedLoading(false);
    }
  }, []);

  // Initial load + polling for near-real-time updates.
  useEffect(() => {
    mounted.current = true;
    refreshJobs();
    refreshEvents();
    const t = setInterval(() => {
      refreshJobs();
      refreshEvents();
    }, POLL_MS);
    return () => {
      mounted.current = false;
      clearInterval(t);
    };
  }, [refreshJobs, refreshEvents]);

  function requireWallet() {
    if (!wallet.address) {
      toast.error("Connect your Freighter wallet first.");
      return false;
    }
    if (!wallet.onTestnet) {
      toast.error("Switch Freighter to the Testnet network.");
      return false;
    }
    return true;
  }

  async function handleCreate({ worker, amountStroops, deadline }) {
    if (!requireWallet()) return;
    setPendingId("create");
    try {
      const { hash } = await createJob({
        client: wallet.address,
        worker,
        amountStroops,
        deadline,
        walletAddress: wallet.address,
        signTransaction: wallet.signTransaction,
      });
      toast.success(`Job posted & funded — ${shortenAddress(hash, 6, 6)}`);
      await Promise.all([refreshJobs(), refreshEvents(), wallet.refreshBalance()]);
    } catch (err) {
      toast.error(mapContractError(err));
    } finally {
      setPendingId(null);
    }
  }

  async function handleRelease(job) {
    if (!requireWallet()) return;
    setPendingId(`job-${job.id}`);
    try {
      const { returnValue } = await releaseJob({
        jobId: job.id,
        walletAddress: wallet.address,
        signTransaction: wallet.signTransaction,
      });
      const completed = returnValue?.completed;
      toast.success(
        completed != null
          ? `Released! Worker reputation is now ${completed} completed.`
          : "Payment released."
      );
      await Promise.all([refreshJobs(), refreshEvents(), wallet.refreshBalance()]);
    } catch (err) {
      toast.error(mapContractError(err));
    } finally {
      setPendingId(null);
    }
  }

  async function handleRefund(job) {
    if (!requireWallet()) return;
    setPendingId(`job-${job.id}`);
    try {
      await refundJob({
        jobId: job.id,
        walletAddress: wallet.address,
        signTransaction: wallet.signTransaction,
      });
      toast.success("Refunded to you. Dispute recorded against the worker.");
      await Promise.all([refreshJobs(), refreshEvents(), wallet.refreshBalance()]);
    } catch (err) {
      toast.error(mapContractError(err));
    } finally {
      setPendingId(null);
    }
  }

  const myJobs = wallet.address
    ? jobs.filter((j) => j.client === wallet.address || j.worker === wallet.address)
    : [];
  const otherJobs = jobs.filter((j) => !myJobs.includes(j));

  return (
    <div className="app">
      <Header wallet={wallet} />

      <main className="layout">
        <div className="col main-col">
          <CreateJobForm
            disabled={!wallet.address}
            pending={pendingId === "create"}
            onSubmit={handleCreate}
          />

          <section className="jobs">
            <div className="section-head">
              <h2>Jobs</h2>
              {jobsLoading && <span className="spinner" aria-label="loading" />}
            </div>

            {!jobsLoading && jobs.length === 0 && (
              <p className="muted empty">No jobs yet. Be the first to post one.</p>
            )}

            {myJobs.length > 0 && (
              <>
                <h3 className="subhead">Your jobs</h3>
                <div className="job-grid">
                  {myJobs.map((job) => (
                    <JobCard
                      key={job.id}
                      job={job}
                      viewer={wallet.address}
                      pending={pendingId === `job-${job.id}`}
                      onRelease={handleRelease}
                      onRefund={handleRefund}
                    />
                  ))}
                </div>
              </>
            )}

            {otherJobs.length > 0 && (
              <>
                <h3 className="subhead">All jobs</h3>
                <div className="job-grid">
                  {otherJobs.map((job) => (
                    <JobCard
                      key={job.id}
                      job={job}
                      viewer={wallet.address}
                      pending={pendingId === `job-${job.id}`}
                      onRelease={handleRelease}
                      onRefund={handleRefund}
                    />
                  ))}
                </div>
              </>
            )}
          </section>
        </div>

        <aside className="col side-col">
          <ActivityFeed events={events} loading={feedLoading} />
          <ReputationLookup />
          <section className="card contracts">
            <h2>Deployed contracts</h2>
            <ul className="contract-list">
              <li>
                <span>Escrow</span>
                <a href={NETWORK.explorerContract(CONTRACTS.escrow)} target="_blank" rel="noreferrer">
                  {shortenAddress(CONTRACTS.escrow, 6, 6)} ↗
                </a>
              </li>
              <li>
                <span>Reputation</span>
                <a href={NETWORK.explorerContract(CONTRACTS.reputation)} target="_blank" rel="noreferrer">
                  {shortenAddress(CONTRACTS.reputation, 6, 6)} ↗
                </a>
              </li>
            </ul>
            <p className="muted small">
              Escrow calls Reputation on every release/refund — a live
              cross-contract call on Stellar Testnet.
            </p>
          </section>
        </aside>
      </main>

      <footer className="footer muted">
        StellarWork · Level 3 · Soroban Testnet · Built with the Stellar SDK
      </footer>

      <Toasts toasts={toasts} dismiss={dismiss} />
    </div>
  );
}
