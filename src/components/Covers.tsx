"use client";

import { explorerAddress, explorerTx } from "@/lib/chain/config";
import { cents, day, usd } from "@/lib/format";
import { REFUSAL } from "@/lib/words";
import type { BlockReason } from "@/lib/chain/config";
import { useAccount, type Cover } from "./account";
import { External, Lock } from "./icons";

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
      return { label: "Ended, it didn't happen", tone: "" };
    case "blocked":
      return { label: `Refused: ${REFUSAL[cover.note as BlockReason] ?? cover.note}`, tone: "status-bad" };
    default:
      return { label: cover.status, tone: "" };
  }
}

export function Covers() {
  const { account } = useAccount();
  if (!account || account.covers.length === 0) return null;
  const { pool, setup } = account;
  const poolPage = explorerAddress(setup.venue);

  return (
    <section className="mt-28">
      <h2 className="heading">Your cover</h2>
      <ul className="rows panel mt-8">
        {account.covers.map((cover) => {
          const { label, tone } = state(cover);
          const receipt = cover.openTx && explorerTx(cover.openTx);
          // The pool's own order on the exchange, when this cover's hedge could really be placed there.
          const hedge = cover.venue === "paper" ? undefined : cover.orders.find((order) => order.id);
          return (
            <li key={cover.id} className="grid gap-x-6 gap-y-2 px-5 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
              <div>
                <p className="font-[510]">
                  {usd(cover.maxPayout)} if {cover.plan.coverage.pays}
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-sm text-muted">
                  <span>
                    {day(cover.plan.market.startsAt ?? cover.expiresAt)}, cost <span className="num text-soft">{cents(cover.premium)}</span>
                  </span>
                  {cover.status === "open" && (
                    <span className="flex items-center gap-1.5 text-accent">
                      <Lock />
                      The {usd(cover.maxPayout)} is locked in the pool
                    </span>
                  )}
                  {receipt && (
                    <a href={receipt} target="_blank" rel="noreferrer" className="link flex items-center gap-1">
                      receipt <External />
                    </a>
                  )}
                </p>
                {hedge && (
                  <p className="mt-1 text-sm text-muted">
                    Hedged on {cover.venue === "gemini" ? "Gemini" : "Gemini’s sandbox"}, order <span className="num text-soft">{hedge.id}</span>
                  </p>
                )}
              </div>
              <span className={`status justify-self-start ${tone}`}>{label}</span>
            </li>
          );
        })}
      </ul>

      <div className="mt-16 grid gap-x-16 gap-y-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:items-end">
        <div>
          <h3 className="title">Where a payout comes from</h3>
          <p className="mt-2 text-muted">
            A USDC pool in a contract on {setup.chainName}. It locks the full payout when you buy and pays your vault when Gemini resolves the
            market.{" "}
            {poolPage && (
              <a href={poolPage} target="_blank" rel="noreferrer" className="link">
                See the contract
              </a>
            )}
          </p>
        </div>
        <dl className="grid grid-cols-3 divide-x divide-line border-y border-line">
          {[
            { label: "In the pool", value: pool.assets },
            { label: "Locked behind cover", value: pool.locked },
            { label: "Free", value: pool.free },
          ].map(({ label, value }) => (
            <div key={label} className="px-5 py-5 first:pl-0">
              <dt className="text-xs text-muted">{label}</dt>
              <dd className="figure mt-2 text-[clamp(1.25rem,2.4vw,1.75rem)]">{usd(Math.round(value))}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
