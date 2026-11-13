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
  let filled = 0;
  let wanted = 0;
  for (const order of orders) {
    const resolvedYes = contractFor(order, market)?.resolvedYes;
    if (resolvedYes == null) return null;
    if ((order.side === "yes") === resolvedYes) winnings += order.filled;
    filled += order.filled;
    wanted += order.quantity;
  }
  const unspent = cents(premium * (1 - filled / wanted));
  const payout = cents(winnings + unspent);
  return { outcome: winnings > 0 ? "Paid" : unspent > 0 ? "Refunded" : "Expired", payout };
}
