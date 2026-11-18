"use client";

import { createPublicClient, createWalletClient, http, pad, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { sessionMessage } from "../api/session-message";
import { awningMandateAbi, usdcAbi } from "./abi";
import { FORWARD_HOOK, STANDARD_FINALITY, TOKEN_MESSENGER, tokenMessengerAbi } from "./cctp";
import { PATIENT, chain, hedgeApprovalDomain, hedgeApprovalTypes, mandateAddress, rpcUrl, toUnits, usdcAddress } from "./config";

const STORAGE_KEY = "awning.deviceKey";

/**
 * The owner's key lives on their device and never reaches the server, which is what keeps
 * "the owner approved this" meaningful when the agent's key is the one assumed compromised.
 * A browser-stored key is a stand-in for a passkey smart account; the mandate accepts either.
 */
function deviceAccount() {
  let key = localStorage.getItem(STORAGE_KEY) as Hex | null;
  if (!key) {
    key = generatePrivateKey();
    localStorage.setItem(STORAGE_KEY, key);
  }
  return privateKeyToAccount(key);
}

export const deviceAddress = (): Address => deviceAccount().address;

const SESSION_KEY = "awning.session";
const SESSION_SECONDS = 12 * 3600;

/** Proof for the server that requests come from this device's owner. Signed once, reused until it nears expiry. */
export async function sessionToken(): Promise<string> {
  const saved = localStorage.getItem(SESSION_KEY);
  const account = deviceAccount();
  if (saved) {
    const { owner, expires } = JSON.parse(atob(saved));
    if (owner === account.address && expires > Date.now() / 1000 + 60) return saved;
  }
  const expires = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const signature = await account.signMessage({ message: sessionMessage(account.address, expires) });
  const token = btoa(JSON.stringify({ owner: account.address, expires, signature }));
  localStorage.setItem(SESSION_KEY, token);
  return token;
}

const transport = http(rpcUrl, PATIENT);
const reader = createPublicClient({ chain, transport });
const wallet = () => createWalletClient({ account: deviceAccount(), chain, transport });

async function send(request: Parameters<ReturnType<typeof wallet>["writeContract"]>[0]) {
  const hash = await wallet().writeContract(request);
  const receipt = await reader.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("The transaction was reverted.");
  return hash;
}

export type AllowanceSettings = {
  agent: Address;
  venue: Address;
  deposit: number;
  dailyDataCap: number;
  perCoverCap: number;
  monthlyCap: number;
  approvalThreshold: number;
};

const NINETY_DAYS = 90 * 24 * 3600;

/** Funds the vault and sets what the agent may do with it. */
export async function setAllowance(s: AllowanceSettings, onStep: (label: string) => void) {
  const mandate = { address: mandateAddress, abi: awningMandateAbi } as const;
  const account = deviceAccount();
  const base = { account, chain } as const;

  if (s.deposit > 0) {
    onStep("Moving funds into your vault…");
    await send({ ...base, address: usdcAddress, abi: usdcAbi, functionName: "approve", args: [mandateAddress, toUnits(s.deposit)] });
    await send({ ...base, ...mandate, functionName: "deposit", args: [toUnits(s.deposit)] });
  }
  onStep("Setting your agent’s limits…");
  await send({
    ...base,
    ...mandate,
    functionName: "setPolicy",
    args: [
      s.agent,
      BigInt(Math.floor(Date.now() / 1000) + NINETY_DAYS),
      toUnits(s.dailyDataCap),
      toUnits(s.perCoverCap),
      toUnits(s.monthlyCap),
      toUnits(s.approvalThreshold),
    ],
  });
  onStep("Naming where premiums may go…");
  await send({ ...base, ...mandate, functionName: "setVenue", args: [s.venue, true] });
}

export async function setPaused(paused: boolean) {
  await send({ account: deviceAccount(), chain, address: mandateAddress, abi: awningMandateAbi, functionName: "setPaused", args: [paused] });
}

/**
 * Takes money out of the vault and sends it to an address on another chain through Circle's CCTP.
 * Circle delivers it and takes its fee out of the amount, so nothing is needed on the other chain.
 * Returns the burn transaction, which is what Circle's delivery is looked up by.
 */
export async function cashOut(amount: number, to: { domain: number; address: Address }, fee: number, onStep: (label: string) => void): Promise<Hex> {
  const base = { account: deviceAccount(), chain } as const;
  const units = toUnits(amount);

  onStep("Taking it out of your vault…");
  await send({ ...base, address: mandateAddress, abi: awningMandateAbi, functionName: "withdraw", args: [units] });
  onStep("Handing it to Circle…");
  await send({ ...base, address: usdcAddress, abi: usdcAbi, functionName: "approve", args: [TOKEN_MESSENGER, units] });
  return send({
    ...base,
    address: TOKEN_MESSENGER,
    abi: tokenMessengerAbi,
    functionName: "depositForBurnWithHook",
    // An empty destination caller lets Circle's forwarder submit the mint.
    args: [units, to.domain, pad(to.address), usdcAddress, pad("0x", { size: 32 }), toUnits(fee), STANDARD_FINALITY, FORWARD_HOOK],
  });
}

export type ApprovalRequest = { id: Hex; venue: Address; premium: number; maxPayout: number; marketRef: Hex; deadline: number };

/** Signs the exact terms of one cover. The mandate checks this signature before paying a large premium. */
export function signApproval(terms: ApprovalRequest): Promise<Hex> {
  return deviceAccount().signTypedData({
    domain: hedgeApprovalDomain,
    types: hedgeApprovalTypes,
    primaryType: "HedgeApproval",
    message: {
      hedgeId: terms.id,
      venue: terms.venue,
      premium: toUnits(terms.premium),
      maxPayout: toUnits(terms.maxPayout),
      marketRef: terms.marketRef,
      deadline: BigInt(terms.deadline),
    },
  });
}

export async function walletBalance(): Promise<number> {
  const units = await reader.readContract({ address: usdcAddress, abi: usdcAbi, functionName: "balanceOf", args: [deviceAddress()] });
  return Number(units) / 1e6;
}
