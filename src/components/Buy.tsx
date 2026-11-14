"use client";

import { useState } from "react";
import type { BlockReason } from "@/lib/chain/config";
import { signApproval } from "@/lib/chain/device";
import type { CoverTerms } from "@/lib/covers/service";
import { cents, usd } from "@/lib/format";
import { offerPrice } from "@/lib/hedge/quote";
import type { CoverPlan } from "@/lib/hedge/plan";
import { REFUSAL } from "@/lib/words";
import { AllowanceForm, fundAndSetUp } from "./AllowanceForm";
import type { Purchase } from "./Bought";
import { Lock } from "./icons";
import { Standing } from "./Standing";
import { hasAllowance, post, useAccount } from "./account";

type Opened = { status: "open"; txHash: string } | { status: "blocked"; reason: BlockReason; txHash: string };
type Props = { plan: CoverPlan; coverRatio: number; onBought: (receipt: Omit<Purchase, "plan">) => void };

/** The buy button, the first-time setup, the approval step for large premiums, and what the mandate said. */
export function Buy({ plan, coverRatio, onBought }: Props) {
  const { owner, account, refresh } = useAccount();
  const [step, setStep] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [pending, setPending] = useState<CoverTerms | null>(null);
  const [refused, setRefused] = useState<BlockReason | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { quote } = plan;
  const price = offerPrice(quote)?.pricing ?? null;
  const busy = step !== null;

  if (!owner || !account || !price) return null;
  const { setup, allowance } = account;

  async function run(first: string, work: () => Promise<void>) {
    setStep(first);
    setError(null);
    setRefused(null);
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStep(null);
    }
  }

  async function open(terms: CoverTerms, signature: string | null) {
    const result = await post<Opened>(`/api/covers/${terms.id}/open`, { deadline: terms.deadline, signature });
    await refresh();
    setPending(null);
    if (result.status === "blocked") setRefused(result.reason);
    else onBought({ premium: terms.premium, payout: terms.maxPayout, txHash: result.txHash });
  }

  async function buy() {
    // Asking for terms has the pool lock the payout, so the money is there before any premium moves.
    const terms = await post<CoverTerms>("/api/covers/quote", { owner, exposure: plan.exposure, coverRatio });
    // Within the allowance the agent just acts. Above the owner's line it has to come back and ask.
    if (terms.needsApproval) setPending(terms);
    else await open(terms, null);
  }

  const start = () => run("Locking your payout…", buy);
  const approve = () =>
    run("Placing cover…", async () => {
      if (pending) await open(pending, await signApproval(pending));
    });
  // A first purchase: test dollars, a vault, limits to fit, and then the cover, without leaving the quote.
  const setUpAndBuy = () =>
    run("Setting up your agent…", async () => {
      await fundAndSetUp(owner!, setup, price.total, setStep);
      await refresh();
      setStep("Locking your payout…");
      await buy();
    });

  const problems = (
    <>
      {refused && (
        <p role="alert" className="note note-bad mt-4 text-sm">
          <span className="font-[510] text-fg">Your allowance refused this.</span> The agent asked for the premium, but {REFUSAL[refused]}. Nothing
          was spent.
        </p>
      )}
      {error && (
        <p role="alert" className="note note-bad mt-4 text-sm break-words">
          {error}
        </p>
      )}
    </>
  );

  if (pending) {
    return (
      <div className="mt-6 border-t border-line pt-5">
        <p className="font-[510]">
          {cents(pending.premium)} is above your {usd(allowance.approvalThreshold)} line, so the agent needs your go-ahead.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <button type="button" onClick={approve} disabled={busy} className="btn btn-lg btn-primary">
            {step ?? `Approve ${cents(pending.premium)}`}
          </button>
          <button type="button" onClick={() => setPending(null)} disabled={busy} className="link">
            Not now
          </button>
        </div>
        {problems}
      </div>
    );
  }

  if (!hasAllowance(account)) {
    if (choosing) {
      return (
        <div className="mt-6 border-t border-line pt-5">
          <p className="mb-5 font-[510]">Set your agent&rsquo;s limits, then buy.</p>
          <AllowanceForm />
        </div>
      );
    }
    return (
      <div className="mt-5">
        <button type="button" onClick={setUpAndBuy} disabled={busy} className="btn btn-lg btn-primary w-full">
          {step ?? `Buy cover for ${cents(price.total)}`}
        </button>
        <p className="mt-3 text-xs text-muted">
          Your first purchase also sets up your agent: test dollars in a vault on {setup.chainName}, and spending limits it can&rsquo;t break.{" "}
          <button type="button" onClick={() => setChoosing(true)} disabled={busy} className="link">
            Choose the limits yourself
          </button>
        </p>
        {problems}
      </div>
    );
  }

  const overLimit = price.total > allowance.perCoverCap;
  return (
    <div className="mt-5">
      {overLimit && (
        <p className="note mb-4 text-sm">
          This is over your {usd(allowance.perCoverCap)} limit for one cover and will be refused. Cover less, or raise the limit under Your agent.
        </p>
      )}
      <button type="button" onClick={start} disabled={busy} className="btn btn-lg btn-primary w-full">
        {step ?? `Buy cover for ${cents(price.total)}`}
      </button>
      <p className="mt-3 flex gap-2 text-xs text-muted">
        <Lock className="mt-0.5 size-3.5 flex-none text-accent" />
        <span>
          The pool locks your {usd(quote.payout)} on {setup.chainName} before your premium moves.
        </span>
      </p>
      {problems}
      <Standing plan={plan} coverRatio={coverRatio} price={price.total} />
    </div>
  );
}
