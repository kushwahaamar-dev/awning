import type { Market } from "../gemini/market";
import { assessBasis, type Basis } from "./basis";
import type { Exposure } from "./exposure";
import { buildCoverage, type Coverage } from "./legs";
import { findMarket, type MarketSource } from "./match";
import { quoteCover, type Quote } from "./quote";

export type CoverPlan = {
  exposure: Exposure;
  market: Pick<Market, "ticker" | "title" | "category" | "subject" | "unit" | "expiresAt" | "startsAt">;
  coverage: Coverage;
  quote: Quote;
  basis: Basis;
};

/** Returns null when Gemini lists nothing that settles on the user's risk. */
export async function planCover(
  exposure: Exposure,
  list: MarketSource,
  options: { coverRatio?: number; fair?: (number | null)[] } = {},
): Promise<{ plan: CoverPlan; market: Market } | null> {
  const market = await findMarket(exposure, list);
  const coverage = market && buildCoverage(market, exposure.trigger);
  if (!market || !coverage || coverage.legs.length === 0) return null;

  const { ticker, title, category, subject, unit, expiresAt, startsAt } = market;
  const plan = {
    exposure,
    market: { ticker, title, category, subject, unit, expiresAt, startsAt },
    coverage,
    quote: quoteCover(coverage, exposure.lossUsd, options.coverRatio, options.fair),
    basis: assessBasis(exposure, market, coverage),
  };
  return { plan, market };
}
