import * as StellarSdk from "@stellar/stellar-sdk";
import { NETWORK, CONTRACTS, READ_SOURCE } from "../config.js";

const server = new StellarSdk.rpc.Server(NETWORK.rpcUrl);
const horizon = new StellarSdk.Horizon.Server(NETWORK.horizonUrl);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- ScVal argument builders ------------------------------------------------
export const arg = {
  address: (a) => new StellarSdk.Address(a).toScVal(),
  i128: (stroops) => StellarSdk.nativeToScVal(BigInt(stroops), { type: "i128" }),
  u64: (n) => StellarSdk.nativeToScVal(BigInt(n), { type: "u64" }),
  u32: (n) => StellarSdk.nativeToScVal(Number(n), { type: "u32" }),
  bool: (b) => StellarSdk.nativeToScVal(Boolean(b), { type: "bool" }),
};

// ---- Read (simulate, no signature) ------------------------------------------
// Simulation runs the contract without submitting, so reads are free and
// instant. We use a known funded account purely as the transaction source.
async function readContract(contractId, method, args = []) {
  const source = await server.getAccount(READ_SOURCE);
  const contract = new StellarSdk.Contract(contractId);
  const tx = new StellarSdk.TransactionBuilder(source, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: NETWORK.passphrase,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (StellarSdk.rpc.Api.isSimulationError(sim)) {
    throw new Error(sim.error);
  }
  return StellarSdk.scValToNative(sim.result.retval);
}

// ---- Write (prepare -> wallet sign -> submit -> poll) -----------------------
async function invokeContract({ contractId, method, args, walletAddress, signTransaction }) {
  const source = await server.getAccount(walletAddress);
  const contract = new StellarSdk.Contract(contractId);
  const built = new StellarSdk.TransactionBuilder(source, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: NETWORK.passphrase,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(120)
    .build();

  // prepareTransaction simulates + assembles the Soroban auth/resource footprint.
  const prepared = await server.prepareTransaction(built);

  const { signedTxXdr } = await signTransaction(prepared.toXDR(), {
    networkPassphrase: NETWORK.passphrase,
    address: walletAddress,
  });

  const signed = StellarSdk.TransactionBuilder.fromXDR(signedTxXdr, NETWORK.passphrase);
  const sent = await server.sendTransaction(signed);
  if (sent.status === "ERROR") {
    throw new Error(sent.errorResult?.toString?.() || "Transaction submission failed");
  }

  // Poll until the ledger closes.
  let result = await server.getTransaction(sent.hash);
  let tries = 0;
  while (result.status === "NOT_FOUND" && tries < 30) {
    await sleep(1000);
    result = await server.getTransaction(sent.hash);
    tries += 1;
  }
  if (result.status !== "SUCCESS") {
    throw new Error(`Transaction ${sent.hash} failed with status ${result.status}`);
  }

  const returnValue =
    result.returnValue != null ? StellarSdk.scValToNative(result.returnValue) : null;
  return { hash: sent.hash, returnValue };
}

// ---- Domain: reads ----------------------------------------------------------
export async function listJobs() {
  const jobs = await readContract(CONTRACTS.escrow, "list_jobs", []);
  return jobs.map(normalizeJob);
}

export async function getJobCount() {
  return Number(await readContract(CONTRACTS.escrow, "job_count", []));
}

export async function getReputation(address) {
  const rep = await readContract(CONTRACTS.reputation, "score", [arg.address(address)]);
  return {
    completed: Number(rep.completed),
    disputed: Number(rep.disputed),
    volume: BigInt(rep.volume),
  };
}

function normalizeJob(job) {
  // `status` decodes as a single-element array like ["Funded"]; flatten it.
  const status = Array.isArray(job.status) ? job.status[0] : job.status;
  return {
    id: Number(job.id),
    client: job.client,
    worker: job.worker,
    amount: BigInt(job.amount),
    deadline: Number(job.deadline),
    status: String(status),
  };
}

// ---- Domain: writes ---------------------------------------------------------
export function createJob({ client, worker, amountStroops, deadline, walletAddress, signTransaction }) {
  return invokeContract({
    contractId: CONTRACTS.escrow,
    method: "create_job",
    args: [arg.address(client), arg.address(worker), arg.i128(amountStroops), arg.u64(deadline)],
    walletAddress,
    signTransaction,
  });
}

export function releaseJob({ jobId, walletAddress, signTransaction }) {
  return invokeContract({
    contractId: CONTRACTS.escrow,
    method: "release",
    args: [arg.u32(jobId)],
    walletAddress,
    signTransaction,
  });
}

export function refundJob({ jobId, walletAddress, signTransaction }) {
  return invokeContract({
    contractId: CONTRACTS.escrow,
    method: "refund",
    args: [arg.u32(jobId)],
    walletAddress,
    signTransaction,
  });
}

// ---- Event streaming (live activity feed) -----------------------------------
// Poll the escrow contract's on-chain events. This is what makes the feed feel
// "real-time" — the UI calls this on an interval and diffs by ledger.
export async function getRecentEvents(limit = 25) {
  const latest = await server.getLatestLedger();
  const startLedger = Math.max(latest.sequence - 4000, 1);
  try {
    const res = await server.getEvents({
      startLedger,
      filters: [{ type: "contract", contractIds: [CONTRACTS.escrow] }],
      limit,
    });
    return res.events.map(decodeEvent).reverse(); // newest first
  } catch {
    // Outside the RPC retention window (or none yet) — show an empty feed.
    return [];
  }
}

function decodeEvent(e) {
  const topics = (e.topic || []).map((t) => StellarSdk.scValToNative(t));
  const value = e.value != null ? StellarSdk.scValToNative(e.value) : null;
  return {
    id: `${e.ledger}-${e.id ?? topics.join("-")}`,
    kind: String(topics[0] ?? "event"),
    jobId: topics[1] != null ? Number(topics[1]) : null,
    value,
    txHash: e.txHash,
    ledger: e.ledger,
    at: e.ledgerClosedAt,
  };
}

// ---- Account helpers --------------------------------------------------------
export async function getXlmBalance(address) {
  try {
    const account = await horizon.loadAccount(address);
    const native = account.balances.find((b) => b.asset_type === "native");
    return native ? native.balance : "0";
  } catch (err) {
    if (err?.response?.status === 404) return null; // unfunded
    throw err;
  }
}

export async function fundWithFriendbot(address) {
  const res = await fetch(`${NETWORK.friendbotUrl}?addr=${encodeURIComponent(address)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.detail || `Friendbot funding failed (HTTP ${res.status})`);
  }
  return res.json();
}
