"use client";

import { explorerTx } from "@/lib/chain/config";
import { cents, day, usd } from "@/lib/format";
import { REFUSAL } from "@/lib/words";
import type { BlockReason } from "@/lib/chain/config";
import { useAccount, type Cover } from "./account";
import { External } from "./icons";
import { Stamp } from "./Sketch";

function state(cover: Cover): { label: string; tone: "" | "status-accent" | "status-good" | "status-bad" } {
  switch (cover.status) {
    case "opening":
      return { label: "Being placed", tone: "" };
    case "open":
      return { label: `In force until ${day(cover.expiresAt)}`, tone: "status-accent" };
    case "paid":
      return { label: `Paid ${cents(cover.payout ?? 0)}`, tone: "status-good" };
    case "refunded":
      return { label: `${cents(cover.payout ?? 0)} returned`, tone: "" };
    case "expired":
      return { label: "Ended, it didn’t happen", tone: "" };
    case "blocked":
      return { label: `Refused: ${REFUSAL[cover.note as BlockReason] ?? cover.note}`, tone: "status-bad" };
    default:
      return { label: cover.status, tone: "" };
  }
}

/** Everything the owner has bought, newest first: what each pays, what it cost, and where it stands. */
export function Covers() {
  const { account } = useAccount();
  if (!account || account.covers.length === 0) return null;

  return (
    <section className="section">
      <h2 className="heading flex items-center gap-4">
        <Stamp of="price" />
        Your cover
      </h2>
      <ul className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {account.covers.map((cover) => {
          const { label, tone } = state(cover);
          const receipt = cover.openTx && explorerTx(cover.openTx);
          // The pool's own order on the exchange, when this cover's hedge could really be placed there.
          const hedge = cover.venue === "paper" ? undefined : cover.orders.find((order) => order.id);
          return (
            <li key={cover.id} className="panel flex flex-col overflow-hidden">
              {/* The awning is out over a cover that is in force, and in over one that has ended. */}
              {cover.status === "open" && <div aria-hidden className="valance" />}
              <div className="flex grow flex-col gap-y-3 px-5 py-4">
                <div>
                  <p className="title">
                    {usd(cover.maxPayout)} if {cover.plan.coverage.pays}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-4 text-sm text-muted">
                    <span>
                      {day(cover.plan.market.startsAt ?? cover.expiresAt)}, cost <span className="num text-fg">{cents(cover.premium)}</span>
                    </span>
                    {hedge && (
                      <span>
                        Hedged on {cover.venue === "gemini" ? "Gemini" : "Gemini’s sandbox"}, order <span className="num">{hedge.id}</span>
                      </span>
                    )}
                    {receipt && (
                      <a href={receipt} target="_blank" rel="noreferrer" className="link flex items-center gap-1">
                        receipt <External />
                      </a>
                    )}
                  </p>
                </div>
                <span className={`status mt-auto whitespace-normal ${tone}`}>{label}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
