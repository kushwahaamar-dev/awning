import Form from "next/form";
import Link from "next/link";
import type { ReactNode } from "react";
import { chainLabel, explorerAddress, mandateAddress, poolAddress } from "@/lib/chain/config";
import { ATTEMPTS } from "@/lib/covers/attempts";
import { usesStreams } from "@/lib/ledger/source";
import { hedging } from "@/lib/venue";
import { voiceEnabled } from "@/lib/voice";
import { BadDays } from "./BadDays";
import { PriceMap } from "./PriceMap";
import { LastRefusal } from "./Proof";
import { Sketch, Stamp, type Picture } from "./Sketch";

// The whole product in three moves. Between them they answer what people ask first: what do I do here, is this
// insurance, and who pays me.
const STEPS: { picture: Picture; title: string; body: string }[] = [
  { picture: "say", title: "Say it", body: "Any bad day, in your own words, and what it would cost you." },
  { picture: "price", title: "See the price", body: "A market sets it, not an insurer. No forms, no adjuster." },
  { picture: "paid", title: "Get paid", body: "Your payout is locked before you pay. If the day happens, it arrives by itself." },
];

// What a stolen agent key can do, in the order the test on the agent page tries it, and what the contracts say to each.
const ATTACK = [
  { tried: ATTEMPTS.ownAddress, verdict: "Refused", tone: "status-bad", failed: true },
  { tried: ATTEMPTS.unoffered, verdict: "Sent back", tone: "status-accent", failed: true },
  { tried: ATTEMPTS.onePremium, verdict: "Refused", tone: "status-bad", failed: true },
  { tried: ATTEMPTS.allData, verdict: "Refused", tone: "status-bad", failed: true },
  { tried: ATTEMPTS.dataLeft, verdict: "Went through", tone: "", failed: false },
];

/** A contract by its name, linked to where it can be read when the chain has an explorer. */
function Contract({ address, children }: { address: string | undefined; children: string }) {
  const page = address && explorerAddress(address);
  if (!page) return children;
  return (
    <a href={page} target="_blank" rel="noreferrer" className="link">
      {children}
    </a>
  );
}

// What each part of a cover is done by. Three of the rows depend on keys this deployment may not have: the page
// says what is really running, not what could be.
const MADE: { does: string; by: ReactNode }[] = [
  { does: "Reads your sentence", by: "Google Gemini" },
  { does: "Sets the price", by: "Gemini prediction markets" },
  { does: "Checks the price", by: "A $0.02 forecast, paid over x402" },
  {
    does: "Locks your payout",
    by: (
      <>
        <Contract address={poolAddress}>AwningPool</Contract>, an ERC-4626 vault
      </>
    ),
  },
  { does: "Holds the agent to its limits", by: <Contract address={mandateAddress}>AwningMandate</Contract> },
  ...(hedging === "paper" ? [] : [{ does: "Hedges the pool", by: hedging === "live" ? "Gemini trading API" : "Gemini’s sandbox" }]),
  { does: "Reports what happened", by: usesStreams ? "QuickNode Streams" : "The chain’s own logs" },
  { does: "Moves money out", by: "Circle CCTP" },
  ...(voiceEnabled() ? [{ does: "Hears you say it", by: "ElevenLabs" }] : []),
  { does: "Runs on", by: chainLabel[0].toUpperCase() + chainLabel.slice(1) },
  { does: "Tested by", by: "126 contract tests" },
];

const TRUSTED = [
  "One key reports Gemini’s result. If it goes silent, you’re paid in full after three days.",
  ...{
    live: [],
    sandbox: ["The pool’s hedge runs on Gemini’s sandbox with test money, and on paper for weather, which the sandbox doesn’t list."],
    paper: ["The pool’s hedge on Gemini is filled on paper until trading keys are set."],
  }[hedging],
  "The agent’s key and the pool’s keys share a server.",
];

/** The name of a part of the page, with its small picture beside it. */
function Head({ stamp, children }: { stamp: Picture; children: string }) {
  return (
    <h2 className="heading flex items-center gap-4">
      <Stamp of={stamp} />
      {children}
    </h2>
  );
}

export function Landing() {
  return (
    <>
      {/* For someone who has never heard of this: what it is, in two plain sentences, and the one thing to do, beside the thing itself at work. */}
      <section className="split items-center pt-6 lg:min-h-[calc(100svh-8rem)] lg:pb-10">
        <div>
          <h1 className="sign">Awning pays you when a bad day hits your business.</h1>
          <p className="lede mt-4">
            Name the day in a sentence: a cold snap, a heat wave, fuel going up. Awning tells you what it costs to cover. If the day comes, the money
            arrives by itself.
          </p>
          <Form action="/app" className="composer mt-7 flex max-w-xl items-center gap-2 p-1.5 pl-5 max-sm:flex-col max-sm:items-stretch max-sm:p-2.5">
            <label htmlFor="ask" className="sr-only">
              Name your bad day
            </label>
            <input id="ask" name="risk" autoComplete="off" placeholder="A cold day costs my patio $300…" className="min-w-0 grow bg-transparent py-2 placeholder:text-faint focus:outline-none max-sm:px-2.5" />
            <button type="submit" className="btn btn-primary shrink-0">
              See my price
            </button>
          </Form>
          <p className="mt-3 text-sm text-faint">
            Free to try: it runs on test dollars.{" "}
            <Link href="/find" className="link whitespace-nowrap">
              Not sure what costs you?
            </Link>
          </p>
        </div>
        <BadDays />
      </section>

      <section id="how" className="section">
        <ol className="grid gap-x-12 gap-y-10 sm:grid-cols-3">
          {STEPS.map(({ picture, title, body }, i) => (
            <li key={title}>
              <Sketch of={picture} className="h-36" />
              <h2 className="heading mt-5">
                <span className="num mr-2 text-faint">{i + 1}</span>
                {title}
              </h2>
              <p className="copy mt-1 max-w-xs">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="prices" className="section">
        <Head stamp="day">Tomorrow, city by city</Head>
        <p className="copy mt-4">What it costs this minute to cover a bad day tomorrow, where you trade.</p>
        <div className="mt-8">
          <PriceMap />
        </div>
      </section>

      {/* The agent that does the buying holds money, so what happens when it is stolen is shown, not promised. */}
      <section id="agent" className="section split">
        <div>
          <Head stamp="lock">An agent that can&rsquo;t be robbed</Head>
          <h3 className="title mt-6">We gave the agent&rsquo;s keys to a thief.</h3>
          <p className="copy mt-2">
            They got <span className="text-fg">$2</span>: one day&rsquo;s budget for weather data. A contract on {chainLabel} refused the rest.
          </p>
          <Link href="/agent" className="link mt-4 inline-block">
            Try to rob it yourself
          </Link>
          <LastRefusal />
        </div>
        <div className="panel p-1.5">
          <p className="flex items-center gap-2 px-4 py-2.5 text-sm text-muted">
            <span className="dot text-bad" />
            A thief, signing with the agent&rsquo;s key
          </p>
          <ol className="inset rows">
            {ATTACK.map(({ tried, verdict, tone, failed }) => (
              <li key={tried} className="flex items-baseline justify-between gap-4 px-4 py-3">
                <span className={failed ? "text-muted line-through decoration-edge" : undefined}>{tried}</span>
                <span className={`status shrink-0 ${tone}`}>{verdict}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* For whoever came to see what is underneath: each part of a cover, and what does it. */}
      <section id="built" className="section">
        <Head stamp="awning">How it&rsquo;s made</Head>
        <dl className="mt-6 gap-x-12 sm:columns-2 xl:columns-3">
          {MADE.map(({ does, by }) => (
            <div key={does} className="flex break-inside-avoid items-baseline justify-between gap-6 border-b border-line py-2.5">
              <dt className="text-muted">{does}</dt>
              <dd className="text-right">{by}</dd>
            </div>
          ))}
        </dl>
        <details className="mt-5">
          <summary className="cursor-pointer text-sm text-muted transition-colors hover:text-fg">What you still have to trust</summary>
          <ul className="copy mt-3 space-y-2">
            {TRUSTED.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </details>
      </section>
    </>
  );
}
