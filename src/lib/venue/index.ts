import type { Order } from "../db/schema";
import type { Contract, Market } from "../gemini/market";

export type Venue = {
  name: string;
  place(orders: Order[], mode: "now" | "resting"): Promise<Order[]>;
  /** Brings fill quantities up to date for orders still waiting on the book. */
  refresh(orders: Order[], market: Market): Promise<Order[]>;
};

export function contractFor(order: Order, market: Market): Contract | undefined {
  return market.contracts.find((c) => c.symbol === order.symbol);
}

/** The price someone would have to pay right now for the order's side. */
function ask(order: Order, contract: Contract): number | null {
  if (order.side === "yes") return contract.yesAsk;
  return contract.yesBid === null ? null : Math.round((1 - contract.yesBid) * 100) / 100;
}

/**
 * Fills orders against Gemini's live public prices without sending them anywhere.
 * Used when no Gemini trading key is configured: the market, prices and settlement are real,
 * only the fill is assumed.
 */
export const paperVenue: Venue = {
  name: "paper",

  async place(orders, mode) {
    return orders.map((order) => ({
      ...order,
      id: `paper-${crypto.randomUUID()}`,
      filled: mode === "now" ? order.quantity : 0,
    }));
  },

  async refresh(orders, market) {
    return orders.map((order) => {
      if (order.filled >= order.quantity) return order;
      const contract = contractFor(order, market);
      const offered = contract && ask(order, contract);
      return offered != null && offered <= order.price ? { ...order, filled: order.quantity } : order;
    });
  },
};

const TRADING_URL = process.env.GEMINI_TRADING_URL ?? "https://api.sandbox.gemini.com";

/**
 * How the pool's own hedges are placed: on paper with no trading key, on Gemini's sandbox with a
 * sandbox key, or on the live exchange. The sandbox lists only part of what the live exchange
 * does (commodities and crypto, no weather or games), so there some hedges still stay on paper.
 */
export const hedging: "paper" | "sandbox" | "live" =
  !process.env.GEMINI_API_KEY || !process.env.GEMINI_API_SECRET ? "paper" : TRADING_URL.includes("sandbox") ? "sandbox" : "live";

/**
 * Where the hedge for one market can really be placed. An order for a contract the trading
 * exchange doesn't list can only fail, so that hedge is kept on paper and recorded as paper.
 */
export async function venueFor(ticker: string, symbols: string[]): Promise<Venue> {
  if (hedging === "paper") return paperVenue;
  const { geminiVenue, lists } = await import("./gemini");
  return (await lists(ticker, symbols)) ? geminiVenue : paperVenue;
}

/** The venue a cover's hedge was recorded against when it was quoted. */
export async function venueNamed(name: string): Promise<Venue> {
  return name === paperVenue.name || hedging === "paper" ? paperVenue : (await import("./gemini")).geminiVenue;
}
