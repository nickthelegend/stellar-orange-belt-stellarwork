# StellarWork — Escrowed Jobs with On-Chain Reputation

> **Level 3 · Orange Belt** — an end-to-end Soroban dApp built around **two smart
> contracts that talk to each other**: a milestone **escrow** and an independent
> **reputation** ledger. Every time a job settles, the escrow makes a live
> **cross-contract call** into the reputation contract, so a worker's track
> record is written on-chain by the money layer — not by a trusted backend.

StellarWork is a tiny freelance marketplace primitive:

1. A **client** posts a job and **escrows XLM** up front.
2. When the work is delivered, the client **releases** payment → the worker is
   paid **and** their reputation `completed` count goes up.
3. If the deadline passes with no delivery, the client **refunds** themselves →
   a **dispute** is recorded against the worker.

The trust ledger lives in a **separate contract** so it can be reused by other
escrows and never has to migrate when the escrow is upgraded.

---

## 🔗 Live links

| | |
|---|---|
| **Live demo** | ⚠️ _add your Vercel/Netlify URL here_ |
| **Demo video (1–2 min)** | ⚠️ _add your video link here_ |
| **Escrow contract** | [`CCIYGH3XJKOZAXNN7BIXK73MZE7TL5AP6BAX4WAGUM36NXAKF252MKBS`](https://stellar.expert/explorer/testnet/contract/CCIYGH3XJKOZAXNN7BIXK73MZE7TL5AP6BAX4WAGUM36NXAKF252MKBS) |
| **Reputation contract** | [`CBM7O2CVKHQVUBISDCQO6CCKV5UL3EJEY3SNRF7DQWB4HKGXU5L66WFP`](https://stellar.expert/explorer/testnet/contract/CBM7O2CVKHQVUBISDCQO6CCKV5UL3EJEY3SNRF7DQWB4HKGXU5L66WFP) |
| **Network** | Stellar **Testnet** (`Test SDF Network ; September 2015`) |

### Example transactions

| Action | Transaction |
|---|---|
| Authorize escrow as reporter | [`a491a781…3a6f`](https://stellar.expert/explorer/testnet/tx/a491a78159eaa9f77ad06c11e7f620765a63ac5cbc4a71192a49a097b0fb3a6f) |
| Create + fund a job (10 XLM) | [`cd7240a4…c2df`](https://stellar.expert/explorer/testnet/tx/cd7240a414260e8313184bfa7dfc0d56f6bb9e6730bc155b8260aa2d55c9c2df) |
| **Release** (triggers the cross-contract reputation update) | [`45ac5c7b…c7be`](https://stellar.expert/explorer/testnet/tx/45ac5c7b827d4379596fb17b2a8478f849c63066e7dfd48dd87574407314c7be) |

---

## 🏗 Architecture

```
                        ┌──────────────────────────────┐
   client / worker      │        React + Vite UI        │
      (Freighter) ─────▶│  wallet · jobs · live feed    │
                        └───────────────┬──────────────┘
                          simulate (read) │ sign+submit (write)
                                          ▼
                        ┌──────────────────────────────┐
      Stellar RPC ◀────▶│         Soroban RPC           │
                        └───────────────┬──────────────┘
                                        ▼
             ┌────────────────────────────────────────────────┐
             │              ESCROW  contract                   │
             │  create_job · release · refund · list_jobs      │
             │  holds XLM in escrow, emits events              │
             └───────────────┬────────────────────────────────┘
                             │  cross-contract call
                             │  record(reporter=self, subject, ok, amount)
                             ▼
             ┌────────────────────────────────────────────────┐
             │            REPUTATION  contract                 │
             │  add_reporter (admin) · record (reporters only) │
             │  score(addr) → { completed, disputed, volume }  │
             └────────────────────────────────────────────────┘
```

### The cross-contract call (the heart of Level 3)

When `release` runs, the escrow calls the reputation contract:

```rust
// escrow/src/lib.rs
fn report(env: &Env, subject: &Address, success: bool, amount: i128) -> Rep {
    let rep_addr: Address = env.storage().instance().get(&DataKey::Reputation).unwrap();
    let args = vec![
        env,
        env.current_contract_address().into_val(env), // reporter = escrow itself
        subject.into_val(env),
        success.into_val(env),
        amount.into_val(env),
    ];
    env.invoke_contract(&rep_addr, &symbol_short!("record"), args)
}
```

Inside `record`, the reputation contract enforces authorization:

```rust
// reputation/src/lib.rs
pub fn record(env: Env, reporter: Address, subject: Address, success: bool, amount: i128) -> Result<Rep, Error> {
    reporter.require_auth();                        // a contract authorizes its own calls…
    if !Self::is_reporter_internal(&env, &reporter) // …and must be a registered reporter
        { return Err(Error::NotReporter); }
    // …update + persist + emit event…
}
```

Because a contract **implicitly authorizes calls it makes directly**,
`reporter.require_auth()` passes for the escrow but **cannot be forged** by an
end user. So random accounts can never write reputation — only whitelisted
escrow contracts can. This is verified by the `unregistered_reporter_is_rejected`
test.

---

## 🧪 Testing

**13 contract tests** (Rust) + **20 frontend tests** (Vitest).

```bash
# Contracts — unit + full two-contract integration tests
cd level-3/contracts && cargo test

# Frontend — pure-logic + React component tests
cd level-3/frontend && npm install && npm test
```

Contract tests spin up a **real** reputation instance and a **real** Stellar
Asset Contract token, then drive the whole system end-to-end — funding, release,
refund, deadline enforcement, double-release protection, and the cross-contract
reputation update. Frontend tests cover amount/stroop conversion, address
validation, contract-error mapping, and the `JobCard` component's interactions.

---

## 🚀 Run it locally

**Prerequisites:** Rust 1.84+, [`stellar` CLI](https://developers.stellar.org/docs/tools/cli) 25+, Node 18+, and the [Freighter](https://www.freighter.app/) browser wallet (set to **Testnet**).

```bash
# 1. Contracts: test + build
cd level-3/contracts
cargo test
stellar contract build

# 2. (Optional) Deploy your own copy to testnet
cd ..
./scripts/deploy.sh            # deploys both contracts, wires them, writes deployments/testnet.json

# 3. Frontend
cd frontend
npm install
npm run dev                    # http://localhost:5176
```

The frontend ships with the deployed testnet contract ids baked in
(`src/config.js`); override them with `VITE_ESCROW_ID` / `VITE_REPUTATION_ID`
env vars if you redeploy.

---

## 📦 Deploying the frontend (Vercel / Netlify)

```
Root directory:   level-3/frontend
Build command:    npm run build
Output directory: dist
```

That's it — the app is a static SPA. No server, no secrets.

---

## 🔁 CI/CD

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every push/PR:

- **contracts** — `cargo test --workspace` + build both contracts to `wasm32v1-none`
- **frontend** — `npm ci` → `npm run lint` → `npm test` → `npm run build`

Both jobs must pass before a change is considered green.

---

## 🗂 Project layout

```
level-3/
├── contracts/
│   ├── Cargo.toml            # workspace
│   ├── reputation/           # on-chain reputation ledger (+ tests)
│   └── escrow/               # milestone escrow, calls reputation (+ tests)
├── frontend/
│   ├── src/
│   │   ├── config.js         # network + deployed contract ids
│   │   ├── lib/soroban.js    # RPC: simulate reads, sign+submit writes, getEvents
│   │   ├── lib/wallet.js     # Freighter wrapper
│   │   ├── lib/format.js     # pure helpers (unit-tested)
│   │   ├── hooks/            # useWallet, useToasts
│   │   └── components/       # Header, CreateJobForm, JobCard, ActivityFeed, …
│   └── ...
├── scripts/deploy.sh         # reproducible testnet deployment
└── deployments/testnet.json  # deployed addresses + example tx hashes
```

---

## 🔐 Security & production notes

- **Overflow checks** are on in the release profile; all arithmetic uses
  `checked_*`.
- **Authorization** is explicit: `require_auth` on the client for money moves,
  and reporter-gated writes on the reputation ledger.
- **Separation of concerns:** money (escrow) and trust (reputation) are separate
  contracts, so either can evolve independently.
- **State TTL:** instance and persistent entries are bumped (~30 days) on writes.
- This is a **testnet** build for learning. A mainnet version would add a dispute
  arbiter, partial milestones, an allow-list of tokens, and a formal audit.

---

## 📸 Screenshots

> Add your screenshots to `level-3/docs/` and embed them here:

- `docs/desktop.png` — desktop dashboard
- `docs/mobile.png` — mobile responsive view
- `docs/ci.png` — CI pipeline passing
- `docs/tests.png` — test output

Built for the Stellar Journey to Mastery — Monthly Builder, Level 3.
