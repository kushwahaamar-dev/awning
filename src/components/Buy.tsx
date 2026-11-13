"use client";

import { useState } from "react";
import type { BlockReason } from "@/lib/chain/config";
import { signApproval } from "@/lib/chain/device";
import type { CoverTerms } from "@/lib/covers/service";
import { cents, usd } from "@/lib/format";
import type { CoverPlan } from "@/lib/hedge/plan";
import { REFUSAL } from "@/lib/words";
import { AllowanceForm } from "./AllowanceForm";
import { hasAllowance, post, useAccount } from "./account";

type Opened = { status: "open"; txHash: string } | { status: "blocked"; reason: BlockReason; txHash: string };
type Mode = "now" | "resting";

/** The two ways to buy, the approval step for large premiums, and what the mandate said. */
export function Buy({ plan, coverRatio, onBought }: { plan: CoverPlan; coverRatio: number; onBought: () => void }) {
  const { owner, account, refresh } = useAccount();
  const [busy, setBusy] = useState<Mode | null>(null);
  const [pending, setPending] = useState<CoverTerms | null>(null);
  const [refused, setRefused] = useState<BlockReason | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { quote } = plan;

  if (!owner || !account) return null;

  if (!hasAllowance(account)) {
    return (
      <div className="mt-6 border-t-2 border-dashed border-rule pt-5">
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

  async function start(mode: Mode) {
    setBusy(mode);
    setError(null);
    setRefused(null);
    try {
      const terms = await post<CoverTerms>("/api/covers/quote", { owner, exposure: plan.exposure, coverRatio, mode });
      // Within the allowance the agent just acts. Above the owner's line it has to come back and ask.
      if (terms.needsApproval) setPending(terms);
      else await open(terms, null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function approve() {
    if (!pending) return;
    setBusy("now");
    setError(null);
    try {
      await open(pending, await signApproval(pending));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  if (pending) {
    return (
      <div className="mt-6 border-t-2 border-dashed border-rule pt-5">
        <p className="text-lg font-bold">
          {cents(pending.premium)} is above your {usd(account.allowance.approvalThreshold)} line, so the agent needs your go-ahead.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <button type="button" onClick={approve} disabled={busy !== null} className="rounded-sm bg-awning px-6 py-3 text-lg font-bold text-paper disabled:opacity-50">
            {busy ? "Placing cover…" : `Approve ${cents(pending.premium)}`}
          </button>
          <button type="button" onClick={() => setPending(null)} disabled={busy !== null} className="underline underline-offset-4">
            Not now
          </button>
        </div>
        {error && <p className="mt-3 text-brick">{error}</p>}
      </div>
    );
  }

  const cheapest = Math.min(quote.resting?.total ?? Infinity, quote.now?.total ?? Infinity);
  const overLimit = cheapest > account.allowance.perCoverCap;

  return (
    <div className="mt-6 border-t-2 border-dashed border-rule pt-5">
      {overLimit && (
        <p className="mb-4 border-l-4 border-marigold pl-4">
          This costs more than the {usd(account.allowance.perCoverCap)} you allow for one cover, so your allowance will refuse it. Cover less of
          the loss, or raise the limit under Your agent.
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        {quote.resting && (
          <button type="button" onClick={() => start("resting")} disabled={busy !== null} className="rounded-sm bg-awning px-5 py-3 text-lg font-bold text-paper disabled:opacity-50">
            {busy === "resting" ? "Placing order…" : `Leave an order at ${cents(quote.resting.total)}`}
          </button>
        )}
        {quote.now && (
          <button type="button" onClick={() => start("now")} disabled={busy !== null} className="rounded-sm border-2 border-awning px-5 py-3 text-lg font-bold text-awning disabled:opacity-50">
            {busy === "now" ? "Buying…" : `Buy now for ${cents(quote.now.total)}`}
          </button>
        )}
      </div>
      {quote.resting && (
        <p className="mt-2 text-sm text-mute">An order waits for a seller at your price. If nobody takes it, your money comes back.</p>
      )}
      {refused && (
        <p className="mt-4 border-l-4 border-brick pl-4">
          <span className="font-bold">Your allowance refused this.</span> The agent asked for the premium, but {REFUSAL[refused]}. Nothing was spent.
        </p>
      )}
      {error && <p className="mt-3 text-brick">{error}</p>}
    </div>
  );
}
