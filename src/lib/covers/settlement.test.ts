import { describe, expect, it } from "vitest";
import type { Order } from "../db/schema";
import fixture from "../gemini/__fixtures__/events.json";
import { toMarket } from "../gemini/market";
import { rawEventSchema } from "../gemini/schema";
import { settlement } from "./settlement";

// Albuquerque, 22 October: the high came in at 80°F or above.
const settled = toMarket(rawEventSchema.parse(fixture.settled[0]));
const live = toMarket(rawEventSchema.parse(fixture.active[0]));
const symbol = (label: string) => settled.contracts.find((c) => c.label === label)!.symbol;

const order = (label: string, side: Order["side"], price: number, filled: number, quantity = 100): Order => ({
  symbol: symbol(label),
  side,
  price,
  quantity,
  id: "test",
  filled,
});

describe("settlement", () => {
  it("pays $1 per contract on the bucket that came in", () => {
    const orders = [order("78°F to 79°F", "yes", 0.2, 100), order("80°F or above", "yes", 0.3, 100)];
    expect(settlement(orders, 51, settled)).toEqual({ outcome: "Paid", payout: 100 });
  });

  it("pays nothing when the user's side lost", () => {
    const orders = [order("69°F or below", "yes", 0.05, 100)];
    expect(settlement(orders, 5.2, settled)).toEqual({ outcome: "Expired", payout: 0 });
  });

  it("pays a No when the contract resolved No", () => {
    expect(settlement([order("70°F to 71°F", "no", 0.9, 100)], 91, settled)).toEqual({ outcome: "Paid", payout: 100 });
    expect(settlement([order("80°F or above", "no", 0.4, 100)], 41, settled)).toEqual({ outcome: "Expired", payout: 0 });
  });

  it("returns the whole premium when a resting order never filled", () => {
    expect(settlement([order("80°F or above", "yes", 0.3, 0)], 30.5, settled)).toEqual({ outcome: "Refunded", payout: 30.5 });
  });

  it("returns the dollars that went unspent when only the cheap leg filled and it lost", () => {
    // $5 of a $15 basket was spent, so two thirds of the $15.40 premium comes back
    const orders = [order("69°F or below", "yes", 0.05, 100), order("70°F to 71°F", "yes", 0.1, 0)];
    expect(settlement(orders, 15.4, settled)).toEqual({ outcome: "Refunded", payout: 10.27 });
  });

  // The mandate allows a Paid close up to maxPayout + premium for exactly this case.
  it("adds unspent premium to the winnings when the winning leg filled and another didn't", () => {
    const orders = [order("78°F to 79°F", "yes", 0.2, 0), order("80°F or above", "yes", 0.3, 100)];
    const result = settlement(orders, 51, settled)!;
    // $30 of a $50 basket was spent: 40% of the premium returns alongside the $100 won
    expect(result).toEqual({ outcome: "Paid", payout: 120.4 });
  });

  it("waits while any leg is unresolved", () => {
    const open: Order = { symbol: live.contracts[0].symbol, side: "yes", price: 0.4, quantity: 100, id: "test", filled: 100 };
    expect(settlement([open], 41, live)).toBeNull();
  });
});
