#!/usr/bin/env bash
# Runs a local chain with the mandate and the pool deployed, and writes the env file the app reads.
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
DESK_KEY=0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6

mkdir -p .data
anvil --port "$PORT" --state "$STATE" --silent &
ANVIL_PID=$!
trap 'kill $ANVIL_PID 2>/dev/null' EXIT

until cast chain-id --rpc-url "$RPC" >/dev/null 2>&1; do sleep 0.2; done

VENUE=$(cast wallet address --private-key "$VENUE_KEY")
field() { node -p "require('./$DEPLOYMENT').$1 ?? ''" 2>/dev/null; }
live() { [ -n "$1" ] && [ "$(cast code "$1" --rpc-url "$RPC")" != "0x" ]; }

deploy() { (cd contracts && UNDERWRITER_ADDRESS=$VENUE "$@" forge script script/Deploy.s.sol --rpc-url "$RPC" --private-key "$DEPLOYER_KEY" --broadcast >/dev/null); }

if ! live "$(field mandate)"; then
  deploy env
elif ! live "$(field pool)"; then
  # A chain from before the pool existed: keep its mandate and vaults, add the pool beside them.
  deploy env USDC_ADDRESS="$(field usdc)" MANDATE_ADDRESS="$(field mandate)"
fi

# The pool needs money to lock behind cover. On a local chain the underwriter mints it.
POOL=$(field pool)
USDC=$(field usdc)
if [ "$(cast call "$POOL" 'totalAssets()(uint256)' --rpc-url "$RPC" | cut -d' ' -f1)" = "0" ]; then
  SEED=250000000000
  cast send "$USDC" 'mint(address,uint256)' "$VENUE" "$SEED" --rpc-url "$RPC" --private-key "$VENUE_KEY" >/dev/null
  cast send "$USDC" 'approve(address,uint256)' "$POOL" "$SEED" --rpc-url "$RPC" --private-key "$VENUE_KEY" >/dev/null
  cast send "$POOL" 'deposit(uint256,address)' "$SEED" "$VENUE" --rpc-url "$RPC" --private-key "$VENUE_KEY" >/dev/null
fi

cat > .env.development.local <<ENV
NEXT_PUBLIC_CHAIN_ID=31337
NEXT_PUBLIC_RPC_URL=$RPC
NEXT_PUBLIC_MANDATE_ADDRESS=$(field mandate)
NEXT_PUBLIC_POOL_ADDRESS=$POOL
NEXT_PUBLIC_USDC_ADDRESS=$USDC
AGENT_PRIVATE_KEY=$AGENT_KEY
VENUE_PRIVATE_KEY=$VENUE_KEY
DESK_PRIVATE_KEY=$DESK_KEY
ENV

echo "Local chain ready on $RPC (mandate $(field mandate), pool $POOL). Ctrl-C to stop."
wait $ANVIL_PID
