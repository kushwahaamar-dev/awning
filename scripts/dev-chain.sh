#!/usr/bin/env bash
# Runs a local chain with the mandate deployed, and writes the env file the app reads.
# Chain state is kept in .data/anvil.json, so covers survive a restart.
set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${ANVIL_PORT:-8545}"
RPC="http://127.0.0.1:${PORT}"
STATE=".data/anvil.json"
DEPLOYMENT="contracts/deployments/31337.json"

# Anvil's published test keys. They are public and only ever hold local test funds.
DEPLOYER_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
AGENT_KEY=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
VENUE_KEY=0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a

mkdir -p .data
anvil --port "$PORT" --state "$STATE" --silent &
ANVIL_PID=$!
trap 'kill $ANVIL_PID 2>/dev/null' EXIT

until cast chain-id --rpc-url "$RPC" >/dev/null 2>&1; do sleep 0.2; done

deployed() {
  [ -f "$DEPLOYMENT" ] || return 1
  local mandate
  mandate=$(node -p "require('./$DEPLOYMENT').mandate")
  [ "$(cast code "$mandate" --rpc-url "$RPC")" != "0x" ]
}

if ! deployed; then
  (cd contracts && forge script script/Deploy.s.sol --rpc-url "$RPC" --private-key "$DEPLOYER_KEY" --broadcast >/dev/null)
fi

cat > .env.development.local <<ENV
NEXT_PUBLIC_CHAIN_ID=31337
NEXT_PUBLIC_RPC_URL=$RPC
NEXT_PUBLIC_MANDATE_ADDRESS=$(node -p "require('./$DEPLOYMENT').mandate")
NEXT_PUBLIC_USDC_ADDRESS=$(node -p "require('./$DEPLOYMENT').usdc")
AGENT_PRIVATE_KEY=$AGENT_KEY
VENUE_PRIVATE_KEY=$VENUE_KEY
ENV

echo "Local chain ready on $RPC (mandate $(node -p "require('./$DEPLOYMENT').mandate")). Ctrl-C to stop."
wait $ANVIL_PID
