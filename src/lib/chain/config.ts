import type { Address } from "viem";
import { anvil, arcTestnet } from "viem/chains";

const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? anvil.id);

export const chain = chainId === arcTestnet.id ? arcTestnet : anvil;
export const isLocalChain = chain.id === anvil.id;
export const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL ?? chain.rpcUrls.default.http[0];
export const mandateAddress = process.env.NEXT_PUBLIC_MANDATE_ADDRESS as Address;
export const usdcAddress = process.env.NEXT_PUBLIC_USDC_ADDRESS as Address;
export const deployBlock = BigInt(process.env.NEXT_PUBLIC_DEPLOY_BLOCK ?? 0);

export function explorerTx(hash: string) {
  const base = chain.blockExplorers?.default.url;
  return base ? `${base}/tx/${hash}` : null;
}

// USDC has six decimals. Everything above the chain boundary works in dollars.
export const toUnits = (usd: number) => BigInt(Math.round(usd * 1e6));
export const fromUnits = (units: bigint) => Number(units) / 1e6;

export const BLOCK_REASONS = [
  "Paused",
  "Expired",
  "VenueNotAllowed",
  "OverPerHedgeCap",
  "OverPeriodCap",
  "OverDailyFloat",
  "ApprovalRequired",
  "ApprovalExpired",
  "InsufficientBalance",
] as const;
export type BlockReason = (typeof BLOCK_REASONS)[number];

export const HEDGE_OUTCOME = { Paid: 2, Expired: 3, Refunded: 4 } as const;
export type HedgeOutcome = keyof typeof HEDGE_OUTCOME;

export const hedgeApprovalTypes = {
  HedgeApproval: [
    { name: "hedgeId", type: "bytes32" },
    { name: "venue", type: "address" },
    { name: "premium", type: "uint256" },
    { name: "maxPayout", type: "uint256" },
    { name: "marketRef", type: "bytes32" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export const hedgeApprovalDomain = {
  name: "AwningMandate",
  version: "1",
  chainId: chain.id,
  verifyingContract: mandateAddress,
} as const;
