"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useEffectEvent, useRef, useState, type CSSProperties } from "react";
import useSWRImmutable from "swr/immutable";
import type { Exposure } from "@/lib/hedge/exposure";
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
type Planned = { plan: CoverPlan | null };

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
  return trigger.direction === "below"
    ? { scene: "snow", label: "Snow falling over a pine valley at night" }
    : { scene: "sunrise", label: "The sun climbing over the sea" };
}

function readJson<T>(text: string | null): T | null {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

export function Desk() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [saying, setSaying] = useState(false);
  const [pricingSaid, setPricingSaid] = useState(false);
  const [sayError, setSayError] = useState<string | null>(null);
  const [ownPlan, setOwnPlan] = useState<CoverPlan | null>(null);
  const [nothingListed, setNothingListed] = useState<Unlisted | null>(null);
  const [coverRatio, setCoverRatio] = useState(1);
  const latestRequest = useRef(0);
  const { owner, account, error: accountError } = useAccount();
  // Only an owner who has set an allowance has a data budget for the agent to spend on a forecast.
  const payer = account && hasAllowance(account) ? owner : undefined;
  const voice = useVoice((heard) => say(heard));

  async function say(text: string) {
    const next: Turn[] = [...turns, { role: "user", text }];
    setTurns(next);
    setSaying(true);
    setSayError(null);
    setNothingListed(null);
    try {
      const reading = await post<Interpretation>("/api/interpret", { turns: next });
      if (reading.status === "needs_detail" && reading.question) {
        setTurns([...next, { role: "assistant", text: reading.question }]);
        voice.say(reading.question);
        return;
      }
      setPricingSaid(true);
      const plan =
        reading.status === "ready" && reading.exposure
          ? (await post<Planned>("/api/plan", { exposure: reading.exposure, coverRatio, owner: payer })).plan
          : null;
      if (plan) {
        setOwnPlan(plan);
        voice.say(spokenQuote(plan));
      } else {
        setNothingListed({ wanted: reading.wanted });
        voice.say("Gemini doesn't list a market for that yet.");
      }
    } catch (e) {
      setSayError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaying(false);
      setPricingSaid(false);
    }
  }

  // A risk can also arrive in the address. One already worked out from the owner's sales is priced
  // as it stands, with no sentence and so no model; a sentence typed on the landing page is said.
  const params = useSearchParams();
  const [linked, setLinked] = useState(() => readJson<Exposure>(params.get("exposure")));
  // It waits for the account, so an owner with an allowance gets the forecast check like anyone else.
  const linkedKey = linked && (account || accountError) ? (["/api/plan", linked, payer] as const) : null;
  const linkedQuote = useSWRImmutable(linkedKey, ([path, exposure, owner]) => post<Planned>(path, { exposure, coverRatio: 1, owner }));

  const router = useRouter();
  const arrived = useRef(false);
  const arrive = useEffectEvent(() => {
    if (arrived.current) return;
    arrived.current = true;
    const asked = params.get("risk")?.trim();
    router.replace("/app");
    if (!linked && asked) say(asked);
  });
  useEffect(() => {
    if (params.size > 0) arrive();
  }, [params]);

  const pricingLinked = linked !== null && !linkedQuote.data && !linkedQuote.error;
  const plan = ownPlan ?? linkedQuote.data?.plan ?? null;
  const busy = saying || pricingLinked;
  const pricing = pricingSaid || pricingLinked;
  const error = sayError ?? (linkedQuote.error instanceof Error ? linkedQuote.error.message : null);
  const unlisted = nothingListed ?? (linkedQuote.data && !linkedQuote.data.plan ? { wanted: null } : null);

  async function changeCover(ratio: number) {
    setCoverRatio(ratio);
    if (!plan) return;
    const request = ++latestRequest.current;
    try {
      const fresh = await post<Planned>("/api/plan", { exposure: plan.exposure, coverRatio: ratio, owner: payer });
      if (fresh.plan && request === latestRequest.current) setOwnPlan(fresh.plan);
    } catch (e) {
      setSayError(e instanceof Error ? e.message : String(e));
    }
  }

  function startOver() {
    setTurns([]);
    setOwnPlan(null);
    setLinked(null);
    setNothingListed(null);
    setSayError(null);
    setCoverRatio(1);
  }

  if (plan) {
    return (
      <div className="grid items-start gap-x-16 gap-y-12 pt-14 sm:pt-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,29rem)]">
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
          <p className="mt-4 text-sm text-muted">{linked ? "Found in your sales" : "You said"}</p>
          <h1 className="mt-2 max-w-3xl text-[1.75rem] leading-[1.2] font-[510] tracking-[-0.02em] text-balance">{plan.exposure.summary}</h1>
          <Fit plan={plan} />
        </div>
      </div>
    );
  }

  return <Ask turns={turns} busy={busy} pricing={pricing} error={error ?? voice.error} unlisted={unlisted} onSay={say} voice={voice} />;
}
