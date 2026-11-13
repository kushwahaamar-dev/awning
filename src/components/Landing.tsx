import Form from "next/form";
import Link from "next/link";
import type { ReactNode } from "react";
import { chainLabel, explorerAddress, mandateAddress, poolAddress } from "@/lib/chain/config";
import { shortAddress } from "@/lib/format";
import { Ascii, type Scene } from "./Ascii";
import { LiveFigures } from "./LiveFigures";
import { External } from "./icons";

const STEPS: { scene: Scene; label: string; title: string; body: string }[] = [
  { scene: "storm", label: "Storm clouds and lightning over dark hills", title: "Say it", body: "Type or speak the thing that costs you money." },
  { scene: "prices", label: "A price chart, candle by candle", title: "See the price", body: "Awning finds the Gemini market that pays when it happens." },
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

// One cover, in the order it happens, and what does each step.
const PATH = [
  { title: "Read", body: "Your sentence becomes a structured risk.", made: ["Claude"] },
  { title: "Match", body: "Code picks the market and sizes the position.", made: ["Gemini prediction markets"] },
  { title: "Check", body: "The agent pays 2¢ for a 31-run forecast to test the price.", made: ["x402"] },
  { title: "Lock", body: "The pool sets aside the full payout.", made: ["AwningPool", "ERC-4626"] },
  { title: "Pay", body: "The premium moves only inside your limits. Above your line, you sign.", made: ["AwningMandate", "EIP-712"] },
  { title: "Hedge", body: "The pool takes the same position on Gemini.", made: ["Gemini trading API"] },
  { title: "Watch", body: "Every contract event streams into the app.", made: ["QuickNode Streams"] },
  { title: "Settle", body: "Gemini resolves the market and the pool pays your vault.", made: ["Arc", "Circle CCTP"] },
];

const FIXED = [
  "An offer could be taken after its deadline.",
  "Another account could use up an offer's id and strand its payout.",
  "Money sent to the pool by mistake counted as the pool's.",
];

const TRUSTED = [
  "One key reports Gemini's result. If it goes silent, you're paid in full after three days.",
  "The pool's hedge on Gemini is simulated until trading keys are added.",
  "The agent's key and the pool's keys share a server.",
];

/** A section that uses the width: its title and one line stay put on the left while the detail scrolls on the right. */
function Split({ id, title, lead, children }: { id: string; title: string; lead: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="mt-40 grid scroll-mt-14 gap-x-20 gap-y-12 border-t border-line pt-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
      <div className="lg:sticky lg:top-24 lg:self-start">
        <h2 className="heading">{title}</h2>
        <div className="mt-5 max-w-md text-xl leading-snug text-muted">{lead}</div>
      </div>
      <div>{children}</div>
    </section>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="py-4 pr-5 xl:px-5 xl:first:pl-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="num mt-1.5">{children}</dd>
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
      <section className="relative pt-24 pb-[62vw] sm:pt-32 lg:min-h-[58vw] lg:pb-0">
        <div aria-hidden className="bleed">
          <Ascii scene="street" label="" className="hero-scene" />
        </div>
        <h1 className="display rise">
          Say what could go wrong.
          <br />
          Get paid when it does.
        </h1>
        <p className="rise mt-7 max-w-xl text-lg text-muted" style={{ "--i": 1 } as React.CSSProperties}>
          Cover for the bad days insurers won&rsquo;t touch. Priced by Gemini prediction markets, paid out on Arc.
        </p>
        <Form action="/app" className="composer rise mt-9 flex max-w-2xl items-center gap-2 p-2 pl-5" style={{ "--i": 2 } as React.CSSProperties}>
          <label htmlFor="ask" className="sr-only">
            Describe the risk
          </label>
          <input
            id="ask"
            name="risk"
            autoComplete="off"
            placeholder="If Austin stays under 76° tomorrow, my ice cream truck loses $300"
            className="min-w-0 grow bg-transparent py-2 text-lg placeholder:text-faint focus:outline-none"
          />
          <button type="submit" className="btn btn-primary">
            Find cover
          </button>
        </Form>
      </section>
      <LiveFigures />

      <section id="how" className="mt-40 scroll-mt-14 border-t border-line pt-12">
        <div className="grid gap-x-20 gap-y-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
          <h2 className="heading">How it works</h2>
          <p className="max-w-md text-xl leading-snug text-muted lg:pt-2">Describe the risk in a sentence. The rest is done for you.</p>
        </div>
        <ol className="mt-16 grid md:grid-cols-3 md:divide-x md:divide-line">
          {STEPS.map(({ scene, label, title, body }) => (
            <li key={title} className="py-6 md:px-10 md:first:pl-0 md:last:pr-0">
              <div className="flex aspect-[1.75] items-center overflow-hidden">
                <Ascii scene={scene} label={label} className="fade-soft w-full text-soft" />
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
        lead={
          <>
            <p>Its spending limits are a contract on {chainLabel}. We hand its key to an attacker, and this is what the chain does.</p>
            <Link href="/agent" className="btn btn-secondary mt-7 text-base">
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
              <li key={tried} className="flex items-center justify-between gap-6 px-6 py-4 text-lg">
                <span className="text-soft">{tried}</span>
                <span className={`status shrink-0 ${tone}`}>{verdict}</span>
              </li>
            ))}
          </ol>
          <p className="border-t border-line px-6 py-5 text-lg">The most they get is one day&rsquo;s data budget. You set it; the default is $2.</p>
        </div>
      </Split>

      <Split id="built" title="How it&rsquo;s built" lead="One cover, from sentence to payout, and what does each step.">
        <ol className="rows border-y border-line">
          {PATH.map(({ title, body, made }) => (
            <li key={title} className="grid items-baseline gap-x-8 gap-y-1 py-4 sm:grid-cols-[6rem_minmax(0,1fr)_auto]">
              <h3 className="text-lg font-[510]">{title}</h3>
              <p className="text-lg text-muted">{body}</p>
              <p className="num text-sm text-soft">{made.join(" + ")}</p>
            </li>
          ))}
        </ol>
        <dl className="mt-4 grid grid-cols-2 divide-line xl:grid-cols-4 xl:divide-x">
          <Fact label="Agent's limits">
            <Contract address={mandateAddress} />
          </Fact>
          <Fact label="Cover pool">
            <Contract address={poolAddress} />
          </Fact>
          <Fact label="Contract tests">126 passing</Fact>
          <Fact label="Chain">{chainLabel[0].toUpperCase() + chainLabel.slice(1)}</Fact>
        </dl>
      </Split>

      <Split id="checked" title="What we checked" lead="126 contract tests, fuzzing, and an independent review before anyone else looked.">
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

      <section className="mt-40 grid justify-items-center border-t border-line pt-28 text-center">
        <h2 className="display">Say what could go wrong.</h2>
        <Link href="/app" className="btn btn-lg btn-primary mt-9">
          Open the app
        </Link>
        <div aria-hidden className="fade-out -mb-[3vw] mt-2 w-screen max-w-[100rem]">
          <Ascii scene="sunrise" label="" />
        </div>
      </section>
    </>
  );
}
