"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useEffectEvent, useRef, useState, type CSSProperties } from "react";
import type { Interpretation, Turn } from "@/lib/hedge/interpret";
import type { CoverPlan } from "@/lib/hedge/plan";
import { cents, usd } from "@/lib/format";
import { offerPrice } from "@/lib/hedge/quote";
import { hasAllowance, post, useAccount } from "./account";
import { Ascii, type Scene } from "./Ascii";
import { Ask } from "./Ask";
import { Fit } from "./Fit";
import { Receipt } from "./Receipt";
import { useVoice } from "./voice";

type Unlisted = { wanted: string | null };

/** The quote as one sentence, for reading aloud. */
function spokenQuote({ quote, coverage, basis }: CoverPlan) {
  const offer = offerPrice(quote);
  const price = offer ? `costs ${cents(offer.pricing.total)}` : "has no price right now, because nobody is quoting that market";
  const caveat = basis.level === "loose" ? " It only loosely tracks your risk, so read the notes before you buy." : "";
  return `Cover that pays ${usd(quote.payout)} if ${coverage.pays} ${price}.${caveat}`;
}

/** A picture of the thing being covered: cold, heat, a price, or a night on the high street. */
function sceneFor({ exposure }: CoverPlan): { scene: Scene; label: string } {
  const { trigger } = exposure;
  if (trigger.family === "price") return { scene: "prices", label: "A price chart, candle by candle" };
  if (trigger.family === "game") return { scene: "street", label: "A rainy night on a street of small shops" };
  return trigger.direction === "below" ? { scene: "snow", label: "Snow falling over a pine valley at night" } : { scene: "sunrise", label: "The sun climbing over the sea" };
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

  // A sentence typed on the landing page arrives in the address; price it once and tidy the address.
  const asked = useSearchParams().get("risk");
  const router = useRouter();
  const arrived = useRef(false);
  const arrive = useEffectEvent((text: string) => {
    if (arrived.current) return;
    arrived.current = true;
    router.replace("/app");
    if (text.trim()) say(text.trim());
  });
  useEffect(() => {
    if (asked !== null) arrive(asked);
  }, [asked]);

  function startOver() {
    setTurns([]);
    setPlan(null);
    setUnlisted(null);
    setError(null);
    setCoverRatio(1);
  }

  if (plan) {
    return (
      <div className="grid items-start gap-x-16 gap-y-12 pt-14 sm:pt-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <div className="rise lg:order-last" style={{ "--i": 1 } as CSSProperties}>
          <Receipt plan={plan} coverRatio={coverRatio} onCoverChange={changeCover} onBought={startOver} />
        </div>
        <div className="rise">
          <button type="button" onClick={startOver} className="link text-sm">
            Describe a different risk
          </button>
          <div className="fade-edges mt-4 flex h-40 items-center overflow-hidden">
            <Ascii {...sceneFor(plan)} className="w-full" />
          </div>
          <p className="mt-4 text-sm text-muted">You said</p>
          <h1 className="mt-2 max-w-xl text-[1.75rem] leading-[1.2] font-[510] tracking-[-0.02em] text-balance">{plan.exposure.summary}</h1>
          <Fit plan={plan} />
        </div>
      </div>
    );
  }

  return (
    <Ask
      turns={turns}
      busy={busy}
      pricing={pricing}
      error={error ?? voice.error}
      unlisted={unlisted}
      onSay={say}
      voice={voice}
    />
  );
}
