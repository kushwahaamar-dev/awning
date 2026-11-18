"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import useSWRImmutable from "swr/immutable";
import type { Exposure } from "@/lib/hedge/exposure";
import type { Interpretation, Turn } from "@/lib/hedge/interpret";
import type { CoverPlan } from "@/lib/hedge/plan";
import { cents, usd } from "@/lib/format";
import { offerPrice } from "@/lib/hedge/quote";
import { hasAllowance, post, useAccount } from "./account";
import { Ask } from "./Ask";
import { Bought, type Purchase } from "./Bought";
import { Fit } from "./Fit";
import { Receipt } from "./Receipt";
import { pictureOf } from "./Risks";
import { Stamp } from "./Sketch";
import { answerTo, useVoice, wasSpoken } from "./voice";

type Unlisted = { wanted: string | null };
/** `asOf` is set when the price was made from what Gemini last listed, because it isn't answering now. */
type Planned = { plan: CoverPlan | null; asOf?: string | null };
/** A risk that arrives already worked out, and where it came from. */
type Linked = { exposure: Exposure; from: "sales" | "example" };

const CAME_FROM = { sales: "Found in your sales", example: "An example, priced by Gemini right now" } as const;
// Where an example came from, when Gemini has gone quiet and its price is from a while ago.
const CAME_EARLIER = "An example, on Gemini’s last prices";
// How long the microphone stays open by itself for an answer, after a quote has been read out.
const LISTEN_MS = 6_000;

/** The quote as one sentence, for reading aloud. */
function spokenQuote({ quote, coverage, basis }: CoverPlan) {
  const offer = offerPrice(quote);
  const price = offer ? `costs ${cents(offer.pricing.total)}` : "has no price right now, because nobody is selling that market";
  const caveat = basis.level === "loose" ? " It only loosely tracks your risk, so read the notes before you buy." : "";
  return `Cover that pays ${usd(quote.payout)} if ${coverage.pays} ${price}.${caveat}`;
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
  // How old the prices behind that quote are; null when they are Gemini's of this minute.
  const [ownAsOf, setOwnAsOf] = useState<string | null>(null);
  const [nothingListed, setNothingListed] = useState<Unlisted | null>(null);
  const [coverRatio, setCoverRatio] = useState(1);
  const [repricing, setRepricing] = useState(false);
  const [bought, setBought] = useState<Purchase | null>(null);
  const latestRequest = useRef(0);
  // What the buy button would do if pressed now, as the button itself reports it; null when there is nothing to buy.
  const buyNow = useRef<(() => void) | null>(null);
  // A quote that has just arrived and is still to be read out, and whether the day it prices was spoken.
  const unread = useRef<{ plan: CoverPlan; byMic: boolean } | null>(null);
  // Whether the purchase under way was asked for by voice, so a question it raises is asked and answered the same way.
  const boughtByVoice = useRef(false);
  const { owner, account, error: accountError } = useAccount();
  // Only an owner who has set an allowance has a data budget for the agent to spend on a forecast.
  const payer = account && hasAllowance(account) ? owner : undefined;

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

  const pricingLinked = linked !== null && !linkedQuote.data && !linkedQuote.error;
  const plan = ownPlan ?? linkedQuote.data?.plan ?? null;
  const asOf = (ownPlan ? ownAsOf : linkedQuote.data?.asOf) ?? null;
  const error = sayError ?? (linkedQuote.error instanceof Error ? linkedQuote.error.message : null);
  const unlisted = nothingListed ?? (linkedQuote.data && !linkedQuote.data.plan ? { wanted: null } : null);

  const voice = useVoice((spoken) => hear(spoken));

  /** What the microphone heard. With a quote on screen it is an answer to the quote; with none, it is the bad day itself. */
  function hear(spoken: string) {
    if (!plan) return void say(spoken, { mic: true });
    const answer = answerTo(spoken);
    if (answer === "no") return void voice.say("Okay, nothing was bought.");
    if (answer === null) return another(spoken);
    if (!buyNow.current) return void voice.say("This one can’t be bought as it stands.");
    boughtByVoice.current = true;
    voice.say("Buying it now.");
    buyNow.current();
  }

  /** Neither yes nor no: a different bad day, said over the quote for the last one. */
  function another(spoken: string) {
    // A quote that came by its address has a desk of its own; the new day gets one too, and Back still leads somewhere.
    if (params.size > 0) return router.push(`/app?risk=${encodeURIComponent(spoken)}`);
    // The last quote comes off the desk while the new day is priced. How much of the loss to cover stays as it was set.
    setOwnPlan(null);
    say(spoken, { mic: true, fresh: true });
  }

  /** @param by.mic the sentence was spoken; @param by.fresh it starts a new conversation, whatever was said before */
  async function say(text: string, by: { mic?: boolean; fresh?: boolean } = {}) {
    const next: Turn[] = [...(by.fresh ? [] : turns), { role: "user", text }];
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
      const priced = reading.status === "ready" && reading.exposure ? await post<Planned>("/api/plan", { exposure: reading.exposure, coverRatio, owner: payer }) : null;
      const plan = priced?.plan ?? null;
      if (plan) {
        // Read out once the ticket is on screen, when it is known whether this cover can be bought as it stands.
        unread.current = { plan, byMic: by.mic === true };
        setOwnPlan(plan);
        setOwnAsOf(priced?.asOf ?? null);
      } else {
        setNothingListed({ wanted: reading.wanted });
        voice.say("Gemini doesn’t list a market for that yet.");
      }
    } catch (e) {
      setSayError(e instanceof Error ? e.message : String(e));
      // Their words go back in the box, so trying again is one press and not a second typing.
      setTurns(by.fresh ? [] : turns);
      setDraft(text);
    } finally {
      setSaying(false);
      setHeard(null);
    }
  }

  const arrived = useRef(false);
  const arrive = useEffectEvent(() => {
    const asked = params.get("risk")?.trim();
    if (arrived.current || linked || !asked) return;
    arrived.current = true;
    // It may have been said aloud over another quote, and sent here by way of the address.
    say(asked, { mic: wasSpoken(asked) });
  });
  useEffect(() => {
    arrive();
  }, []);

  const readOut = useEffectEvent(async () => {
    const due = unread.current;
    if (!due) return;
    unread.current = null;
    // By now the ticket has been drawn, and its buy button has said whether there is anything to press.
    const played = await voice.say(spokenQuote(due.plan) + (buyNow.current ? " Say cover it to buy." : ""));
    // Having said what to say, listen for it, so nobody has to find a button to answer. Once for a quote, and only
    // for someone who spoke the day itself: a sentence that was typed never opens the microphone.
    if (played && due.byMic && buyNow.current) voice.listen(LISTEN_MS);
  });
  useEffect(() => {
    readOut();
  }, [ownPlan]);

  async function changeCover(ratio: number) {
    setCoverRatio(ratio);
    if (!plan) return;
    const request = ++latestRequest.current;
    setRepricing(true);
    try {
      const fresh = await post<Planned>("/api/plan", { exposure: plan.exposure, coverRatio: ratio, owner: payer });
      if (fresh.plan && request === latestRequest.current) {
        setOwnPlan(fresh.plan);
        setOwnAsOf(fresh.asOf ?? null);
      }
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
    boughtByVoice.current = false;
    setBought({ plan, ...receipt });
    clear();
    window.scrollTo({ top: 0 });
    voice.say(`You’re covered. ${usd(receipt.payout)} is locked for you.`);
  }

  /** What the ticket has to say while buying: a refusal, an error, or a premium that needs a go-ahead. Said as it is written. */
  async function notice(text: string, asks = false) {
    const answerAloud = asks && boughtByVoice.current;
    boughtByVoice.current = false;
    const played = await voice.say(asks ? `${text} Say approve to go ahead.` : text);
    if (played && answerAloud && buyNow.current) voice.listen(LISTEN_MS);
  }

  if (bought) return <Bought purchase={bought} onAgain={startOver} />;

  if (plan) {
    return (
      <div className="grid items-start gap-x-[clamp(2.5rem,5vw,5rem)] gap-y-10 pt-8 sm:pt-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] lg:grid-rows-[auto_1fr]">
        <div>
          <button type="button" onClick={startOver} className="link text-sm">
            Name a different day
          </button>
          <div className="mt-6 flex items-start gap-4">
            <Stamp of={pictureOf(plan.exposure.trigger)} />
            <div>
              <p className="text-sm text-muted">{!linked ? "You said" : asOf && linked.from === "example" ? CAME_EARLIER : CAME_FROM[linked.from]}</p>
              <h1 className="sign mt-1">{plan.exposure.summary}</h1>
            </div>
          </div>
        </div>
        {/* In the source it sits between the day and its small print, which is the order a phone shows them in. */}
        <div className="lg:sticky lg:top-6 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <Receipt
            plan={plan}
            coverRatio={coverRatio}
            repricing={repricing}
            asOf={asOf}
            onCoverChange={changeCover}
            onBought={finish}
            voice={voice}
            onReady={(act) => {
              buyNow.current = act;
            }}
            onNotice={notice}
          />
        </div>
        <div className="lg:col-start-1 lg:mt-6">
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
      voice={voice}
    />
  );
}
