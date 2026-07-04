import * as StellarSdk from "@stellar/stellar-sdk";

// ---- Testnet configuration --------------------------------------------------
// This dApp is testnet-only. The deployed contract ids come straight from
// `deployments/testnet.json` at the repo root. Override any of them at build
// time with a matching VITE_* env var (handy for redeploys / forks).
export const NETWORK = {
  passphrase: StellarSdk.Networks.TESTNET,
  rpcUrl: import.meta.env.VITE_RPC_URL || "https://soroban-testnet.stellar.org",
  horizonUrl: "https://horizon-testnet.stellar.org",
  friendbotUrl: "https://friendbot.stellar.org",
  explorerTx: (hash) => `https://stellar.expert/explorer/testnet/tx/${hash}`,
  explorerContract: (id) =>
    `https://stellar.expert/explorer/testnet/contract/${id}`,
  explorerAccount: (id) =>
    `https://stellar.expert/explorer/testnet/account/${id}`,
};

export const CONTRACTS = {
  escrow:
    import.meta.env.VITE_ESCROW_ID ||
    "CCIYGH3XJKOZAXNN7BIXK73MZE7TL5AP6BAX4WAGUM36NXAKF252MKBS",
  reputation:
    import.meta.env.VITE_REPUTATION_ID ||
    "CBM7O2CVKHQVUBISDCQO6CCKV5UL3EJEY3SNRF7DQWB4HKGXU5L66WFP",
  token:
    import.meta.env.VITE_TOKEN_ID ||
    "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
};

// A funded account used only as the *source* for read-only simulations, so the
// dashboard can load before the user connects a wallet. No signing happens with
// it; simulation never touches its balance.
export const READ_SOURCE =
  import.meta.env.VITE_READ_SOURCE ||
  "GB2KE2EOJPGASXT3QYVFG2P2VCFYELAPFGZLZFDC5GMWE5XIEJXJ5A5E";

// Native asset uses 7 decimals (1 XLM = 10_000_000 stroops).
export const STROOPS_PER_XLM = 10_000_000n;
