import Link from "next/link";
import { chainLabel, explorerAddress, mandateAddress, poolAddress } from "@/lib/chain/config";
import { ATTEMPTS } from "@/lib/covers/attempts";
import { usesStreams } from "@/lib/ledger/source";
import { hedging } from "@/lib/venue";
import { Drawing, type Subject } from "./Drawing";
import { HeroAsk } from "./HeroAsk";
import { PriceMap } from "./PriceMap";
import { LastRefusal } from "./Proof";
import { Risks } from "./Risks";
import { Shopfront } from "./Shopfront";

// The whole product in three moves. Between them they answer what people ask first: what do I do here, is this
// insurance, and who pays me.
const STEPS: { subject: Subject; title: string; body: string }[] = [
  { subject: "cold", title: "Say it", body: "Any bad day, in your own words, and what it would cost you." },
  { subject: "ticket", title: "See the price", body: "A market sets it, not an insurer. No forms, no adjuster." },
  { subject: "coins", title: "Get paid", body: "Your payout is locked before you pay. If the day happens, it arrives by itself." },
];

// What a stolen agent key can do, in the order the test on the agent page tries it, and what the contracts say to each.
const ATTACK = [
  { tried: ATTEMPTS.ownAddress, verdict: "Refused", tone: "status-bad", failed: true },
  { tried: ATTEMPTS.unoffered, verdict: "Sent back", tone: "status-accent", failed: true },
  { tried: ATTEMPTS.onePremium, verdict: "Refused", tone: "status-bad", failed: true },
  { tried: ATTEMPTS.allData, verdict: "Refused", tone: "status-bad", failed: true },
  { tried: ATTEMPTS.dataLeft, verdict: "Went through", tone: "", failed: false },
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
      {/* The first screen is for someone who has never heard of this: what it is in nine words, and the thing itself at work. */}
      <section className="inner grid items-center gap-x-10 gap-y-6 pb-12 lg:min-h-[calc(100svh-9rem)] lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="max-lg:order-last">
          {/* Two sentences, a line each wherever there is room for one. */}
          <h1 className="display xl:text-[3.75rem] [&>span]:block xl:[&>span]:whitespace-nowrap">
            <span>Name your bad day.</span>
            <span>Get paid if it happens.</span>
          </h1>
          <div className="mt-9 max-w-2xl">
            <HeroAsk />
            <p className="mt-4 text-muted">Weather, fuel and metal prices, crypto, game results. Free to try, on test dollars.</p>
          </div>
        </div>
        <Shopfront className="w-full max-lg:mx-auto max-lg:max-w-xl" />
      </section>

      {/* And one line under it for whoever came to see how it is made. */}
      <details id="built" className="inner made">
        <summary>
          <span>Priced by Gemini prediction markets. Paid in USDC on Arc. Bought by an AI agent whose spending limits are a contract.</span>
          <span className="link shrink-0">How it&rsquo;s made</span>
        </summary>
        <div className="max-w-3xl pb-8">
          <p className="text-muted">
            Google&rsquo;s Gemini model reads your sentence, and a prediction market on the Gemini exchange prices it. Your agent pays $0.02 over x402 for
            a forecast to check that price. The payout is locked in <Contract address={poolAddress}>AwningPool</Contract>, an ERC-4626 vault on{" "}
            {chainLabel}, before the premium moves through <Contract address={mandateAddress}>AwningMandate</Contract>, the contract that holds your
            limits.{HEDGE} {usesStreams ? "QuickNode Streams delivers every contract event to the app" : "The app reads every contract event from the chain"}
            , and Circle CCTP carries a payout out to another chain. You can say your bad day out loud: ElevenLabs hears it. 126 contract tests pass.
          </p>
          <p className="mt-5">What you still have to trust</p>
          <ul className="mt-2 space-y-2 text-muted">
            {TRUSTED.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </details>

      <section id="how" className="section band">
        <ol className="inner grid gap-x-10 gap-y-14 md:grid-cols-3">
          {STEPS.map(({ subject, title, body }, i) => (
            <li key={title}>
              <div className="flex h-44 items-end sm:h-52">
                <Drawing subject={subject} className="h-full" />
              </div>
              <h2 className="heading mt-8">
                <span className="num mr-3 text-muted">{i + 1}</span>
                {title}
              </h2>
              <p className="lede mt-3 max-w-xs">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="now" className="section">
        <div className="inner">
          <h2 className="heading">Or pick one. These prices are live.</h2>
          <div className="mt-12">
            <Risks
              empty={
                <p className="lede">
                  Nothing worth showing this minute.{" "}
                  <Link href="/app" className="link">
                    Name your own
                  </Link>
                </p>
              }
            />
          </div>
        </div>
      </section>

      <section id="prices" className="section">
        <div className="inner">
          <h2 className="heading">A bad day tomorrow, priced in 49 cities</h2>
          <div className="mt-12">
            <PriceMap />
          </div>
        </div>
      </section>

      {/* The agent that does the buying holds money, so the last thing shown is what happens when it is stolen: each failure crossed out. */}
      <section id="trust" className="section band">
        <div className="inner grid gap-x-16 gap-y-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)]">
          <div>
            <h2 className="heading">We gave the agent&rsquo;s keys to a thief. They got $2.</h2>
            <Link href="/agent" className="btn btn-secondary mt-8">
              Try to rob it yourself
            </Link>
          </div>
          <div>
            <ol className="space-y-5">
              {ATTACK.map(({ tried, verdict, tone, failed }) => (
                <li key={tried} className="flex items-baseline justify-between gap-6">
                  <span className="attempt">
                    <span className={failed ? "struck" : undefined}>{tried}</span>
                  </span>
                  <span className={`status shrink-0 ${tone}`}>{verdict}</span>
                </li>
              ))}
            </ol>
            <LastRefusal />
          </div>
        </div>
      </section>
    </>
  );
}
