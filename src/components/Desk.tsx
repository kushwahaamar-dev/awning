"use client";

import { useEffect, useRef, useState } from "react";
import type { Interpretation, Turn } from "@/lib/hedge/interpret";
import type { CoverPlan } from "@/lib/hedge/plan";
import { cents, usd } from "@/lib/format";
import { hasAllowance, post, useAccount } from "./account";
import { Ask } from "./Ask";
import { Fit } from "./Fit";
import { Receipt } from "./Receipt";
import { useVoice } from "./voice";

type Unlisted = { wanted: string | null };

/** The quote as one sentence, for reading aloud. */
function spokenQuote({ quote, coverage, basis }: CoverPlan) {
  const price = quote.resting
    ? `costs ${cents(quote.resting.total)} if you leave an order${quote.now ? `, or ${cents(quote.now.total)} to buy right now` : ""}`
    : quote.now
      ? `costs ${cents(quote.now.total)}`
      : "has no price right now, because nobody is quoting that market";
  const caveat = basis.level === "loose" ? " It only loosely tracks your risk, so read the notes before you buy." : "";
  return `Cover that pays ${usd(quote.payout)} if ${coverage.pays} ${price}.${caveat}`;
}

export function Desk() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [pricing, setPricing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<CoverPlan | null>(null);
  const [unlisted, setUnlisted] = useState<Unlisted | null>(null);
  const [coverRatio, setCoverRatio] = useState(1);
  const latestRequest = useRef(0);
  const { owner, account } = useAccount();
  // Only an owner who has set an allowance has a data budget for the agent to spend on a forecast.
  const payer = account && hasAllowance(account) ? owner : undefined;
  const voice = useVoice((heard) => say(heard));

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
        voice.say(reading.question);
        return;
      }
      setPricing(true);
      const plan =
        reading.status === "ready" && reading.exposure
          ? (await post<{ plan: CoverPlan | null }>("/api/plan", { exposure: reading.exposure, coverRatio, owner: payer })).plan
          : null;
      if (plan) {
        setPlan(plan);
        voice.say(spokenQuote(plan));
      } else {
        setUnlisted({ wanted: reading.wanted });
        voice.say("Gemini doesn't list a market for that yet.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setPricing(false);
    }
  }

  async function changeCover(ratio: number) {
    setCoverRatio(ratio);
    if (!plan) return;
    const request = ++latestRequest.current;
    try {
      const fresh = await post<{ plan: CoverPlan | null }>("/api/plan", { exposure: plan.exposure, coverRatio: ratio, owner: payer });
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
      <div className="grid items-start gap-x-16 gap-y-12 lg:grid-cols-[minmax(0,27rem)_minmax(0,1fr)]">
        <Receipt plan={plan} coverRatio={coverRatio} onCoverChange={changeCover} onBought={startOver} />
        <div className="rise">
          <p className="text-lg text-mute">You said</p>
          <h1 className="display mt-2 text-[clamp(1.75rem,3.1vw,2.75rem)] leading-none">{plan.exposure.summary}</h1>
          <Fit plan={plan} />
          <button type="button" onClick={startOver} className="link mt-10">
            Describe a different risk
          </button>
        </div>
      </div>
    );
  }

  return <Ask turns={turns} busy={busy} pricing={pricing} error={error ?? voice.error} unlisted={unlisted} onSay={say} voice={voice} />;
}
