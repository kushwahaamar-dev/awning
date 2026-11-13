"use client";

import { explorerAddress, explorerTx } from "@/lib/chain/config";
import { cents, day, usd } from "@/lib/format";
import { REFUSAL } from "@/lib/words";
import type { BlockReason } from "@/lib/chain/config";
import { useAccount, type Cover } from "./account";

function state(cover: Cover): { label: string; tone: "live" | "good" | "quiet" | "bad" } {
  switch (cover.status) {
    case "opening":
      return { label: "Being placed", tone: "quiet" };
    case "open":
      return { label: `In force until ${day(cover.expiresAt)}`, tone: "live" };
    case "paid":
      return { label: `Paid ${cents(cover.payout ?? 0)}`, tone: "good" };
    case "refunded":
      return { label: `${cents(cover.payout ?? 0)} returned`, tone: "quiet" };
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
  const { pool, setup } = account;
  const poolPage = explorerAddress(setup.venue);

  return (
    <section className="mt-28">
      <h2 className="display display-lg">Your cover</h2>
      <ul className="mt-8 grid gap-4 lg:grid-cols-2">
        {account.covers.map((cover) => {
          const { label, tone } = state(cover);
          const receipt = cover.openTx && explorerTx(cover.openTx);
          return (
            <li key={cover.id} className="surface flex flex-col items-start gap-4 rounded-3xl p-6 shadow-[0_1.25rem_2rem_-1.25rem_rgb(8_11_46/0.6)]">
              <span className={`rounded-full px-3 py-1 text-sm font-bold ${TONES[tone]}`}>{label}</span>
              <div>
                <p className="text-xl leading-snug font-bold">
                  {usd(cover.maxPayout)} if {cover.plan.coverage.pays}
                </p>
                <p className="mt-1 text-mute">
                  {day(cover.plan.market.startsAt ?? cover.expiresAt)}, cost <span className="till">{cents(cover.premium)}</span>
                  {cover.status === "open" && <>. The {usd(cover.maxPayout)} is locked in the pool</>}
                  {receipt && (
                    <>
                      {" "}
                      (
                      <a href={receipt} target="_blank" rel="noreferrer" className="link">
                        receipt
                      </a>
                      )
                    </>
                  )}
                </p>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-12 grid gap-x-12 gap-y-6 rounded-[2rem] bg-ink p-8 sm:p-10 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <h3 className="display display-md">Where a payout comes from</h3>
          <p className="mt-3 text-haze">
            A pool of USDC in a contract on {setup.chainName}. It locks the whole payout when you buy, pays your vault when Gemini&rsquo;s market
            resolves your way, and covers its own risk by buying the same position on Gemini.{" "}
            {poolPage && (
              <a href={poolPage} target="_blank" rel="noreferrer" className="link text-cream">
                See the contract
              </a>
            )}
          </p>
        </div>
        <dl className="grid grid-cols-3 gap-x-6 self-end lg:col-span-7">
          {[
            { label: "In the pool", value: pool.assets },
            { label: "Locked behind cover", value: pool.locked },
            { label: "Free", value: pool.free },
          ].map(({ label, value }) => (
            <div key={label} className="border-t-2 border-cream/25 pt-3">
              <dt className="text-sm text-haze">{label}</dt>
              <dd className="till mt-1 text-[clamp(1.125rem,2.4vw,1.875rem)] font-bold text-sun">{usd(Math.round(value))}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
