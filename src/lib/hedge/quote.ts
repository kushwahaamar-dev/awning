import type { Coverage, Leg } from "./legs";

// Gemini charges per contract: rate × price × (1 − price). These rates come from a
// third-party summary of the schedule, so quotes label fees as estimates.
export const FEE_RATE = { taker: 0.07, maker: 0.0175 } as const;

export type Pricing = {
  /** Limit price per leg, in the same order as the coverage legs. */
  prices: number[];
  premium: number;
  fees: number;
  total: number;
};

export type Quote = {
  /** Contracts bought on each leg. Every contract pays $1 if its leg resolves in the user's favour. */
  contracts: number;
  payout: number;
  /** Buying from whoever is offering right now. Null when a leg has no offer or only takes resting orders. */
  now: Pricing | null;
  /** Leaving a limit order on the book: cheaper, but it may not fill. */
  resting: Pricing | null;
  /** The market's own estimate of how likely the cover is to pay. */
  marketOdds: number | null;
};

const cents = (n: number) => Math.round(n * 100) / 100;
const toTick = (price: number, tick: number) => Math.floor(price / tick + 1e-9) * tick;

function restingPrice(leg: Leg, fair: number | null): number | null {
  const mid = leg.bid !== null && leg.ask !== null ? (leg.bid + leg.ask) / 2 : null;
  // A forecast can talk the bid down but never up: paying above the middle of the book on a model's say-so isn't prudent.
  const anchor = mid !== null && fair !== null ? Math.min(mid, fair) : (fair ?? mid);
  const target = anchor ?? leg.bid ?? (leg.ask !== null ? leg.ask - leg.tick : null);
  if (target === null) return null;

  // Stay one tick inside the offer so the order rests; at the minimum tick there is no room, so meet it.
  const ceiling = leg.ask !== null ? Math.max(leg.tick, leg.ask - leg.tick) : 1 - leg.tick;
  const floor = leg.bid ?? leg.tick;
  const price = toTick(Math.min(Math.max(target, floor), ceiling), leg.tick);
  return price >= leg.tick ? cents(price) : null;
}

function price(prices: number[], contracts: number, rate: number): Pricing {
  const premium = cents(contracts * prices.reduce((sum, p) => sum + p, 0));
  const fees = cents(contracts * rate * prices.reduce((sum, p) => sum + p * (1 - p), 0));
  return { prices, premium, fees, total: cents(premium + fees) };
}

const all = <T>(values: (T | null)[]): T[] | null => (values.every((v) => v !== null) ? (values as T[]) : null);

/**
 * @param coverRatio share of the loss to cover, 0–1
 * @param fair optional fair price per leg (from forecast data), used to place the resting order
 */
export function quoteCover(coverage: Coverage, lossUsd: number, coverRatio = 1, fair: (number | null)[] = []): Quote {
  const contracts = cents(lossUsd * coverRatio);
  const { legs } = coverage;

  const asks = legs.some((l) => l.postOnly) ? null : all(legs.map((l) => l.ask));
  const limits = all(legs.map((l, i) => restingPrice(l, fair[i] ?? null)));
  const mids = all(legs.map((l) => (l.bid !== null && l.ask !== null ? (l.bid + l.ask) / 2 : (l.ask ?? l.bid))));

  return {
    contracts,
    payout: contracts,
    now: asks && price(asks, contracts, FEE_RATE.taker),
    resting: limits && price(limits, contracts, FEE_RATE.maker),
    marketOdds: mids && Math.min(1, cents(mids.reduce((sum, m) => sum + m, 0))),
  };
}
