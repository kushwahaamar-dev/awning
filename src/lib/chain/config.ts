import type { Address } from "viem";
import { anvil, arcTestnet } from "viem/chains";

const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? anvil.id);

export const chain = chainId === arcTestnet.id ? arcTestnet : anvil;
export const isLocalChain = chain.id === anvil.id;
export const chainLabel = isLocalChain ? "a local test chain" : chain.name;
export const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL ?? chain.rpcUrls.default.http[0];
// Arc's public endpoint now and then answers "internal error" for a second or two; it did to a new visitor's
// first purchase on 18 November, and the library's own three quick tries all fell inside it. These five reach
// about twelve seconds out, each wait twice the last. A call the contract really refuses is not asked again.
export const PATIENT = { retryCount: 5, retryDelay: 400 } as const;
export const mandateAddress = process.env.NEXT_PUBLIC_MANDATE_ADDRESS as Address;
/** The pool that writes cover, and the only venue the app asks owners to allow. */
export const poolAddress = process.env.NEXT_PUBLIC_POOL_ADDRESS as Address;
export const usdcAddress = process.env.NEXT_PUBLIC_USDC_ADDRESS as Address;
export const deployBlock = BigInt(process.env.NEXT_PUBLIC_DEPLOY_BLOCK ?? 0);

const explorer = chain.blockExplorers?.default.url;
export const explorerTx = (hash: string) => (explorer ? `${explorer}/tx/${hash}` : null);
export const explorerAddress = (address: string) => (explorer ? `${explorer}/address/${address}` : null);

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
