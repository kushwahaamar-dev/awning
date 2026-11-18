import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  createTestClient,
  createWalletClient,
  encodeAbiParameters,
  http,
  keccak256,
  nonceManager,
  parseEther,
  parseEventLogs,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { awningMandateAbi, awningPoolAbi, usdcAbi } from "./abi";
import {
  PATIENT,
  BLOCK_REASONS,
  chain,
  fromUnits,
  isLocalChain,
  mandateAddress,
  poolAddress,
  rpcUrl,
  toUnits,
  usdcAddress,
  type BlockReason,
} from "./config";

// Reads that happen together travel as one request, which keeps a page refresh well inside a public endpoint's limits.
const transport = http(rpcUrl, { batch: true, ...PATIENT });
export const publicClient = createPublicClient({ chain, transport });

function signer(envName: "AGENT_PRIVATE_KEY" | "VENUE_PRIVATE_KEY") {
  const key = process.env[envName];
  if (!key) throw new Error(`${envName} is not set. Run "npm run chain" for a local setup, or see .env.example.`);
  // One nonce manager per key: API requests overlap, and each would otherwise read the same pending nonce.
  const account = privateKeyToAccount(key as Hex, { nonceManager });
  return createWalletClient({ account, chain, transport });
}

const globals = globalThis as { awningSigners?: { agent: ReturnType<typeof signer>; venue: ReturnType<typeof signer> } };
const signers = () => (globals.awningSigners ??= { agent: signer("AGENT_PRIVATE_KEY"), venue: signer("VENUE_PRIVATE_KEY") });

export const agentAccount = () => signers().agent.account;
export const agentAddress = () => agentAccount().address;

const mandate = { address: mandateAddress, abi: awningMandateAbi } as const;
const pool = { address: poolAddress, abi: awningPoolAbi } as const;

export type Attempt = { txHash: Hex; ok: true } | { txHash: Hex; ok: false; reason: BlockReason };

async function mined(txHash: Hex) {
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") throw new Error(`Transaction ${txHash} reverted`);
  return receipt;
}

async function outcome(txHash: Hex): Promise<Attempt> {
  const receipt = await mined(txHash);
  const [blocked] = parseEventLogs({ abi: awningMandateAbi, eventName: "Blocked", logs: receipt.logs });
  return blocked ? { txHash, ok: false, reason: BLOCK_REASONS[blocked.args.reason] } : { txHash, ok: true };
}

export type HedgeTerms = {
  owner: Address;
  hedgeId: Hex;
  venue: Address;
  premium: number;
  maxPayout: number;
  marketRef: Hex;
  deadline: number;
  ownerSignature: Hex;
};

/** Asks the mandate to pay a premium. A refusal is a successful transaction that moved nothing. */
export async function openHedge(t: HedgeTerms): Promise<Attempt> {
  const txHash = await signers().agent.writeContract({
    ...mandate,
    functionName: "openHedge",
    args: [t.owner, t.hedgeId, t.venue, toUnits(t.premium), toUnits(t.maxPayout), t.marketRef, BigInt(t.deadline), t.ownerSignature],
  });
  return outcome(txHash);
}

export async function drawFloat(owner: Address, usd: number, purpose: Hex): Promise<Attempt> {
  const txHash = await signers().agent.writeContract({ ...mandate, functionName: "drawFloat", args: [owner, toUnits(usd), purpose] });
  return outcome(txHash);
}

/** The pool can't lock a payout this size: it is short of free money, or too much already rides on this market. */
export class PoolFull extends Error {}

export type Offer = { hedgeId: Hex; owner: Address; premium: number; payout: number; marketRef: Hex; takeBy: number; resolveBy: number };

/**
 * The underwriter offers cover, which locks the whole payout in the pool before the owner pays anything.
 * The underwriter and resolver are one key here (VENUE_PRIVATE_KEY); the pool keeps the two roles apart.
 */
export async function offerCover(o: Offer): Promise<Hex> {
  const { venue } = signers();
  const request = {
    ...pool,
    functionName: "offer",
    args: [o.hedgeId, o.owner, toUnits(o.premium), toUnits(o.payout), o.marketRef, BigInt(o.takeBy), BigInt(o.resolveBy)],
  } as const;
  try {
    await publicClient.simulateContract({ ...request, account: venue.account });
  } catch (error) {
    const revert = error instanceof BaseError ? error.walk((e) => e instanceof ContractFunctionRevertedError) : null;
    const name = revert instanceof ContractFunctionRevertedError ? revert.data?.errorName : null;
    if (name === "NotEnoughFree" || name === "TooMuchOnOneMarket") throw new PoolFull();
    throw error;
  }
  return sent(await venue.writeContract(request));
}

async function sent(txHash: Hex) {
  await mined(txHash);
  return txHash;
}

/** As resolver: reports whether the event happened. The pool pays the owner's vault, or keeps the premium. */
export const settleCover = async (hedgeId: Hex, happened: boolean, evidence: Hex) =>
  sent(await signers().venue.writeContract({ ...pool, functionName: "settle", args: [hedgeId, happened, evidence] }));

// Anyone may call the next two. The server does, as housekeeping.

/** Unlocks an offer nobody took in time. */
export const lapseOffer = async (hedgeId: Hex) => sent(await signers().venue.writeContract({ ...pool, functionName: "lapse", args: [hedgeId] }));

/** Sends back a premium an owner's vault paid the pool without taking a live offer. */
export const rejectPremium = async (owner: Address, hedgeId: Hex) =>
  sent(await signers().venue.writeContract({ ...pool, functionName: "reject", args: [owner, hedgeId] }));

const OFFER_STATES = ["none", "live", "closed"] as const;

/** Whether the pool still has a payout locked under this id. */
export async function offerState(hedgeId: Hex): Promise<(typeof OFFER_STATES)[number]> {
  const offer = await publicClient.readContract({ ...pool, functionName: "offers", args: [hedgeId] });
  return OFFER_STATES[offer[5]];
}

/** Whether the premium was paid on exactly the terms the pool offered, which is what makes the cover real. */
export const coverTaken = (hedgeId: Hex) => publicClient.readContract({ ...pool, functionName: "taken", args: [hedgeId] });

export type PoolState = { assets: number; locked: number; free: number };

export async function readPool(): Promise<PoolState> {
  const [assets, locked, free] = await Promise.all([
    publicClient.readContract({ ...pool, functionName: "totalAssets" }),
    publicClient.readContract({ ...pool, functionName: "locked" }),
    publicClient.readContract({ ...pool, functionName: "freeAssets" }),
  ]);
  return { assets: fromUnits(assets), locked: fromUnits(locked), free: fromUnits(free) };
}

const HEDGE_STATES = ["none", "open", "paid", "expired", "refunded"] as const;

/** What the mandate itself says about an owner's hedge, for when the database and the chain may disagree. */
export async function hedgeState(owner: Address, hedgeId: Hex): Promise<(typeof HEDGE_STATES)[number]> {
  // The mandate files hedges per owner; this is its `hedgeKey`.
  const key = keccak256(encodeAbiParameters([{ type: "address" }, { type: "bytes32" }], [owner, hedgeId]));
  const hedge = await publicClient.readContract({ ...mandate, functionName: "hedges", args: [key] });
  return HEDGE_STATES[hedge[5]];
}

export type Allowance = {
  balance: number;
  agent: Address;
  paused: boolean;
  expiresAt: number;
  dailyDataCap: number;
  perCoverCap: number;
  monthlyCap: number;
  approvalThreshold: number;
  /** What a fully hijacked agent could move to itself right now. */
  dataLeftToday: number;
  premiumLeftThisMonth: number;
  /** The owner has allowed premiums to go to the pool. */
  poolApproved: boolean;
};

export async function readAllowance(owner: Address): Promise<Allowance> {
  const [policy, balance, limits, poolApproved] = await Promise.all([
    publicClient.readContract({ ...mandate, functionName: "policies", args: [owner] }),
    publicClient.readContract({ ...mandate, functionName: "balanceOf", args: [owner] }),
    publicClient.readContract({ ...mandate, functionName: "limits", args: [owner] }),
    publicClient.readContract({ ...mandate, functionName: "venueAllowed", args: [owner, poolAddress] }),
  ]);
  const [agent, expiresAt, paused, floatDailyCap, premiumPerHedgeCap, premiumPeriodCap, approvalThreshold] = policy;
  return {
    balance: fromUnits(balance),
    agent,
    paused,
    expiresAt: Number(expiresAt),
    dailyDataCap: fromUnits(floatDailyCap),
    perCoverCap: fromUnits(premiumPerHedgeCap),
    monthlyCap: fromUnits(premiumPeriodCap),
    approvalThreshold: fromUnits(approvalThreshold),
    dataLeftToday: fromUnits(limits[0]),
    premiumLeftThisMonth: fromUnits(limits[1]),
    poolApproved,
  };
}

const LOCAL_GRANT_USD = 5_000;
// On a public testnet the grant comes out of the operator's own faucet money. It is enough to cover a loss a
// shop would notice while there is plenty, and is paced as the money goes: never more than a twelfth of what
// is left, so a busy afternoon makes the grants smaller and does not end them.
const MOST_GRANT_USD = Number(process.env.FAUCET_USD ?? 25);
const LEAST_GRANT_USD = 2;
const GRANTS_IN_HAND = 12;
const OPERATOR_RESERVE_USD = 1;
const GRANTS_PER_HOUR = 30;
const granted: number[] = [];
let paced: { at: number; grant: number } | null = null;

/** What a new visitor is given to try the app with, as things stand. Examples are sized to it. */
export async function visitorGrant(): Promise<number> {
  if (isLocalChain) return LOCAL_GRANT_USD;
  if (paced && Date.now() - paced.at < 60_000) return paced.grant;
  const operator = signers().venue.account.address;
  const spare = await publicClient.readContract({ address: usdcAddress, abi: usdcAbi, functionName: "balanceOf", args: [operator] }).catch(() => null);
  // When the chain can't be asked, the last answer stands, and failing that the least a visitor is ever given.
  if (spare === null) return paced?.grant ?? LEAST_GRANT_USD;
  const grant = Math.min(MOST_GRANT_USD, Math.max(LEAST_GRANT_USD, Math.floor(fromUnits(spare) / GRANTS_IN_HAND)));
  paced = { at: Date.now(), grant };
  return grant;
}

/**
 * Gives a new device key something to try the app with, and says how much. A local chain mints
 * it. On a public testnet the operator sends a little of its own; there USDC also pays the
 * network fees, so the one transfer is all a visitor needs.
 */
export async function fundVisitor(owner: Address): Promise<number> {
  if (isLocalChain) {
    const test = createTestClient({ chain, transport, mode: "anvil" });
    await test.setBalance({ address: owner, value: parseEther("10") });
    await mined(await signers().venue.writeContract({ address: usdcAddress, abi: usdcAbi, functionName: "mint", args: [owner, toUnits(LOCAL_GRANT_USD)] }));
    return LOCAL_GRANT_USD;
  }

  const operator = signers().venue.account.address;
  const usdc = { address: usdcAddress, abi: usdcAbi, functionName: "balanceOf" } as const;
  const [held, vault, spare] = await Promise.all([
    publicClient.readContract({ ...usdc, args: [owner] }),
    publicClient.readContract({ ...mandate, functionName: "balanceOf", args: [owner] }),
    publicClient.readContract({ ...usdc, args: [operator] }),
  ]);
  const grant = await visitorGrant();
  if (fromUnits(held + vault) >= grant / 2) throw new Error("This device already has its test dollars.");

  const hourAgo = Date.now() - 3_600_000;
  while (granted.length && granted[0] < hourAgo) granted.shift();
  if (fromUnits(spare) < grant + OPERATOR_RESERVE_USD || granted.length >= GRANTS_PER_HOUR) {
    throw new Error(`The demo’s test dollars have run out for now. Send ${chain.name} USDC to ${owner} from faucet.circle.com, then come back.`);
  }
  granted.push(Date.now());
  await mined(await signers().venue.writeContract({ address: usdcAddress, abi: usdcAbi, functionName: "transfer", args: [owner, toUnits(grant)] }));
  // The next visitor's grant is worked out from what is left now.
  paced = null;
  return grant;
}
