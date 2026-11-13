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

export function getVenue(): Venue {
  return paperVenue;
}
