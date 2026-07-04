import {
  isConnected,
  isAllowed,
  setAllowed,
  requestAccess,
  getAddress,
  signTransaction as freighterSign,
  getNetwork,
} from "@stellar/freighter-api";

// Thin wrapper around the Freighter API (v4). Everything the UI needs to talk
// to a wallet lives here, so swapping in Stellar Wallets Kit later is a one-file
// change.

export async function hasFreighter() {
  const res = await isConnected();
  return Boolean(res?.isConnected);
}

/** Prompt the user to connect and return their public key. */
export async function connect() {
  const allowed = await isAllowed();
  if (!allowed?.isAllowed) {
    await setAllowed();
  }
  const access = await requestAccess();
  if (access?.error) throw new Error(access.error);
  return access.address;
}

/** Return the already-authorized address, or null if not connected. */
export async function getConnectedAddress() {
  const res = await getAddress();
  if (res?.error || !res?.address) return null;
  return res.address;
}

export async function getWalletNetwork() {
  const res = await getNetwork();
  return res?.network || null;
}

/**
 * Sign a transaction XDR with Freighter. Returns the signed XDR string, matching
 * the shape `soroban.js` expects (`{ signedTxXdr }`).
 */
export async function signTransaction(xdr, opts) {
  const res = await freighterSign(xdr, opts);
  if (res?.error) throw new Error(res.error);
  // v4 returns { signedTxXdr }; older shims returned a bare string.
  return { signedTxXdr: res.signedTxXdr || res };
}
