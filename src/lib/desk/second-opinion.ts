import type { Address } from "viem";
import type { Market } from "../gemini/market";
import { agentAddress, readAllowance } from "../chain/server";
import type { BucketForecast } from "./forecast";
import { buy } from "./x402";

export type SecondOpinion = { forecast: BucketForecast; paid: number; txHash: string };

const KEEP_MS = 15 * 60 * 1000;
const bought = new Map<string, { at: number; opinion: SecondOpinion | null }>();

/**
 * Has the agent buy a forecast for a temperature market out of the owner's data allowance.
 * One purchase is reused for a quarter of an hour, so adjusting a quote doesn't pay again.
 * Returns null when there is nothing to buy or the allowance won't cover it; a quote works without it.
 */
export async function secondOpinion(owner: Address, market: Market, origin: string): Promise<SecondOpinion | null> {
  if (market.subject.family !== "temperature") return null;

  const key = `${owner.toLowerCase()}:${market.ticker}`;
  const recent = bought.get(key);
  if (recent && Date.now() - recent.at < KEEP_MS) return recent.opinion;

  const allowance = await readAllowance(owner);
  if (allowance.agent.toLowerCase() !== agentAddress().toLowerCase() || allowance.dataLeftToday <= 0) return null;

  const deskUrl = process.env.AWNING_DESK_URL ?? origin;
  // The allowance is drawn before the desk delivers, so a failure is remembered too: a desk that is
  // down costs the owner one request, not one per quote.
  bought.set(key, { at: Date.now(), opinion: null });
  const purchase = await buy<BucketForecast>(owner, `${deskUrl}/api/desk/forecast?ticker=${encodeURIComponent(market.ticker)}`);
  if (!purchase.ok) return null;

  const opinion = { forecast: purchase.data, paid: purchase.paid, txHash: purchase.txHash };
  bought.set(key, { at: Date.now(), opinion });
  return opinion;
}
