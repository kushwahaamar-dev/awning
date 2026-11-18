"use client";

import Link from "next/link";
import { explorerTx } from "@/lib/chain/config";
import { cents, day, usd } from "@/lib/format";
import type { CoverPlan } from "@/lib/hedge/plan";
import { useAccount } from "./account";
import { External } from "./icons";
import { Sketch } from "./Sketch";

export type Purchase = { plan: CoverPlan; premium: number; payout: number; txHash: string };

/** The moment after buying: what the owner now holds, where the money is, and what happens next. */
export function Bought({ purchase, onAgain }: { purchase: Purchase; onAgain: () => void }) {
  const { account } = useAccount();
  const { plan, premium, payout, txHash } = purchase;
  const when = day(plan.market.startsAt ?? plan.market.expiresAt);
  const receipt = explorerTx(txHash);
  const steps = [
    { at: "Now", text: `${usd(payout)} is locked for you${account ? ` on ${account.setup.chainName}` : ""}.`, receipt },
    { at: when, text: "Gemini resolves the market.", receipt: null },
    { at: "After that", text: `If it happened, the ${usd(payout)} is in your vault. You don’t file anything.`, receipt: null },
  ];

  return (
    <section aria-labelledby="covered" aria-live="polite" className="pt-8 sm:pt-14">
      <Sketch of="paid" className="h-28" />
      <p className="status status-good mt-8">Paid {cents(premium)} from your agent&rsquo;s allowance</p>
      <h1 id="covered" className="sign mt-2">
        You&rsquo;re covered.
      </h1>
      <p className="lede mt-2">
        {usd(payout)} if {plan.coverage.pays} on {when}.
      </p>
      <ol className="rows mt-8 border-y border-line">
        {steps.map(({ at, text, receipt }) => (
          <li key={at} className="grid gap-x-8 gap-y-0.5 py-3 sm:grid-cols-[10rem_1fr]">
            <span className="num text-muted">{at}</span>
            <span>
              {text}{" "}
              {receipt && (
                <a href={receipt} target="_blank" rel="noreferrer" className="link inline-flex items-center gap-1 text-sm">
                  See the transaction <External />
                </a>
              )}
            </span>
          </li>
        ))}
      </ol>
      <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
        <button type="button" onClick={onAgain} className="btn btn-primary">
          Cover something else
        </button>
        <Link href="/agent" className="link">
          See what your agent did
        </Link>
      </div>
    </section>
  );
}
