"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useEffectEvent, useRef, useState, type CSSProperties } from "react";
import useSWRImmutable from "swr/immutable";
import type { Example } from "@/lib/hedge/examples";
import type { Exposure } from "@/lib/hedge/exposure";
import type { Interpretation, Turn } from "@/lib/hedge/interpret";
import type { CoverPlan } from "@/lib/hedge/plan";
import { cents, usd } from "@/lib/format";
import { offerPrice } from "@/lib/hedge/quote";
import { hasAllowance, post, useAccount } from "./account";
import { Ascii, type Scene } from "./Ascii";
import { Ask } from "./Ask";
import { Bought, type Purchase } from "./Bought";
import { Fit } from "./Fit";
import { Receipt } from "./Receipt";
import { useVoice } from "./voice";

type Unlisted = { wanted: string | null };
type Planned = { plan: CoverPlan | null };
/** A risk that arrives already worked out, and where it came from. */
type Linked = { exposure: Exposure; from: "sales" | "example" };

const CAME_FROM = { sales: "Found in your sales", example: "An example, priced by Gemini right now" } as const;
const order = (i: number) => ({ "--i": i }) as CSSProperties;

/** The quote as one sentence, for reading aloud. */
function spokenQuote({ quote, coverage, basis }: CoverPlan) {
  const offer = offerPrice(quote);
  const price = offer ? `costs ${cents(offer.pricing.total)}` : "has no price right now, because nobody is selling that market";
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

/**
 * The page for one risk. A risk that arrives in the address gets a desk of its own, so coming back
 * with a different one never shows what was on screen for the last, and Back leads somewhere.
 */
export function Desk() {
  const params = useSearchParams();
  return <DeskFor key={params.get("exposure") ?? params.get("risk") ?? ""} />;
}

function DeskFor() {
  const params = useSearchParams();
  const router = useRouter();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [saying, setSaying] = useState(false);
  // What the sentence was read as. It arrives before the price, so the wait can show it.
  const [heard, setHeard] = useState<{ summary: string | null } | null>(null);
  const [sayError, setSayError] = useState<string | null>(null);
  const [ownPlan, setOwnPlan] = useState<CoverPlan | null>(null);
  const [nothingListed, setNothingListed] = useState<Unlisted | null>(null);
  const [coverRatio, setCoverRatio] = useState(1);
  const [repricing, setRepricing] = useState(false);
  const [bought, setBought] = useState<Purchase | null>(null);
  const latestRequest = useRef(0);
  const { owner, account, error: accountError } = useAccount();
  // Only an owner who has set an allowance has a data budget for the agent to spend on a forecast.
  const payer = account && hasAllowance(account) ? owner : undefined;
  const voice = useVoice((spoken) => say(spoken));

  async function say(text: string) {
    const next: Turn[] = [...turns, { role: "user", text }];
    setTurns(next);
    setDraft("");
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
      setHeard({ summary: reading.exposure?.summary ?? null });
      const plan =
        reading.status === "ready" && reading.exposure
          ? (await post<Planned>("/api/plan", { exposure: reading.exposure, coverRatio, owner: payer })).plan
          : null;
      if (plan) {
        setOwnPlan(plan);
        voice.say(spokenQuote(plan));
      } else {
        setNothingListed({ wanted: reading.wanted });
        voice.say("Gemini doesn’t list a market for that yet.");
      }
    } catch (e) {
      setSayError(e instanceof Error ? e.message : String(e));
      // Their words go back in the box, so trying again is one press and not a second typing.
      setTurns(turns);
      setDraft(text);
    } finally {
      setSaying(false);
      setHeard(null);
    }
  }

  // A risk can also arrive ready-made: found in the owner’s sales, or picked from the examples. It is
  // priced as it stands, with no sentence and so no model. A sentence typed on the landing page is said.
  const [linked, setLinked] = useState<Linked | null>(() => {
    const exposure = readJson<Exposure>(params.get("exposure"));
    return exposure && { exposure, from: params.get("from") === "example" ? "example" : "sales" };
  });
  // It waits for the account, so an owner with an allowance gets the forecast check like anyone else.
  // Then it is priced once, for the account as it stood. A first purchase sets up an allowance on the way,
  // and asking again at that moment would take the quote off the screen in the middle of buying it.
  const [pricedFor, setPricedFor] = useState<{ payer: typeof payer } | null>(null);
  if (linked && !pricedFor && (account || accountError)) setPricedFor({ payer });
  const linkedKey = linked && pricedFor ? (["/api/plan", linked.exposure, pricedFor.payer] as const) : null;
  const linkedQuote = useSWRImmutable(linkedKey, ([path, exposure, owner]) => post<Planned>(path, { exposure, coverRatio: 1, owner }));

  const arrived = useRef(false);
  const arrive = useEffectEvent(() => {
    const asked = params.get("risk")?.trim();
    if (arrived.current || linked || !asked) return;
    arrived.current = true;
    say(asked);
  });
  useEffect(() => {
    arrive();
  }, []);

  const pricingLinked = linked !== null && !linkedQuote.data && !linkedQuote.error;
  const plan = ownPlan ?? linkedQuote.data?.plan ?? null;
  const error = sayError ?? (linkedQuote.error instanceof Error ? linkedQuote.error.message : null);
  const unlisted = nothingListed ?? (linkedQuote.data && !linkedQuote.data.plan ? { wanted: null } : null);

  async function changeCover(ratio: number) {
    setCoverRatio(ratio);
    if (!plan) return;
    const request = ++latestRequest.current;
    setRepricing(true);
    try {
      const fresh = await post<Planned>("/api/plan", { exposure: plan.exposure, coverRatio: ratio, owner: payer });
      if (fresh.plan && request === latestRequest.current) setOwnPlan(fresh.plan);
    } catch (e) {
      setSayError(e instanceof Error ? e.message : String(e));
    } finally {
      if (request === latestRequest.current) setRepricing(false);
    }
  }

  function clear() {
    setTurns([]);
    setDraft("");
    setOwnPlan(null);
    setLinked(null);
    setPricedFor(null);
    setNothingListed(null);
    setSayError(null);
    setCoverRatio(1);
  }

  function startOver() {
    clear();
    setBought(null);
    // A risk in the address belongs to this desk; a clean one starts at the plain address.
    if (params.size > 0) router.push("/app");
  }

  function finish(receipt: Omit<Purchase, "plan">) {
    if (!plan) return;
    setBought({ plan, ...receipt });
    clear();
    window.scrollTo({ top: 0 });
    voice.say(`You’re covered. ${usd(receipt.payout)} is locked for you.`);
  }

  if (bought) return <Bought purchase={bought} onAgain={startOver} />;

  if (plan) {
    return (
      <div className="grid items-start gap-x-16 gap-y-10 pt-14 sm:pt-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,29rem)] lg:grid-rows-[auto_1fr]">
        <div className="rise">
          <button type="button" onClick={startOver} className="link text-sm">
            Describe a different risk
          </button>
          <div className="fade-edges mt-4 flex h-40 items-center overflow-hidden max-sm:h-24">
            <Ascii {...sceneFor(plan)} className="w-full" />
          </div>
          <p className="mt-4 text-sm text-muted">{linked ? CAME_FROM[linked.from] : "You said"}</p>
          <h1 className="mt-2 max-w-3xl text-[1.75rem] leading-[1.2] tracking-[-0.02em] text-balance">{plan.exposure.summary}</h1>
        </div>
        {/* In the source it sits between the risk and its small print, which is the order a phone shows them in. */}
        <div className="rise lg:col-start-2 lg:row-span-2 lg:row-start-1" style={order(1)}>
          <Receipt plan={plan} coverRatio={coverRatio} repricing={repricing} onCoverChange={changeCover} onBought={finish} />
        </div>
        <div className="rise lg:col-start-1" style={order(2)}>
          <Fit plan={plan} />
        </div>
      </div>
    );
  }

  return (
    <Ask
      turns={turns}
      busy={saying || pricingLinked}
      pricing={heard !== null || pricingLinked}
      understood={heard?.summary ?? (pricingLinked ? linked.exposure.summary : null)}
      checking={payer !== undefined}
      error={error ?? voice.error}
      unlisted={unlisted}
      draft={draft}
      onDraft={setDraft}
      onSay={say}
      onPick={(example: Example) => router.push(`/app?exposure=${encodeURIComponent(JSON.stringify(example.exposure))}&from=example`)}
      voice={voice}
    />
  );
}
