"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { usd } from "@/lib/format";
import type { CoverPlan } from "@/lib/hedge/plan";
import { post, useAccount } from "./account";

/** Offers to leave a daily risk with the agent, with a cap and whatever the owner wants it to know. */
export function Standing({ plan, coverRatio, price }: { plan: CoverPlan; coverRatio: number; price: number }) {
  const { owner, account, refresh } = useAccount();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // Room for the price to move without the owner having to come back and raise it.
  const [dailyCap, setDailyCap] = useState(Math.max(1, Math.ceil(price * 2)));
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only temperature has a market every day, which is what a standing order needs.
  if (!account || plan.exposure.trigger.family !== "temperature") return null;
  const askFirst = account.allowance.approvalThreshold;

  async function start() {
    setBusy(true);
    setError(null);
    try {
      await post("/api/standing", { owner, exposure: plan.exposure, coverRatio, dailyCap, instruction: instruction || null });
      await refresh();
      router.push("/agent#standing");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="link mt-5 font-bold">
        Or have your agent cover this every day
      </button>
    );
  }

  return (
    <form
      className="tear mt-6 pt-5"
      onSubmit={(e) => {
        e.preventDefault();
        start();
      }}
    >
      <p className="text-lg font-bold">Leave this with your agent</p>
      <p className="mt-1 text-mute">Each day it checks the price against a forecast, buys when the cover is worth it, leaves it when it isn&rsquo;t, and tells you why.</p>

      <label htmlFor="dailyCap" className="mt-5 flex items-baseline justify-between gap-4 text-lg">
        <span>Most to pay for one day</span>
        <span className="flex items-baseline gap-1">
          <span className="till text-mute">$</span>
          <input
            id="dailyCap"
            type="number"
            min={1}
            max={askFirst}
            step="any"
            required
            value={dailyCap}
            onChange={(e) => setDailyCap(Number(e.target.value))}
            className="till w-24 border-b-2 border-ink bg-transparent py-1 text-right text-xl font-bold focus:border-cobalt focus:outline-none"
          />
        </span>
      </label>
      <p className="mt-1 text-sm text-mute">It can act alone up to the {usd(askFirst)} you set as your ask-first line.</p>

      <label htmlFor="instruction" className="mt-5 block text-lg">
        Anything it should know
      </label>
      <textarea
        id="instruction"
        rows={2}
        maxLength={500}
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        placeholder="Leave it on days the forecast says we're safe."
        className="mt-2 block w-full resize-none rounded-xl bg-tint px-4 py-3 placeholder:text-mute/70 focus:outline-none focus-visible:outline-[3px] focus-visible:outline-cobalt"
      />

      <div className="mt-5 flex flex-wrap items-center gap-4">
        <button type="submit" disabled={busy} className="btn btn-primary">
          {busy ? "Your agent is deciding…" : "Start covering every day"}
        </button>
        {!busy && (
          <button type="button" onClick={() => setOpen(false)} className="link">
            Not now
          </button>
        )}
      </div>
      {error && <p className="mt-3 text-brick">{error}</p>}
    </form>
  );
}
