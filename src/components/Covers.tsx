"use client";

import { cents, day, usd } from "@/lib/format";
import { REFUSAL } from "@/lib/words";
import type { BlockReason } from "@/lib/chain/config";
import { useAccount, type Cover } from "./account";

function state(cover: Cover): { label: string; tone: "live" | "good" | "quiet" | "bad" } {
  const filled = cover.orders.every((o) => o.filled >= o.quantity);
  switch (cover.status) {
    case "open":
      return filled ? { label: `In force until ${day(cover.expiresAt)}`, tone: "live" } : { label: "Order waiting for a seller", tone: "quiet" };
    case "paid":
      return { label: `Paid ${cents(cover.payout ?? 0)}`, tone: "good" };
    case "refunded":
      return { label: `Not filled, ${cents(cover.payout ?? 0)} returned`, tone: "quiet" };
    case "expired":
      return { label: "Ended, it didn't happen", tone: "quiet" };
    case "blocked":
      return { label: `Refused: ${REFUSAL[cover.note as BlockReason] ?? cover.note}`, tone: "bad" };
    default:
      return { label: cover.status, tone: "quiet" };
  }
}

const TONES = { live: "bg-awning text-paper", good: "bg-marigold text-ink", quiet: "bg-rule text-ink", bad: "bg-brick text-paper" };

export function Covers() {
  const { account } = useAccount();
  if (!account || account.covers.length === 0) return null;

  return (
    <section className="mt-16">
      <h2 className="font-display text-3xl font-bold tracking-tight [font-stretch:85%]">Your cover</h2>
      <ul className="mt-4 divide-y divide-rule border-y border-rule">
        {account.covers.map((cover) => {
          const { label, tone } = state(cover);
          return (
            <li key={cover.id} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-4">
              <div className="min-w-0">
                <p className="text-lg font-bold">
                  {usd(cover.maxPayout)} if {cover.plan.coverage.pays}
                </p>
                <p className="text-mute">
                  {day(cover.plan.market.startsAt ?? cover.expiresAt)}, cost {cents(cover.premium)}
                </p>
              </div>
              <span className={`rounded-sm px-2.5 py-1 text-sm font-bold ${TONES[tone]}`}>{label}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
