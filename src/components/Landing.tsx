import Form from "next/form";
import Link from "next/link";
import type { ReactNode } from "react";
import { chainLabel, explorerAddress, mandateAddress, poolAddress } from "@/lib/chain/config";
import { shortAddress } from "@/lib/format";
import { usesStreams } from "@/lib/ledger/source";
import { hedging } from "@/lib/venue";
import { Ascii, type Scene } from "./Ascii";
import { HeroQuote } from "./HeroQuote";
import { LiveFigures } from "./LiveFigures";
import { External } from "./icons";

const STEPS: { scene: Scene; label: string; title: string; body: string }[] = [
  {
    scene: "storm",
    label: "Storm clouds and lightning over dark hills",
    title: "Say it, or let us find it",
    body: "Type the thing that costs you money, or upload your sales and Awning works it out.",
  },
  {
    scene: "prices",
    label: "A price chart, candle by candle",
    title: "See the price",
    body: "Awning finds the Gemini market that pays when it happens. A one-in-ten day costs about a tenth of what it pays.",
  },
  {
    scene: "lighthouse",
    label: "A lighthouse on a cliff at night",
    title: "Get paid",
    body: "The payout is locked onchain before you pay, and sent when the market resolves.",
  },
];

// What a stolen agent key can do, in the order the test on the agent page tries it.
const ATTACK = [
  { tried: "Pay a premium to the attacker's own address", verdict: "Refused", tone: "status-bad" },
  { tried: "Pay the pool for cover nobody offered", verdict: "Sent back", tone: "status-accent" },
  { tried: "Spend everything on one premium", verdict: "Refused", tone: "status-bad" },
  { tried: "Draw everything as data spending", verdict: "Refused", tone: "status-bad" },
  { tried: "Take what's left of today's data allowance", verdict: "Went through", tone: "" },
];

// One cover, in the order it happens, and what does each step. Two steps depend on keys this
// deployment may not have; the page says what is really running, not what could be.
const PATH = [
  { title: "Read", body: "Your sentence becomes a structured risk.", made: ["Google Gemini"] },
  { title: "Match", body: "Code picks the market and sizes the position.", made: ["Gemini prediction markets"] },
  { title: "Check", body: "The agent pays 2¢ for a 31-run forecast to test the price.", made: ["x402"] },
  { title: "Lock", body: "The pool sets aside the full payout.", made: ["AwningPool", "ERC-4626"] },
  { title: "Pay", body: "The premium moves only inside your limits. Above your line, you sign.", made: ["AwningMandate", "EIP-712"] },
  {
    live: { title: "Hedge", body: "The pool takes the same position on Gemini.", made: ["Gemini trading API"] },
    sandbox: {
      title: "Hedge",
      body: "The pool places the same position on Gemini's sandbox for oil, gas, metal and crypto cover. The sandbox lists no weather, so that hedge is on paper.",
      made: ["Gemini trading API"],
    },
    paper: { title: "Hedge", body: "The pool sizes the same position on Gemini. It is filled on paper until trading keys are set.", made: ["Gemini prices"] },
  }[hedging],
  usesStreams
    ? { title: "Watch", body: "Every contract event streams into the app.", made: ["QuickNode Streams"] }
    : { title: "Watch", body: "The app reads every contract event from the chain.", made: ["Contract logs"] },
  { title: "Settle", body: "Gemini resolves the market and the pool pays your vault.", made: ["Arc", "Circle CCTP"] },
];

const FIXED = [
  "An offer could be taken after its deadline.",
  "Another account could use up an offer's id and strand its payout.",
  "Money sent to the pool by mistake counted as the pool's.",
];

const TRUSTED = [
  "One key reports Gemini's result. If it goes silent, you're paid in full after three days.",
  ...{
    live: [],
    sandbox: ["The pool's hedge runs on Gemini's sandbox with test money, and on paper for weather, which the sandbox doesn't list."],
    paper: ["The pool's hedge on Gemini is filled on paper until trading keys are set."],
  }[hedging],
  "The agent's key and the pool's keys share a server.",
];

/** A section that uses the width: title, one line and its key figure on the left, the detail on the right. */
function Split({ id, title, lead, aside, children }: { id: string; title: string; lead: ReactNode; aside: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="mt-32 grid scroll-mt-14 gap-x-20 gap-y-12 border-t border-line pt-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
      <div className="lg:sticky lg:top-24 lg:self-start">
        <h2 className="heading">{title}</h2>
        <p className="mt-5 max-w-md text-xl leading-snug text-muted">{lead}</p>
        <div className="mt-10">{aside}</div>
      </div>
      <div>{children}</div>
    </section>
  );
}

function Figure({ value, tone = "", children }: { value: string; tone?: string; children: ReactNode }) {
  return (
    <>
      <p className={`figure text-[clamp(3.5rem,7vw,6.5rem)] leading-none ${tone}`}>{value}</p>
      <p className="mt-4 max-w-sm text-muted">{children}</p>
    </>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-6 py-3">
      <dt className="text-muted">{label}</dt>
      <dd className="num text-sm">{children}</dd>
    </div>
  );
}

function Contract({ address }: { address: string | undefined }) {
  if (!address) return "Not deployed";
  const page = explorerAddress(address);
  if (!page) return shortAddress(address);
  return (
    <a href={page} target="_blank" rel="noreferrer" className="link inline-flex items-center gap-1.5">
      {shortAddress(address)} <External />
    </a>
  );
}

export function Landing() {
  return (
    <>
      <section className="relative isolate pt-20 pb-14 sm:pt-28">
        <div aria-hidden className="hero-art rise" style={{ "--i": 4 } as React.CSSProperties}>
          <Ascii scene="street" label="" />
        </div>
        <h1 className="display rise">
          <span className="block">Say what could go wrong.</span>
          <span className="block">Get paid when it does.</span>
        </h1>
        <div className="mt-12 grid items-end gap-x-16 gap-y-12 lg:grid-cols-[minmax(0,1fr)_25rem]">
          <div>
            <p className="rise max-w-xl text-xl leading-snug text-soft" style={{ "--i": 1 } as React.CSSProperties}>
              Cover for the bad days insurers won&rsquo;t touch. The price comes from prediction markets on the Gemini exchange, and your payout is
              locked in USDC on Arc before you pay.
            </p>
            <Form action="/app" className="composer rise mt-9 flex max-w-2xl items-center gap-2 p-2 pl-5" style={{ "--i": 2 } as React.CSSProperties}>
              <label htmlFor="ask" className="sr-only">
                Describe the risk
              </label>
              <input
                id="ask"
                name="risk"
                autoComplete="off"
                placeholder="If it’s too cold to sit outside tomorrow, my patio loses $300…"
                className="min-w-0 grow bg-transparent py-2 text-lg placeholder:text-faint focus:outline-none"
              />
              <button type="submit" className="btn btn-primary">
                Find cover
              </button>
            </Form>
            <p className="rise mt-4 text-sm text-muted" style={{ "--i": 3 } as React.CSSProperties}>
              Not sure what costs you?{" "}
              <Link href="/find" className="link">
                Find it in your sales
              </Link>
            </p>
          </div>
          <HeroQuote />
        </div>
      </section>
      <LiveFigures />

      <section id="how" className="mt-32 scroll-mt-14 border-t border-line pt-12">
        <div className="grid gap-x-20 gap-y-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
          <h2 className="heading">How it works</h2>
          <p className="max-w-md text-xl leading-snug text-muted lg:pt-2">Describe the risk, or hand over your sales. The rest is done for you.</p>
        </div>
        <ol className="mt-16 grid gap-x-20 md:grid-cols-3">
          {STEPS.map(({ scene, label, title, body }) => (
            // Equal columns, so the three titles sit on one line; the rule between them is drawn in the gap.
            <li key={title} className="relative py-6 md:not-first:before:absolute md:not-first:before:inset-y-0 md:not-first:before:-left-10 md:not-first:before:w-px md:not-first:before:bg-line">
              <div className="flex aspect-[1.75] items-center overflow-hidden">
                <Ascii scene={scene} label={label} className="fade-soft w-full" />
              </div>
              <h3 className="title mt-8">{title}</h3>
              <p className="mt-2 max-w-sm text-lg text-muted">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <Split
        id="limits"
        title="An agent you can&rsquo;t rob"
        lead={<>Its spending limits are a contract on {chainLabel}. We hand its key to an attacker, and this is what the chain does.</>}
        aside={
          <>
            <Figure value="$2.00" tone="text-accent">
              The most they get: one day&rsquo;s data budget. You set it, and $2 is the default.
            </Figure>
            <Link href="/agent" className="btn btn-secondary mt-7">
              Run it yourself
            </Link>
          </>
        }
      >
        <div className="panel overflow-hidden">
          <p className="flex items-center gap-2 border-b border-line px-6 py-3.5 text-sm text-muted">
            <span className="dot text-bad" />
            Attacker, signing with your agent&rsquo;s key
          </p>
          <ol className="rows">
            {ATTACK.map(({ tried, verdict, tone }) => (
              <li key={tried} className="flex items-center justify-between gap-6 px-6 py-5 text-lg">
                <span className="text-soft">{tried}</span>
                <span className={`status shrink-0 ${tone}`}>{verdict}</span>
              </li>
            ))}
          </ol>
        </div>
      </Split>

      <Split
        id="built"
        title="How it&rsquo;s built"
        lead="One cover, from sentence to payout, and what does each step."
        aside={
          <dl className="rows max-w-md border-y border-line">
            <Fact label="Agent's limits">
              <Contract address={mandateAddress} />
            </Fact>
            <Fact label="Cover pool">
              <Contract address={poolAddress} />
            </Fact>
            <Fact label="Contract tests">126 passing</Fact>
            <Fact label="Chain">{chainLabel[0].toUpperCase() + chainLabel.slice(1)}</Fact>
          </dl>
        }
      >
        <ol className="rows border-y border-line">
          {PATH.map(({ title, body, made }) => (
            <li key={title} className="grid items-baseline gap-x-8 gap-y-1 py-5 sm:grid-cols-[6rem_minmax(0,1fr)_auto]">
              <h3 className="text-lg font-[510]">{title}</h3>
              <p className="text-lg text-muted">{body}</p>
              <p className="num text-sm text-soft">{made.join(" + ")}</p>
            </li>
          ))}
        </ol>
      </Split>

      <Split
        id="checked"
        title="What we checked"
        lead="We had it reviewed independently, fixed what was found, and wrote down what is still trusted."
        aside={<Figure value="126">Contract tests, with fuzzing and invariant runs on both contracts.</Figure>}
      >
        <div className="grid gap-x-14 gap-y-12 xl:grid-cols-2">
          <div>
            <h3 className="title">Found in review, now fixed</h3>
            <ul className="rows mt-5 border-y border-line text-lg text-muted">
              {FIXED.map((item) => (
                <li key={item} className="py-4">
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="title">Still trusted</h3>
            <ul className="rows mt-5 border-y border-line text-lg text-muted">
              {TRUSTED.map((item) => (
                <li key={item} className="py-4">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Split>

      <section className="mt-32 border-t border-line pt-24 text-center">
        <h2 className="display">Say what could go wrong.</h2>
        <Link href="/app" className="btn btn-lg btn-primary mt-9">
          Open the app
        </Link>
        <div aria-hidden className="band band-middle -mb-24 mt-4">
          <Ascii scene="sunrise" label="" />
        </div>
      </section>
    </>
  );
}
