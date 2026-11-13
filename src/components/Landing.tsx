import Link from "next/link";
import { chainLabel, explorerAddress, mandateAddress, poolAddress } from "@/lib/chain/config";
import { shortAddress } from "@/lib/format";
import { Ascii } from "./Ascii";
import { LiveFigures } from "./LiveFigures";
import { External, Lock } from "./icons";

const STEPS = [
  { title: "Say it", body: "Describe the thing that costs you money, typed or out loud. There are no forms to fill in." },
  { title: "See the price", body: "Awning finds the Gemini market that pays when it happens, and shows what cover costs and how closely it tracks your loss." },
  { title: "Your agent buys it", body: "Once, or every day on its own judgement. Only inside limits you set, and only after your payout is locked." },
];

// The path of one cover, in the order it happens. Each step names what does the work.
const PATH = [
  { title: "Read", body: "The model turns your sentence into a structured risk: what has to happen, where, when, and what it costs you. If something is missing it asks one question.", made: ["Claude", "structured output"] },
  { title: "Match", body: "Code, not the model, finds the market that settles on that risk and builds the position that pays when it happens. If nothing fits, it says so.", made: ["Gemini prediction markets"] },
  { title: "Check", body: "For weather, the agent pays two cents for a 31-run forecast and compares it with the market's price.", made: ["x402", "USDC on Arc"] },
  { title: "Lock", body: "A pool posts an offer onchain. That sets aside your whole payout before any of your money moves.", made: ["AwningPool", "ERC-4626"] },
  { title: "Pay", body: "The agent asks a second contract for the premium. Inside your limits it is paid. Over your line it needs your signature. Outside them it is refused, and the refusal is recorded.", made: ["AwningMandate", "EIP-712"] },
  { title: "Hedge", body: "The pool buys the same position on Gemini so it isn't carrying the risk alone.", made: ["Gemini trading API"] },
  { title: "Watch", body: "Every event from both contracts streams into the app, so the record you see is the chain's own.", made: ["QuickNode Streams"] },
  { title: "Settle", body: "When Gemini resolves the market, the pool pays your vault or keeps the premium. You can send a payout on to another chain.", made: ["Arc", "Circle CCTP"] },
];

const DECISIONS = [
  {
    title: "Limits live in a contract, not a prompt",
    body: "A spending cap written into a prompt is a suggestion. Awning's are enforced by a contract the agent can't argue with, and every refusal is an event on the chain. There is a button that hands the agent's key to an attacker so you can watch.",
  },
  {
    title: "The payout is locked before you pay",
    body: "Our first version paid out from a wallet we controlled, which meant trusting us to have the money. We threw that away. A pool now locks the full payout first and pays out by itself.",
  },
  {
    title: "The model decides as little as possible",
    body: "It reads your sentence. For standing cover it answers buy or skip for one day and has to write down why. It never chooses an amount, a payee or a market. Those come from code, and the contracts bound them.",
  },
];

const FOUND = [
  "An offer could be taken after its deadline, even once the result was known.",
  "Another account could use up an offer's id and leave its payout locked.",
  "Money sent to the pool by mistake counted as the pool's own.",
];

const TRUSTED = [
  "One key reports Gemini's result to the pool, because no contract can see Gemini. If it goes silent, you are paid in full after three days.",
  "The pool's hedge on Gemini is simulated until trading keys are added. Your cover is real either way.",
  "The agent's key and the pool's keys sit on one server today.",
];

const STACK = [
  { name: "Arc", job: "Where both contracts live. Gas is paid in USDC, so you only ever hold dollars." },
  { name: "Gemini prediction markets", job: "Sets the price, decides the result, and takes the pool's hedge." },
  { name: "Circle CCTP", job: "Moves a payout from your vault to Base, Ethereum or Avalanche, delivered for you." },
  { name: "QuickNode Streams", job: "Delivers every contract event to the app, filtered to the two contracts." },
  { name: "x402", job: "How the agent pays per request for forecasts, in USDC, out of a daily allowance." },
  { name: "ElevenLabs", job: "Lets you say the risk out loud and hear the quote read back." },
];

function Contract({ name, address }: { name: string; address: string | undefined }) {
  if (!address) return null;
  const page = explorerAddress(address);
  return (
    <div className="flex items-baseline justify-between gap-4 py-3">
      <dt className="text-muted">{name}</dt>
      <dd className="num text-sm">
        {page ? (
          <a href={page} target="_blank" rel="noreferrer" className="link inline-flex items-center gap-1.5">
            {shortAddress(address)} <External />
          </a>
        ) : (
          shortAddress(address)
        )}
      </dd>
    </div>
  );
}

/** The story before the product: what it is, how it works, and how it was built and checked. */
export function Landing() {
  return (
    <>
      <section className="pt-20 sm:pt-28">
        <p className="rise">
          <span className="badge badge-accent">
            <Lock />
            Your payout is locked on {chainLabel} before you pay
          </span>
        </p>
        <h1 className="display rise mt-6 max-w-[14em]" style={{ "--i": 1 } as React.CSSProperties}>
          Say what could go wrong. Get paid when it does.
        </h1>
        <p className="rise mt-6 max-w-2xl text-lg text-muted" style={{ "--i": 2 } as React.CSSProperties}>
          Awning turns a plain sentence about a business risk into cover priced by Gemini&rsquo;s prediction markets. An AI agent buys it for
          you, inside limits it can&rsquo;t talk its way around.
        </p>
        <div className="rise mt-8 flex flex-wrap gap-3" style={{ "--i": 3 } as React.CSSProperties}>
          <Link href="/app" className="btn btn-lg btn-primary">
            Open the app
          </Link>
          <a href="#built" className="btn btn-lg btn-secondary">
            See how it&rsquo;s built
          </a>
        </div>

        <figure className="rise panel mt-14 overflow-hidden" style={{ "--i": 4 } as React.CSSProperties}>
          <Ascii scene="street" label="A rainy night on a street of small shops, their signs lit" className="bg-[#060708]" />
          <figcaption className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-t border-line px-5 py-3 text-sm text-muted">
            <span>A wet night on a street of small businesses. Every one of them is exposed to something nobody will insure.</span>
            <span className="num text-xs text-faint">neon-city-rain, ascii-magic-art</span>
          </figcaption>
        </figure>

        <div className="mt-5">
          <LiveFigures />
        </div>
      </section>

      <section className="mt-36 grid gap-x-16 gap-y-10 lg:grid-cols-2">
        <h2 className="heading">
          A cold Tuesday can cost an ice cream truck $300. <span className="text-muted">No insurer will write that policy.</span>
        </h2>
        <div className="space-y-5 text-lg text-muted">
          <p>
            Prediction markets already price exactly these events: tomorrow&rsquo;s high in Austin, oil above $90, the home team losing. A few
            owners use them by hand. Doing it by hand means finding the right contract among a thousand, sizing it, and noticing where the
            market settles differently from your real loss.
          </p>
          <p>
            An AI agent can do that work. But an agent that holds money and reads text written by strangers will sooner or later be talked
            into something. <span className="text-fg">Awning is built around that second problem as much as the first.</span>
          </p>
        </div>
      </section>

      <section id="how" className="mt-36 scroll-mt-24">
        <h2 className="heading max-w-3xl">
          Three steps, and you only do the first. <span className="text-muted">The rest happens inside limits you set.</span>
        </h2>
        <ol className="mt-10 grid gap-px overflow-hidden rounded-[0.875rem] border border-line bg-line md:grid-cols-3">
          {STEPS.map(({ title, body }, i) => (
            <li key={title} className="bg-bg p-7">
              <span aria-hidden className="num text-sm text-faint">
                0{i + 1}
              </span>
              <h3 className="title mt-10">{title}</h3>
              <p className="mt-2 text-muted">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="built" className="mt-36 scroll-mt-24">
        <h2 className="heading max-w-3xl">
          How it&rsquo;s built. <span className="text-muted">Follow one cover from a sentence to a payout.</span>
        </h2>
        <div className="mt-12 grid items-start gap-x-16 gap-y-12 lg:grid-cols-[minmax(0,1fr)_24rem]">
          <ol className="rows border-y border-line">
            {PATH.map(({ title, body, made }, i) => (
              <li key={title} className="grid gap-x-6 gap-y-2 py-5 sm:grid-cols-[2.5rem_7rem_1fr]">
                <span aria-hidden className="num text-sm text-faint">
                  0{i + 1}
                </span>
                <h3 className="font-[510]">{title}</h3>
                <div>
                  <p className="text-muted">{body}</p>
                  <p className="mt-2.5 flex flex-wrap gap-1.5">
                    {made.map((name) => (
                      <span key={name} className="badge num">
                        {name}
                      </span>
                    ))}
                  </p>
                </div>
              </li>
            ))}
          </ol>

          <aside className="space-y-5 lg:sticky lg:top-24">
            <figure className="panel overflow-hidden">
              <Ascii scene="lighthouse" label="A lighthouse on a cliff sweeping its beam across a starry night" className="bg-[#060708]" />
              <figcaption className="border-t border-line px-5 py-3 text-sm text-muted">The contracts keep watch so the agent doesn&rsquo;t have to be trusted.</figcaption>
            </figure>
            <div className="panel px-5 py-2">
              <dl className="rows">
                <Contract name="Agent's limits" address={mandateAddress} />
                <Contract name="Cover pool" address={poolAddress} />
                <div className="flex items-baseline justify-between gap-4 py-3">
                  <dt className="text-muted">Contract tests</dt>
                  <dd className="num text-sm">126 passing</dd>
                </div>
                <div className="flex items-baseline justify-between gap-4 py-3">
                  <dt className="text-muted">Chain</dt>
                  <dd className="text-sm">{chainLabel[0].toUpperCase() + chainLabel.slice(1)}</dd>
                </div>
              </dl>
            </div>
          </aside>
        </div>
      </section>

      <section className="mt-36">
        <h2 className="heading max-w-3xl">
          Three decisions shaped it. <span className="text-muted">One of them was admitting the first version was wrong.</span>
        </h2>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {DECISIONS.map(({ title, body }) => (
            <article key={title} className="panel p-6">
              <h3 className="title">{title}</h3>
              <p className="mt-3 text-muted">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="checked" className="mt-36 scroll-mt-24">
        <h2 className="heading max-w-3xl">
          We attacked it before anyone else could. <span className="text-muted">Then wrote down what is still trusted.</span>
        </h2>
        <div className="mt-10 grid gap-5 lg:grid-cols-2">
          <div className="panel p-6">
            <h3 className="flex items-center gap-2 font-[510]">
              <span className="badge badge-good">Fixed</span> Found by an independent review
            </h3>
            <ul className="rows mt-4 border-t border-line text-muted">
              {FOUND.map((item) => (
                <li key={item} className="py-3">
                  {item}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-faint">Each one now has a test. A stress test runs thousands of mixed actions and checks the pool always holds what it has promised.</p>
          </div>
          <div className="panel p-6">
            <h3 className="flex items-center gap-2 font-[510]">
              <span className="badge badge-accent">Open</span> Still trusted today
            </h3>
            <ul className="rows mt-4 border-t border-line text-muted">
              {TRUSTED.map((item) => (
                <li key={item} className="py-3">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="mt-36">
        <h2 className="heading max-w-3xl">
          What it stands on. <span className="text-muted">Each piece is there because it does a job.</span>
        </h2>
        <dl className="mt-10 grid gap-px overflow-hidden rounded-[0.875rem] border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
          {STACK.map(({ name, job }) => (
            <div key={name} className="bg-bg p-6">
              <dt className="font-[510]">{name}</dt>
              <dd className="mt-2 text-muted">{job}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="panel relative mt-36 overflow-hidden">
        <Ascii scene="sunrise" label="The sun rising over a calm sea" className="bg-[#060708] opacity-70" />
        <div className="absolute inset-0 flex flex-col items-start justify-end bg-gradient-to-t from-panel via-panel/70 to-transparent p-7 sm:p-10">
          <h2 className="heading max-w-xl">Say what could go wrong.</h2>
          <p className="mt-3 max-w-md text-muted">It takes one sentence. On a test chain, with test dollars.</p>
          <Link href="/app" className="btn btn-lg btn-primary mt-6">
            Open the app
          </Link>
        </div>
      </section>
    </>
  );
}
