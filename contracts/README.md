# Awning contracts

`AwningMandate` is the spending mandate for the Awning agent. An owner (EOA or ERC-1271 smart
account) deposits USDC into a per-owner vault, names one agent key, and sets limits. The agent can
only move that money through two doors, and the limits are enforced onchain, outside the model.

## What it guarantees

For any owner whose agent key is fully compromised:

- The agent can never send vault funds anywhere except (a) its own address via `drawFloat`, capped
  per UTC day by `floatDailyCap`, and (b) an owner-allowlisted venue via `openHedge`.
- Float theft is bounded: `limits(owner).floatRemainingToday` is exactly the most the agent can
  still take for itself right now (it is also capped by the vault balance, and is 0 when paused or
  expired).
- Premiums are bounded per hedge (`premiumPerHedgeCap`) and per 30-day period
  (`premiumPeriodCap`), signature or not. An owner signature only lifts the approval threshold; it
  never lifts a cap.
- Premiums above `approvalThreshold` need an EIP-712 `HedgeApproval` signature from the owner,
  bound to hedge id, venue, premium, max payout, market and deadline. A signature cannot be
  replayed for a different amount, venue or hedge.
- `setPaused(true)` stops the agent immediately. The owner can always `withdraw`, paused or not.
- Policy violations by the agent do not revert. They emit `Blocked(owner, agent, action, reason, ...)`
  and move nothing, so a refused attack is an indexable onchain event. Calls from anyone who is not
  the owner's agent revert with `NotAgent()` and emit nothing.

## What it does not guarantee

- Funds sent to an allowlisted venue under the unapproved cap are not protected from a hijacked
  agent, only bounded. A hijacked agent can burn up to `premiumPerHedgeCap`/`premiumPeriodCap` on
  junk hedges at an allowlisted venue (and `floatDailyCap` per day to itself). Pick caps you can
  afford to lose.
- The agent chooses the market, size and timing of every hedge within those bounds. The contract
  does not know whether a hedge is a sensible hedge.
- `floatDrawn` and `premiumSpent` are never refunded. A closed or refunded hedge does not give back
  period allowance.
- Lowering a cap mid-period applies to amounts already used; it does not claw anything back.
- `expiresAt == 0` means "expired" (the agent can do nothing until the owner sets a future expiry).

## Trust assumptions about the venue and `closeHedge`

`closeHedge` is callable only by the hedge's venue, and the contract cannot check the venue's
claim. A venue that reports `Expired` for a hedge that actually won, or never calls `closeHedge`,
costs the owner the payout. `evidence` is only emitted, never verified. In exchange the venue
cannot hurt the owner beyond what it already holds: `Paid` is bounded by `maxPayout` plus the
premium (winnings and any premium that went unspent), `Refunded` by `premium`, the venue must have approved the mandate for `payout`, and the hedge can only be
closed once. The owner chooses which venues to allow, so the venue is a trusted counterparty, the
same way a broker is. Venues should be allowlisted only if you accept that.

## Build and test

Requires Foundry. OpenZeppelin is read from the repo's `node_modules` (`../node_modules`), so run
`npm install` at the repo root first. `forge-std` is vendored in `lib/`.

```sh
cd contracts
forge build
forge test -vv              # unit, fuzz (512 runs) and invariant (256 runs x depth 100) tests
FOUNDRY_PROFILE=ci forge test   # heavier fuzz/invariant settings
forge fmt --check
```

Note: `forge coverage` cannot resolve OpenZeppelin through the `..` remapping. To measure
coverage, point the remapping at a path inside `contracts/` (for example a temporary symlink to
`../node_modules/@openzeppelin/contracts`) via an alternate `FOUNDRY_CONFIG`.

After changing a contract, regenerate the app's ABI file:

```sh
node contracts/script/export-abi.mjs    # from the repo root; writes src/lib/chain/abi.ts
```

`usdcAbi` is exported from `MockUSDC`, so it includes `mint`, `permit` and
`transferWithAuthorization`. Do not call `mint` against real USDC.

## Deploy

`script/Deploy.s.sol` deploys `AwningMandate`. If `USDC_ADDRESS` is set it uses that token,
otherwise it deploys `MockUSDC` first. A broadcast run writes `deployments/<chainId>.json`
(`chainId`, `mandate`, `usdc`, `mockUsdc`, `deployedAtBlock`; the block is the one the script
simulated against, so it is at or just before the deployment block and safe as a log-scan start).
A dry run (no `--broadcast`) writes nothing.

### Local anvil

```sh
anvil &
forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast \
  --private-key <anvil key 0>
cast call $(jq -r .mandate deployments/31337.json) "usdc()(address)" --rpc-url http://127.0.0.1:8545
```

### Arc testnet (chain ID 5042002)

Arc enforces a minimum base fee of 20 gwei. Foundry's default gas estimate can come in below that
and leave transactions stuck, so always pass explicit fees:

```sh
export USDC_ADDRESS=0x3600000000000000000000000000000000000000   # Arc's 6-decimal USDC ERC-20
forge script script/Deploy.s.sol --rpc-url arc_testnet --broadcast \
  --private-key $DEPLOYER_KEY \
  --with-gas-price 25gwei --priority-gas-price 1gwei
```

`--with-gas-price` becomes `maxFeePerGas` (25 gwei, 5 above the 20 gwei floor so base-fee drift does
not strand the transaction) and `--priority-gas-price` becomes `maxPriorityFeePerGas`. The same flags
work for `cast send` (`--gas-price 25gwei --priority-gas-price 1gwei`). The deployer needs testnet
USDC, since USDC is the gas token. If a transaction is stuck, resend with a higher `--with-gas-price`
(and the same nonce via `cast send --nonce`).

Observed against the public RPC (read-only, 2026-11-13): `cast chain-id` returned 5042002,
`cast gas-price` returned 25000000000 (25 gwei), and the latest block had `baseFeePerGas`
20000000000 (20 gwei) with a 30M gas limit. Locally, anvil confirmed the flags map to a type-2
transaction with `maxFeePerGas` 25 gwei and `maxPriorityFeePerGas` 1 gwei. No transaction was sent to
Arc.

## Layout

```
src/AwningMandate.sol        the mandate
src/mocks/MockUSDC.sol       6-decimals USDC with EIP-2612 and EIP-3009, for local use only
test/                        unit, fuzz and invariant tests
script/Deploy.s.sol          deploy + deployments/<chainId>.json
script/export-abi.mjs        forge output -> src/lib/chain/abi.ts
```
