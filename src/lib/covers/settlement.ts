import type { Order } from "../db/schema";
import type { Market } from "../gemini/market";
import { contractFor } from "../venue";

/**
 * Whether the event the cover is written on happened, once Gemini has resolved every contract in it.
 * A cover is a set of contract sides and pays if any one of them came in. Returns null while any is
 * still unresolved.
 */
export function resolution(orders: Order[], market: Market): "happened" | "missed" | null {
  let happened = false;
  for (const order of orders) {
    const resolvedYes = contractFor(order, market)?.resolvedYes;
    if (resolvedYes == null) return null;
    if ((order.side === "yes") === resolvedYes) happened = true;
  }
  return happened ? "happened" : "missed";
}
