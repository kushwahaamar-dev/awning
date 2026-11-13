"use client";

import { useState } from "react";
import type { BlockReason } from "@/lib/chain/config";
import { signApproval } from "@/lib/chain/device";
import type { CoverTerms } from "@/lib/covers/service";
import { cents, usd } from "@/lib/format";
import { offerPrice } from "@/lib/hedge/quote";
import type { CoverPlan } from "@/lib/hedge/plan";
import { REFUSAL } from "@/lib/words";
import { AllowanceForm } from "./AllowanceForm";
import { hasAllowance, post, useAccount } from "./account";

type Opened = { status: "open"; txHash: string } | { status: "blocked"; reason: BlockReason; txHash: string };

/** The buy button, the approval step for large premiums, and what the mandate said. */
export function Buy({ plan, coverRatio, onBought }: { plan: CoverPlan; coverRatio: number; onBought: () => void }) {
  const { owner, account, refresh } = useAccount();
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<CoverTerms | null>(null);
  const [refused, setRefused] = useState<BlockReason | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { quote } = plan;
  const price = offerPrice(quote)?.pricing ?? null;

  if (!owner || !account) return null;

  if (!hasAllowance(account)) {
    return (
      <div className="tear mt-6 pt-5">
        <p className="text-lg font-bold">Before Awning can buy this, give your agent an allowance.</p>
        <p className="mt-1 mb-5 text-mute">You set the limits. They are enforced by a contract, not by the agent.</p>
        <AllowanceForm />
      </div>
    );
  }

  async function open(terms: CoverTerms, signature: string | null) {
    const result = await post<Opened>(`/api/covers/${terms.id}/open`, { deadline: terms.deadline, signature });
    await refresh();
    setPending(null);
    if (result.status === "blocked") setRefused(result.reason);
    else onBought();
  }

  async function start() {
    setBusy(true);
    setError(null);
    setRefused(null);
    try {
      // Asking for terms has the pool lock the payout, so the money is there before any premium moves.
      const terms = await post<CoverTerms>("/api/covers/quote", { owner, exposure: plan.exposure, coverRatio });
      // Within the allowance the agent just acts. Above the owner's line it has to come back and ask.
      if (terms.needsApproval) setPending(terms);
      else await open(terms, null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      await open(pending, await signApproval(pending));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (pending) {
    return (
      <div className="tear mt-6 pt-5">
        <p className="text-lg font-bold">
          {cents(pending.premium)} is above your {usd(account.allowance.approvalThreshold)} line, so the agent needs your go-ahead.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <button type="button" onClick={approve} disabled={busy} className="btn btn-primary">
            {busy ? "Placing cover…" : `Approve ${cents(pending.premium)}`}
          </button>
          <button type="button" onClick={() => setPending(null)} disabled={busy} className="link">
            Not now
          </button>
        </div>
        {error && <p className="mt-3 text-brick">{error}</p>}
      </div>
    );
  }

  if (!price) return null;
  const overLimit = price.total > account.allowance.perCoverCap;

  return (
    <div className="tear mt-6 pt-5">
      {overLimit && (
        <p className="note mb-4">
          This costs more than the {usd(account.allowance.perCoverCap)} you allow for one cover, so your allowance will refuse it. Cover less of
          the loss, or raise the limit under Your agent.
        </p>
      )}
      <button type="button" onClick={start} disabled={busy} className="btn btn-primary w-full">
        {busy ? "Locking your payout…" : `Buy cover for ${cents(price.total)}`}
      </button>
      <p className="mt-3 text-sm text-mute">
        The pool holds {usd(account.pool.free)} that isn&rsquo;t promised to anyone. It locks your {usd(quote.payout)} in a contract on{" "}
        {account.setup.chainName} before your premium moves.
      </p>
      {refused && (
        <p className="note note-refused mt-4">
          <span className="font-bold">Your allowance refused this.</span> The agent asked for the premium, but {REFUSAL[refused]}. Nothing was spent.
        </p>
      )}
      {error && <p className="mt-3 text-brick">{error}</p>}
    </div>
  );
}
