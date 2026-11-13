import {
  createPublicClient,
  createTestClient,
  createWalletClient,
  http,
  maxUint256,
  nonceManager,
  parseEther,
  parseEventLogs,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { awningMandateAbi, usdcAbi } from "./abi";
import {
  BLOCK_REASONS,
  HEDGE_OUTCOME,
  chain,
  fromUnits,
  isLocalChain,
  mandateAddress,
  rpcUrl,
  toUnits,
  usdcAddress,
  type BlockReason,
  type HedgeOutcome,
} from "./config";

const transport = http(rpcUrl);
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
export const venueAddress = () => signers().venue.account.address;

const mandate = { address: mandateAddress, abi: awningMandateAbi } as const;

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

export async function closeHedge(hedgeId: Hex, result: HedgeOutcome, payoutUsd: number, evidence: Hex): Promise<Hex> {
  const { venue } = signers();
  const payout = toUnits(payoutUsd);
  if (payout > 0n) {
    const allowance = await publicClient.readContract({
      address: usdcAddress,
      abi: usdcAbi,
      functionName: "allowance",
      args: [venue.account.address, mandateAddress],
    });
    if (allowance < payout) {
      await mined(await venue.writeContract({ address: usdcAddress, abi: usdcAbi, functionName: "approve", args: [mandateAddress, maxUint256] }));
    }
  }
  const txHash = await venue.writeContract({ ...mandate, functionName: "closeHedge", args: [hedgeId, HEDGE_OUTCOME[result], payout, evidence] });
  await mined(txHash);
  return txHash;
}

const HEDGE_STATES = ["none", "open", "paid", "expired", "refunded"] as const;

/** What the contract itself says about a hedge, for when the database and the chain may disagree. */
export async function hedgeState(hedgeId: Hex): Promise<(typeof HEDGE_STATES)[number]> {
  const hedge = await publicClient.readContract({ ...mandate, functionName: "hedges", args: [hedgeId] });
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
};

export async function readAllowance(owner: Address): Promise<Allowance> {
  const [policy, balance, limits] = await Promise.all([
    publicClient.readContract({ ...mandate, functionName: "policies", args: [owner] }),
    publicClient.readContract({ ...mandate, functionName: "balanceOf", args: [owner] }),
    publicClient.readContract({ ...mandate, functionName: "limits", args: [owner] }),
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
  };
}

/** Local chains only: gives a fresh device key gas and test dollars, and keeps the venue able to pay out. */
export async function fundLocally(owner: Address, usd: number) {
  if (!isLocalChain) throw new Error("The built-in faucet only works on a local chain. On Arc testnet use faucet.circle.com.");
  const test = createTestClient({ chain, transport, mode: "anvil" });
  await test.setBalance({ address: owner, value: parseEther("10") });

  const { venue } = signers();
  for (const [to, amount] of [[owner, usd], [venue.account.address, 100_000]] as const) {
    await mined(await venue.writeContract({ address: usdcAddress, abi: usdcAbi, functionName: "mint", args: [to, toUnits(amount)] }));
  }
}
