"use client";

import { cents, day, usd } from "@/lib/format";
import { REFUSAL } from "@/lib/words";
import type { BlockReason } from "@/lib/chain/config";
import { useAccount, type Cover } from "./account";

function state(cover: Cover): { label: string; tone: "live" | "good" | "quiet" | "bad" } {
  const filled = cover.orders.every((o) => o.filled >= o.quantity);
  switch (cover.status) {
    case "opening":
      return { label: "Being placed", tone: "quiet" };
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

const TONES = { live: "bg-cobalt text-cream", good: "bg-sun text-ink", quiet: "bg-tint text-ink", bad: "bg-persimmon text-ink" };

export function Covers() {
  const { account } = useAccount();
  if (!account || account.covers.length === 0) return null;

  return (
    <section className="mt-28">
      <h2 className="display display-lg">Your cover</h2>
      <ul className="mt-8 grid gap-4 lg:grid-cols-2">
        {account.covers.map((cover) => {
          const { label, tone } = state(cover);
          return (
            <li key={cover.id} className="surface flex flex-col items-start gap-4 rounded-3xl p-6 shadow-[0_1.25rem_2rem_-1.25rem_rgb(8_11_46/0.6)]">
              <span className={`rounded-full px-3 py-1 text-sm font-bold ${TONES[tone]}`}>{label}</span>
              <div>
                <p className="text-xl leading-snug font-bold">
                  {usd(cover.maxPayout)} if {cover.plan.coverage.pays}
                </p>
                <p className="mt-1 text-mute">
                  {day(cover.plan.market.startsAt ?? cover.expiresAt)}, cost <span className="till">{cents(cover.premium)}</span>
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
