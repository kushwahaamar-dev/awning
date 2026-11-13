"use client";

import { useEffect, useRef, useState } from "react";
import type { Interpretation, Turn } from "@/lib/hedge/interpret";
import type { CoverPlan } from "@/lib/hedge/plan";
import { post } from "./account";
import { Ask } from "./Ask";
import { Fit } from "./Fit";
import { Receipt } from "./Receipt";

type Unlisted = { wanted: string | null };

export function Desk() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<CoverPlan | null>(null);
  const [unlisted, setUnlisted] = useState<Unlisted | null>(null);
  const [coverRatio, setCoverRatio] = useState(1);
  const latestRequest = useRef(0);

  // The awning in the header rolls out to match the share of the loss under cover.
  useEffect(() => {
    document.documentElement.style.setProperty("--cover", String(plan ? coverRatio : 0.3));
  }, [plan, coverRatio]);

  async function say(text: string) {
    const next: Turn[] = [...turns, { role: "user", text }];
    setTurns(next);
    setBusy(true);
    setError(null);
    setUnlisted(null);
    try {
      const reading = await post<Interpretation>("/api/interpret", { turns: next });
      if (reading.status === "needs_detail" && reading.question) {
        setTurns([...next, { role: "assistant", text: reading.question }]);
      } else if (reading.status === "ready" && reading.exposure) {
        const { plan } = await post<{ plan: CoverPlan | null }>("/api/plan", { exposure: reading.exposure, coverRatio });
        if (plan) setPlan(plan);
        else setUnlisted({ wanted: null });
      } else {
        setUnlisted({ wanted: reading.wanted });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function changeCover(ratio: number) {
    setCoverRatio(ratio);
    if (!plan) return;
    const request = ++latestRequest.current;
    try {
      const fresh = await post<{ plan: CoverPlan | null }>("/api/plan", { exposure: plan.exposure, coverRatio: ratio });
      if (fresh.plan && request === latestRequest.current) setPlan(fresh.plan);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function startOver() {
    setTurns([]);
    setPlan(null);
    setUnlisted(null);
    setError(null);
    setCoverRatio(1);
  }

  if (plan) {
    return (
      <div className="grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <Receipt plan={plan} coverRatio={coverRatio} onCoverChange={changeCover} onBought={startOver} />
        <div>
          <p className="text-lg text-mute">You said</p>
          <p className="mt-1 font-display text-2xl leading-snug font-semibold">{plan.exposure.summary}</p>
          <Fit plan={plan} />
          <button type="button" onClick={startOver} className="mt-8 underline underline-offset-4">
            Describe a different risk
          </button>
        </div>
      </div>
    );
  }

  return <Ask turns={turns} busy={busy} error={error} unlisted={unlisted} onSay={say} />;
}
