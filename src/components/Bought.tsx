"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { explorerTx } from "@/lib/chain/config";
import { cents, day, usd } from "@/lib/format";
import type { CoverPlan } from "@/lib/hedge/plan";
import { useAccount } from "./account";
import { Ascii } from "./Ascii";
import { External } from "./icons";

export type Purchase = { plan: CoverPlan; premium: number; payout: number; txHash: string };

/** The moment after buying: what the owner now holds, where the money is, and what happens next. */
export function Bought({ purchase, onAgain }: { purchase: Purchase; onAgain: () => void }) {
  const { account } = useAccount();
  const { plan, premium, payout, txHash } = purchase;
  const when = day(plan.market.startsAt ?? plan.market.expiresAt);
  const receipt = explorerTx(txHash);
  const steps = [
    { at: "Now", text: `The pool has locked ${usd(payout)} for you${account ? ` on ${account.setup.chainName}` : ""}.`, receipt },
    { at: when, text: "Gemini resolves the market.", receipt: null },
    {
      at: "After that",
      text: `If ${plan.coverage.pays}, the ${usd(payout)} goes to your vault. If not, the lock is released. You don’t file anything.`,
      receipt: null,
    },
  ];

  return (
    <div className="grid items-center gap-x-16 gap-y-12 pt-14 sm:pt-20 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
      <section aria-labelledby="covered" aria-live="polite" className="rise">
        <p className="status status-good">Paid {cents(premium)} from your agent&rsquo;s allowance</p>
        <h1 id="covered" className="sign mt-4">
          You&rsquo;re covered.
        </h1>
        <p className="mt-4 max-w-2xl text-xl leading-snug text-muted">
          {usd(payout)} if {plan.coverage.pays} on {when}.
        </p>
        <ol className="rows mt-10 max-w-2xl border-y border-line">
          {steps.map(({ at, text, receipt }) => (
            <li key={at} className="grid gap-x-8 gap-y-1 py-4 sm:grid-cols-[9rem_1fr]">
              <span className="num text-sm text-muted sm:pt-0.5">{at}</span>
              <span className="text-soft">
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
          <button type="button" onClick={onAgain} className="btn btn-lg btn-primary">
            Cover something else
          </button>
          <Link href="/agent" className="link">
            See everything your agent did
          </Link>
        </div>
      </section>
      <div className="rise max-lg:hidden" style={{ "--i": 1 } as CSSProperties}>
        <Ascii scene="sunrise" label="The sun climbing over the sea" className="fade-soft" />
      </div>
    </div>
  );
}
