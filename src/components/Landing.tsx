import Form from "next/form";
import Link from "next/link";
import type { CSSProperties } from "react";
import { chainLabel, explorerAddress, mandateAddress, poolAddress } from "@/lib/chain/config";
import { ATTEMPTS } from "@/lib/covers/attempts";
import { usesStreams } from "@/lib/ledger/source";
import { hedging } from "@/lib/venue";
import { EXAMPLE_RISK } from "@/lib/words";
import { Ascii } from "./Ascii";
import { Drawn } from "./Drawn";
import { PriceMap } from "./PriceMap";
import { LastRefusal } from "./Proof";
import { Risks } from "./Risks";
import { Shopfront } from "./Shopfront";
import { Leg } from "./Trace";

// What a stolen agent key can do, in the order the test on the agent page tries it, and what the contracts say to each.
const ATTACK = [
  { tried: ATTEMPTS.ownAddress, verdict: "Refused", tone: "status-bad" },
  { tried: ATTEMPTS.unoffered, verdict: "Sent back", tone: "status-accent" },
  { tried: ATTEMPTS.onePremium, verdict: "Refused", tone: "status-bad" },
  { tried: ATTEMPTS.allData, verdict: "Refused", tone: "status-bad" },
  { tried: ATTEMPTS.dataLeft, verdict: "Went through", tone: "" },
];

// What the pool does with cover it has written, said as it really is where this is running.
const HEDGE = {
  live: " The pool takes the same position on Gemini.",
  sandbox: " Where Gemini’s sandbox lists the market, the pool places the same position there.",
  paper: "",
}[hedging];

const TRUSTED = [
  "One key reports Gemini’s result. If it goes silent, you’re paid in full after three days.",
  ...{
    live: [],
    sandbox: ["The pool’s hedge runs on Gemini’s sandbox with test money, and on paper for weather, which the sandbox doesn’t list."],
    paper: ["The pool’s hedge on Gemini is filled on paper until trading keys are set."],
  }[hedging],
  "The agent’s key and the pool’s keys share a server.",
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

export function Landing() {
  return (
    <>
      <Drawn />

      {/* The opening is the shop and one line to write on. Whatever is written on it goes to be priced. */}
      <section className="flex min-h-[calc(100svh-6.5rem)] flex-col">
        <div className="grid grow place-items-center py-6">
          <Shopfront className="max-h-[min(60svh,42rem)] w-full max-w-5xl" />
        </div>
        <label htmlFor="ask" className="mb-3 text-muted">
          What could go wrong, and what would it cost you?
        </label>
        <Form action="/app" className="ask">
          {/* The prompt on the empty line is a whole example where the line is long enough and a short one where it isn't, so it is never cut off mid-word. */}
          <span className="@container relative flex min-w-0 grow">
            <input id="ask" name="risk" autoComplete="off" placeholder=" " className="peer w-full min-w-0 bg-transparent" />
            <span aria-hidden className="pointer-events-none absolute inset-0 hidden items-baseline whitespace-nowrap text-faint peer-placeholder-shown:flex">
              <span className="@[12em]:hidden">A cold day…</span>
              <span className="hidden @[12em]:inline @[29em]:hidden">A cold day costs me $300…</span>
              <span className="hidden @[29em]:inline">{EXAMPLE_RISK}</span>
            </span>
          </span>
          <button type="submit" className="link shrink-0 lowercase">
            Price cover
          </button>
        </Form>
      </section>

      {/* The line written on runs on down the page. Its first stretch passes between the two halves of what Awning does. */}
      <section data-leg className="leg leg-through" style={{ "--from": 6, "--to": 6 } as CSSProperties}>
        <p className="text-muted lg:absolute lg:top-5">
          Not sure what&rsquo;s costing you?{" "}
          <Link href="/find" className="link whitespace-nowrap">
            Find it in your sales
          </Link>
        </p>
        <h1 className="display grid gap-y-1 max-lg:mt-12 max-lg:text-[12.4vw] lg:grid-cols-2 [&>*]:whitespace-nowrap [&>:nth-child(even)]:max-lg:text-right [&>:nth-child(even)]:lg:pl-[var(--gutter)]">
          <span>Say what</span>
          <span>could go wrong.</span>
          <span>Get paid</span>
          <span>when it does.</span>
        </h1>
        <p className="copy mt-12 lg:mt-20 lg:ml-[calc(50%+var(--gutter))]">
          Cover for the bad days insurers won&rsquo;t touch. The price comes from prediction markets on the Gemini exchange, and your payout is locked
          in USDC on Arc before you pay.
        </p>
      </section>

      {/* From here down each part is a picture first: the bad days themselves, where they are, and what happens to one. */}
      <Leg id="now" from={6} to={3} cover={0}>
        <h2 className="heading">Bad days, priced right now</h2>
        <div className="mt-14">
          <Risks
            empty={
              <p className="copy text-muted">
                Gemini has no bad day worth showing this minute.{" "}
                <Link href="/app" className="link">
                  Describe your own
                </Link>
              </p>
            }
          />
        </div>
      </Leg>

      <Leg id="prices" from={3} to={1} cover={1}>
        <h2 className="heading">A bad day has a price</h2>
        <p className="copy mt-6 text-muted">What it costs, this minute, to cover tomorrow in every city where Gemini lists the high.</p>
        <div className="mt-14">
          <PriceMap />
        </div>
      </Leg>

      <Leg
        id="limits"
        from={1}
        to={5}
        cover={2}
        aside={
          <>
            <Ascii scene="lock" className="mb-10 w-40" />
            <p className="figure text-[clamp(3.5rem,7vw,6.5rem)] leading-none">$2.00</p>
            <p className="copy mt-4 text-muted">The most a thief gets: one day&rsquo;s data budget, and you set it.</p>
            <Link href="/agent" className="btn btn-secondary mt-7">
              Try to rob it
            </Link>
          </>
        }
      >
        <h2 className="heading">An agent not worth robbing</h2>
        <p className="copy mt-6 text-muted">Its spending limits are a contract on {chainLabel}. Hand its key to a thief, and this is what the chain does.</p>
        <ol className="rows mt-14 border-y border-line">
          {ATTACK.map(({ tried, verdict, tone }) => (
            <li key={tried} className="copy flex max-w-none items-baseline justify-between gap-6 py-4">
              <span>{tried}</span>
              <span className={`status shrink-0 ${tone}`}>{verdict}</span>
            </li>
          ))}
        </ol>
        <LastRefusal />
      </Leg>

      {/* The last stretch is the small print of a made thing: what it runs on, in one paragraph, and what it still asks you to trust. */}
      <Leg id="built" from={5} to={3} cover={3}>
        <h2 className="heading">How it&rsquo;s made</h2>
        <p className="copy mt-6 max-w-2xl">
          Google&rsquo;s Gemini model reads your sentence, and a prediction market on the Gemini exchange prices it. Your agent pays $0.02 over x402 for a
          forecast to check that price. The payout is locked in <Contract address={poolAddress}>AwningPool</Contract>, an ERC-4626 vault on {chainLabel},
          before the premium moves through <Contract address={mandateAddress}>AwningMandate</Contract>, the contract that holds your limits.{HEDGE}{" "}
          {usesStreams ? "QuickNode Streams delivers every contract event to the app" : "The app reads every contract event from the chain"}, and Circle
          CCTP carries a payout out to another chain. 126 contract tests pass.
        </p>
        <details className="mt-10 max-w-2xl border-t border-line pt-4">
          <summary className="cursor-pointer text-muted transition-colors hover:text-fg">What you still have to trust</summary>
          <ul className="mt-4 space-y-3 text-muted">
            {TRUSTED.map((item) => (
              <li key={item} className="copy max-w-none">
                {item}
              </li>
            ))}
          </ul>
        </details>
      </Leg>

      {/* The line ends on another one to act on: the way in. */}
      <section className="-mx-[var(--gutter)] flex flex-wrap items-baseline justify-between gap-x-12 gap-y-4 border-t border-fg px-[var(--gutter)] pt-6 pb-10">
        <h2 className="heading">Price your first bad day</h2>
        <Link href="/app" className="heading link">
          Open the app
        </Link>
      </section>
    </>
  );
}
