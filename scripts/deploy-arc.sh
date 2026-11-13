#!/usr/bin/env bash
# Deploys the mandate to Arc testnet and fills in .env.arc.
# Fund the venue address at faucet.circle.com first: it deploys, then passes gas money to the agent and desk.
set -euo pipefail
cd "$(dirname "$0")/.."

RPC=https://rpc.testnet.arc.io
USDC=0x3600000000000000000000000000000000000000
DEPLOYMENT=contracts/deployments/5042002.json
# Arc's base fee never drops below 20 gwei, which is above what Foundry offers by default.
FEES=(--gas-price 25gwei --priority-gas-price 1gwei)

key() { grep "^$1=" .env.arc | cut -d= -f2; }
VENUE_KEY=$(key VENUE_PRIVATE_KEY)
VENUE=$(cast wallet address --private-key "$VENUE_KEY")

# USDC is the gas token on Arc, so the native balance is the dollar balance (18 decimals here, 6 as an ERC-20).
balance=$(cast balance "$VENUE" --rpc-url "$RPC" --ether)
if [ "$(node -p "$balance < 3")" = "true" ]; then
  echo "The venue $VENUE holds $balance USDC. Send it testnet USDC from https://faucet.circle.com (Arc Testnet), then run this again."
  exit 1
fi

if [ ! -f "$DEPLOYMENT" ]; then
  (cd contracts && USDC_ADDRESS=$USDC forge script script/Deploy.s.sol --rpc-url "$RPC" --private-key "$VENUE_KEY" --broadcast \
    --with-gas-price 25gwei --priority-gas-price 1gwei)
fi

for role in AGENT DESK; do
  to=$(cast wallet address --private-key "$(key "${role}_PRIVATE_KEY")")
  if [ "$(cast balance "$to" --rpc-url "$RPC")" = "0" ]; then
    cast send "$to" --value 1ether --rpc-url "$RPC" --private-key "$VENUE_KEY" "${FEES[@]}" >/dev/null
    echo "Sent 1 USDC of gas money to $role $to"
  fi
done

mandate=$(node -p "require('./$DEPLOYMENT').mandate")
block=$(node -p "require('./$DEPLOYMENT').deployedAtBlock")
sed -i '' -e "s|^NEXT_PUBLIC_MANDATE_ADDRESS=.*|NEXT_PUBLIC_MANDATE_ADDRESS=$mandate|" \
  -e "s|^NEXT_PUBLIC_DEPLOY_BLOCK=.*|NEXT_PUBLIC_DEPLOY_BLOCK=$block|" .env.arc

echo "Mandate $mandate at block $block. Run the app against Arc with: npm run start:arc"
