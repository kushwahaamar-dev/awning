import type { Contract, Market } from "../gemini/market";
import { assessBasis, type Basis } from "./basis";
import type { Exposure } from "./exposure";
import { buildCoverage, type Coverage } from "./legs";
import { findMarket, type MarketSource } from "./match";
import { quoteCover, type Quote } from "./quote";

export type MarketRow = Pick<Contract, "symbol" | "label" | "outcome" | "yesBid" | "yesAsk" | "last">;

export type CoverPlan = {
  exposure: Exposure;
  market: Pick<Market, "ticker" | "title" | "category" | "subject" | "unit" | "expiresAt" | "startsAt"> & {
    structure?: Market["structure"];
    volume24h?: number;
    contracts?: MarketRow[];
  };
  coverage: Coverage;
  quote: Quote;
  basis: Basis;
  /** An independent estimate of the odds from the 31-run weather ensemble, with what the agent paid for it over x402. */
  forecast: { odds: number; members: number; model: string; paid: number; probability?: Record<string, number> } | null;
};

/** Per-contract Yes probabilities for a market, with what they cost to obtain. */
export type FairValue = { probability: Record<string, number>; members: number; model: string; paid: number };

const orderOf = (c: MarketRow) => (c.outcome.kind === "range" ? (c.outcome.lo ?? (c.outcome.hi !== null ? c.outcome.hi - 1e6 : 0)) : 0);

/** Returns null when Gemini lists nothing that settles on the user's risk. */
export async function planCover(
  exposure: Exposure,
  list: MarketSource,
  options: { coverRatio?: number; fairValue?: (market: Market) => Promise<FairValue | null> } = {},
): Promise<{ plan: CoverPlan; market: Market } | null> {
  const market = await findMarket(exposure, list);
  const coverage = market && buildCoverage(market, exposure.trigger);
  if (!market || !coverage || coverage.legs.length === 0) return null;

  const fairValue = (await options.fairValue?.(market)) ?? null;
  const fair = coverage.legs.map((leg) => {
    const yes = fairValue?.probability[leg.symbol];
    return yes === undefined ? null : leg.side === "yes" ? yes : 1 - yes;
  });
  const priced = fairValue !== null && fair.every((p) => p !== null);

  const { ticker, title, category, subject, unit, expiresAt, startsAt, structure, volume24h } = market;
  const contracts: MarketRow[] = market.contracts
    .map(({ symbol, label, outcome, yesBid, yesAsk, last }) => ({ symbol, label, outcome, yesBid, yesAsk, last }))
    .sort((a, b) => orderOf(a) - orderOf(b));
  const plan = {
    exposure,
    market: { ticker, title, category, subject, unit, expiresAt, startsAt, structure, volume24h, contracts },
    coverage,
    quote: quoteCover(coverage, exposure.lossUsd, options.coverRatio, fair),
    basis: assessBasis(exposure, market, coverage),
    forecast: priced
      ? {
          odds: fair.reduce<number>((sum, p) => sum + p!, 0),
          members: fairValue.members,
          model: fairValue.model,
          paid: fairValue.paid,
          probability: fairValue.probability,
        }
      : null,
  };
  return { plan, market };
}
