#!/usr/bin/env bash
#
# Reproducible deployment of the StellarWork contracts to Stellar Testnet.
#
# It builds the wasm, deploys the reputation ledger, deploys the escrow wired to
# it, authorizes the escrow as a reporter, and writes the resulting addresses to
# deployments/testnet.json.
#
# Prereqs: stellar CLI 25+, a funded identity. Usage:
#   ./scripts/deploy.sh [identity_name]
#
set -euo pipefail

IDENTITY="${1:-deployer}"
NETWORK="testnet"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONTRACTS="$ROOT/contracts"
OUT="$ROOT/deployments/testnet.json"

echo "▶ Using identity: $IDENTITY on $NETWORK"

# Ensure the identity exists and is funded.
if ! stellar keys address "$IDENTITY" >/dev/null 2>&1; then
  echo "▶ Generating + funding identity '$IDENTITY'…"
  stellar keys generate "$IDENTITY" --network "$NETWORK" --fund
fi
ADMIN="$(stellar keys address "$IDENTITY")"
echo "  admin = $ADMIN"

echo "▶ Building contracts…"
( cd "$CONTRACTS" && stellar contract build )

REP_WASM="$CONTRACTS/target/wasm32v1-none/release/reputation.wasm"
ESC_WASM="$CONTRACTS/target/wasm32v1-none/release/escrow.wasm"

NATIVE="$(stellar contract id asset --asset native --network "$NETWORK")"
echo "  native token (SAC) = $NATIVE"

echo "▶ Deploying reputation…"
REP="$(stellar contract deploy --wasm "$REP_WASM" \
  --source "$IDENTITY" --network "$NETWORK" \
  -- --admin "$ADMIN")"
echo "  reputation = $REP"

echo "▶ Deploying escrow (wired to reputation + native token)…"
ESC="$(stellar contract deploy --wasm "$ESC_WASM" \
  --source "$IDENTITY" --network "$NETWORK" \
  -- --admin "$ADMIN" --token "$NATIVE" --reputation "$REP")"
echo "  escrow = $ESC"

echo "▶ Authorizing escrow as a reputation reporter…"
stellar contract invoke --id "$REP" --source "$IDENTITY" --network "$NETWORK" \
  -- add_reporter --reporter "$ESC" >/dev/null
echo "  done."

echo "▶ Writing $OUT"
cat > "$OUT" <<JSON
{
  "network": "$NETWORK",
  "networkPassphrase": "Test SDF Network ; September 2015",
  "rpcUrl": "https://soroban-testnet.stellar.org",
  "horizonUrl": "https://horizon-testnet.stellar.org",
  "admin": "$ADMIN",
  "contracts": {
    "reputation": "$REP",
    "escrow": "$ESC",
    "token_native_sac": "$NATIVE"
  }
}
JSON

echo "✅ Deployed. Update frontend/src/config.js (or VITE_* env) with these ids."
