import type { Order } from "../db/schema";
import type { Market } from "../gemini/market";
import { contractFor } from "../venue";

const cents = (n: number) => Math.round(n * 100) / 100;

type Settlement = { outcome: "Paid" | "Expired" | "Refunded"; payout: number };

/**
 * What the venue owes the owner once every leg has resolved. A winning contract pays $1;
 * premium that never bought anything, because a resting order didn't fill, goes back.
 * Returns null while any leg is still unresolved.
 */
export function settlement(orders: Order[], premium: number, market: Market): Settlement | null {
  let winnings = 0;
  let spent = 0;
  let budget = 0;
  for (const order of orders) {
    const resolvedYes = contractFor(order, market)?.resolvedYes;
    if (resolvedYes == null) return null;
    if ((order.side === "yes") === resolvedYes) winnings += order.filled;
    spent += order.filled * order.price;
    budget += order.quantity * order.price;
  }
  // Legs in a basket are priced very differently, so the share left over is measured in dollars.
  const unspent = cents(premium * (1 - spent / budget));
  const payout = cents(winnings + unspent);
  return { outcome: winnings > 0 ? "Paid" : unspent > 0 ? "Refunded" : "Expired", payout };
}
