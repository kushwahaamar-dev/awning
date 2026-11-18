import Form from "next/form";
import Link from "next/link";
import { chainLabel, explorerAddress, mandateAddress, poolAddress } from "@/lib/chain/config";
import { ATTEMPTS } from "@/lib/covers/attempts";
import { usesStreams } from "@/lib/ledger/source";
import { hedging } from "@/lib/venue";
import { Drawing } from "./Drawing";
import { HowItWorks } from "./HowItWorks";
import { PriceMap } from "./PriceMap";
import { LastRefusal } from "./Proof";
import { Risks } from "./Risks";
import { Shopfront } from "./Shopfront";

// Why someone can put money through this, said the way they would ask it.
const PROMISES = [
  { title: "Your payout is set aside before you pay.", body: "The full amount is locked where nobody can spend it, us included, until your day is decided." },
  { title: "A public market decides, not a claims adjuster.", body: "Cover pays on the official reading for your city. If the day happened, you’re paid. There is nothing to argue." },
  { title: "You set the limits.", body: "An AI agent does the buying for you, inside spending limits that only you can change." },
];

// What a stolen agent key can do, in the order the test on the agent page tries it, and what the contracts say to each.
const ATTACK = [
  { tried: ATTEMPTS.ownAddress, verdict: "Refused", tone: "status-bad", failed: true },
  { tried: ATTEMPTS.unoffered, verdict: "Sent back", tone: "status-accent", failed: true },
  { tried: ATTEMPTS.onePremium, verdict: "Refused", tone: "status-bad", failed: true },
  { tried: ATTEMPTS.allData, verdict: "Refused", tone: "status-bad", failed: true },
  { tried: ATTEMPTS.dataLeft, verdict: "Went through", tone: "", failed: false },
];

// What people ask before they try it, answered in a breath each.
const QUESTIONS = [
  {
    asked: "Is this insurance?",
    answer:
      "No. Awning buys contracts on a prediction market that pay when a stated thing happens, like Chicago’s high staying at 59°F or below. That can differ from what you really lose, so before you buy Awning tells you how closely the cover tracks your risk.",
  },
  {
    asked: "What can I cover?",
    answer:
      "The daily high in 49 US cities. The price of oil, natural gas, gold, silver and copper. Bitcoin, Ether, Solana and XRP. And a team winning or losing in football, basketball, hockey or UFC.",
  },
  { asked: "What does it cost?", answer: "The market’s price for that day, with the exchange’s fee included. The rarer the bad day, the cheaper it is to cover. You always see the price before you pay." },
  {
    asked: "How do I get paid?",
    answer: "When the market settles on the official reading, the payout moves to your Awning balance by itself. You don’t file anything, and you can send the money out whenever you like.",
  },
  {
    asked: "What if it’s freezing at my shop but the official reading says otherwise?",
    answer: "Cover pays on the official weather station for your city, not on your street. Awning shows you which station that is and how well it matches your risk before you buy.",
  },
  { asked: "Is this real money?", answer: "Not yet. Awning runs on a test network with test dollars, so you can try all of it, buying cover included, for free." },
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

// The example in the empty box, short enough to be read whole on a phone.
const ASKED = "A cold day costs my patio $300…";

/** The box a bad day is written in, wherever the landing page asks for one. Whatever is written goes to be priced. */
function Ask({ id }: { id: string }) {
  return (
    <Form action="/app" className="composer flex items-center gap-2 p-2 pl-6 max-sm:flex-col max-sm:items-stretch max-sm:p-3">
      <label htmlFor={id} className="sr-only">
        What would a bad day cost you?
      </label>
      <input id={id} name="risk" autoComplete="off" placeholder={ASKED} className="min-w-0 grow bg-transparent py-3 text-lg placeholder:text-faint focus:outline-none max-sm:px-3" />
      <button type="submit" className="btn btn-lg btn-primary shrink-0">
        See my price
      </button>
    </Form>
  );
}

export function Landing() {
  return (
    <>
      {/* The first screen says what this is, to someone who has never heard of it, and gives them the one thing to do. */}
      <section className="inner grid items-center gap-x-12 gap-y-6 pb-16 lg:min-h-[calc(100svh-5rem)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:pb-10">
        <div className="max-lg:order-last">
          <h1 className="display">Get paid when bad weather costs you a day.</h1>
          <p className="lede mt-6">
            Tell Awning what a bad day costs your business. It names a price to cover it. If that day comes, the money is yours automatically, with no
            claim to file.
          </p>
          <div className="mt-9 max-w-2xl">
            <Ask id="ask" />
            <p className="mt-4 text-muted">
              Free to try: it runs on test dollars.{" "}
              <Link href="/find" className="link whitespace-nowrap">
                Not sure what costs you? Find it in your sales
              </Link>
            </p>
          </div>
        </div>
        <Shopfront className="w-full max-lg:mx-auto max-lg:max-w-xl" />
      </section>

      <section id="how" className="section band">
        <div className="inner">
          <h2 className="heading">How it works</h2>
          <div className="mt-14">
            <HowItWorks />
          </div>
        </div>
      </section>

      <section id="now" className="section">
        <div className="inner">
          <h2 className="heading">Bad days you can cover right now</h2>
          <p className="lede mt-5">These are live prices. Pick one to see the cover, or describe your own.</p>
          <div className="mt-12">
            <Risks
              empty={
                <p className="copy text-muted">
                  There&rsquo;s no bad day worth showing this minute.{" "}
                  <Link href="/app" className="link">
                    Describe your own
                  </Link>
                </p>
              }
            />
          </div>
        </div>
      </section>

      <section id="prices" className="section">
        <div className="inner">
          <h2 className="heading">Tomorrow, priced in 49 cities</h2>
          <p className="lede mt-5">What it costs, this minute, to cover a bad day tomorrow wherever you trade.</p>
          <div className="mt-12">
            <PriceMap />
          </div>
        </div>
      </section>

      <section id="trust" className="section band">
        <div className="inner">
          <h2 className="heading">Why you can trust it</h2>
          <div className="mt-12 grid items-center gap-x-16 gap-y-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)]">
            <Drawing subject="safe" className="w-full max-w-md max-lg:mx-auto" />
            <ul className="space-y-8">
              {PROMISES.map(({ title, body }) => (
                <li key={title}>
                  <h3 className="title">{title}</h3>
                  <p className="copy mt-2 max-w-lg text-muted">{body}</p>
                </li>
              ))}
            </ul>
          </div>

          {/* The last promise is the one nobody takes on trust, so it is shown: what a thief tried, each failure crossed out. */}
          <div className="mt-24 grid gap-x-16 gap-y-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)]">
            <div>
              <h3 className="heading">We handed the agent&rsquo;s keys to a thief.</h3>
              <p className="lede mt-5">
                They left with <span className="text-fg">$2</span>: one day&rsquo;s budget for weather data. Everything else was refused by a contract on{" "}
                {chainLabel}.
              </p>
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
        </div>
      </section>

      <section id="faq" className="section">
        <div className="inner grid gap-x-16 gap-y-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)]">
          <h2 className="heading">Questions people ask first</h2>
          <div className="rows border-y border-line">
            {QUESTIONS.map(({ asked, answer }) => (
              <details key={asked} className="faq">
                <summary>{asked}</summary>
                <p className="copy max-w-xl pb-6 text-muted">{answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="section band">
        <div className="inner">
          <h2 className="display max-w-4xl">What would a bad day cost you?</h2>
          <div className="mt-10 max-w-2xl">
            <Ask id="ask-again" />
          </div>
        </div>
      </section>

      {/* The small print of a made thing, for whoever wants to know what is underneath: what it runs on, and what it still asks you to trust. */}
      <section id="built" className="section">
        <div className="inner">
          <h2 className="title">How it&rsquo;s made</h2>
          <p className="copy mt-4 max-w-3xl text-muted">
            Google&rsquo;s Gemini model reads your sentence, and a prediction market on the Gemini exchange prices it. Your agent pays $0.02 over x402 for
            a forecast to check that price. The payout is locked in <Contract address={poolAddress}>AwningPool</Contract>, an ERC-4626 vault on{" "}
            {chainLabel}, before the premium moves through <Contract address={mandateAddress}>AwningMandate</Contract>, the contract that holds your
            limits.{HEDGE} {usesStreams ? "QuickNode Streams delivers every contract event to the app" : "The app reads every contract event from the chain"}
            , and Circle CCTP carries a payout out to another chain. 126 contract tests pass.
          </p>
          <details className="mt-6 max-w-3xl border-t border-line pt-4">
            <summary className="cursor-pointer text-muted transition-colors hover:text-fg">What you still have to trust</summary>
            <ul className="mt-4 space-y-3 text-muted">
              {TRUSTED.map((item) => (
                <li key={item} className="copy max-w-none">
                  {item}
                </li>
              ))}
            </ul>
          </details>
        </div>
      </section>
    </>
  );
}
