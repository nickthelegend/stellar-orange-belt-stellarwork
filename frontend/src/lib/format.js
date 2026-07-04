import * as StellarSdk from "@stellar/stellar-sdk";
import { STROOPS_PER_XLM } from "../config.js";

// ---- Amount conversion ------------------------------------------------------
// All on-chain amounts are integer stroops (BigInt). The UI speaks XLM.

/** Convert a user-entered XLM string (e.g. "10.5") to integer stroops (BigInt). */
export function xlmToStroops(xlm) {
  const trimmed = String(xlm).trim();
  if (!/^\d+(\.\d{1,7})?$/.test(trimmed)) {
    throw new Error("Enter a positive amount with up to 7 decimals");
  }
  const [whole, frac = ""] = trimmed.split(".");
  const padded = (frac + "0000000").slice(0, 7);
  const stroops = BigInt(whole) * STROOPS_PER_XLM + BigInt(padded);
  if (stroops <= 0n) throw new Error("Amount must be greater than zero");
  return stroops;
}

/** Format integer stroops (BigInt | string | number) as a human XLM string. */
export function stroopsToXlm(stroops) {
  const s = BigInt(stroops);
  const neg = s < 0n;
  const abs = neg ? -s : s;
  const whole = abs / STROOPS_PER_XLM;
  const frac = (abs % STROOPS_PER_XLM).toString().padStart(7, "0").replace(/0+$/, "");
  const body = frac ? `${whole}.${frac}` : `${whole}`;
  return neg ? `-${body}` : body;
}

// ---- Addresses --------------------------------------------------------------

/** "GB2K…5A5E" — a short, human-scannable form of a Stellar/contract address. */
export function shortenAddress(addr, lead = 4, tail = 4) {
  if (!addr || addr.length <= lead + tail) return addr || "";
  return `${addr.slice(0, lead)}…${addr.slice(-tail)}`;
}

/** True for a valid ed25519 public key (G...) or contract id (C...). */
export function isValidStellarAddress(addr) {
  try {
    StellarSdk.StrKey.decodeEd25519PublicKey(addr);
    return true;
  } catch {
    try {
      StellarSdk.StrKey.decodeContract(addr);
      return true;
    } catch {
      return false;
    }
  }
}

// ---- Job status -------------------------------------------------------------
// `scValToNative` decodes a unit enum variant to a single-element array like
// ["Funded"]. Normalize to a plain lowercase string the UI can switch on.

export function parseStatus(raw) {
  let tag = raw;
  if (Array.isArray(raw)) tag = raw[0];
  else if (raw && typeof raw === "object" && "tag" in raw) tag = raw.tag;
  return String(tag ?? "").toLowerCase();
}

// ---- Contract error mapping -------------------------------------------------
// Contract errors surface as `Error(Contract, #N)` in RPC responses. Map the
// numeric codes (which match the `#[repr(u32)]` enums) to friendly messages.

const ESCROW_ERRORS = {
  1: "Amount must be greater than zero.",
  2: "Deadline must be in the future.",
  3: "Client and worker must be different accounts.",
  4: "That job does not exist.",
  5: "This job is already released or refunded.",
  6: "You can only refund after the deadline has passed.",
  7: "Amount too large (overflow).",
};

const REPUTATION_ERRORS = {
  1: "Only an authorized escrow contract can write reputation.",
  2: "Reputation counter overflowed.",
};

/** Turn any thrown/simulated error into a short human message. */
export function mapContractError(err, kind = "escrow") {
  const table = kind === "reputation" ? REPUTATION_ERRORS : ESCROW_ERRORS;
  const text = typeof err === "string" ? err : err?.message || String(err);

  const m = text.match(/Error\(Contract,\s*#(\d+)\)/) || text.match(/#(\d+)/);
  if (m) {
    const code = Number(m[1]);
    if (table[code]) return table[code];
  }
  if (/User declined|denied|rejected/i.test(text)) return "You rejected the request in your wallet.";
  if (/insufficient|underfunded|balance/i.test(text)) return "Insufficient balance for this transaction.";
  return text.length > 160 ? "Transaction failed. Please try again." : text;
}
