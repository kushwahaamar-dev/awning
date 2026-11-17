import Form from "next/form";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { chainLabel, explorerAddress, mandateAddress, poolAddress } from "@/lib/chain/config";
import { ATTEMPTS } from "@/lib/covers/attempts";
import { shortAddress } from "@/lib/format";
import { usesStreams } from "@/lib/ledger/source";
import { hedging } from "@/lib/venue";
import { EXAMPLE_RISK } from "@/lib/words";
import { Drawn } from "./Drawn";
import { LiveFigures } from "./LiveFigures";
import { LiveRead } from "./LiveRead";
import { PriceMap } from "./PriceMap";
import { Path, RecentRefusals } from "./Proof";
import { Shopfront } from "./Shopfront";
import { Leg } from "./Trace";
import { External } from "./icons";

// What a stolen agent key can do, in the order the test on the agent page tries it, and what the contracts say to each.
const ATTACK = [
  { tried: ATTEMPTS.ownAddress, verdict: "Refused", tone: "status-bad" },
  { tried: ATTEMPTS.unoffered, verdict: "Sent back", tone: "status-accent" },
  { tried: ATTEMPTS.onePremium, verdict: "Refused", tone: "status-bad" },
  { tried: ATTEMPTS.allData, verdict: "Refused", tone: "status-bad" },
  { tried: ATTEMPTS.dataLeft, verdict: "Went through", tone: "" },
];

// One cover, in the order it happens, and what runs each step. Two steps depend on keys this
// deployment may not have; the page says what is really running, not what could be.
const PATH = [
  { title: "Read", body: "Your sentence becomes a structured risk.", made: ["Google Gemini"] },
  { title: "Match", body: "Code picks the market and sizes the position.", made: ["Gemini prediction markets"] },
  { title: "Check", traced: true, body: "The agent pays $0.02 for a 31-run forecast to test the price.", made: ["x402"] },
  { title: "Lock", traced: true, body: "The pool sets aside the full payout.", made: ["AwningPool", "ERC-4626"] },
  { title: "Pay", traced: true, body: "The premium moves only inside your limits. Above the amount you set, it asks you first.", made: ["AwningMandate", "EIP-712"] },
  {
    live: { title: "Hedge", traced: true, body: "The pool takes the same position on Gemini.", made: ["Gemini trading API"] },
    sandbox: {
      title: "Hedge",
      traced: true,
      body: "The pool places the same position on Gemini’s sandbox for oil, gas, metal and crypto cover. The sandbox lists no weather, so the weather hedge is on paper only.",
      made: ["Gemini trading API"],
    },
    paper: { title: "Hedge", traced: true, body: "The pool sizes the same position on Gemini. It is filled on paper until trading keys are set.", made: ["Gemini prices"] },
  }[hedging],
  usesStreams
    ? { title: "Watch", traced: true, body: "Every contract event streams into the app.", made: ["QuickNode Streams"] }
    : { title: "Watch", body: "The app reads every contract event from the chain.", made: ["Contract logs"] },
  { title: "Settle", traced: true, body: "Gemini resolves the market and the pool pays your vault.", made: ["Arc", "Circle CCTP"] },
];

const FIXED = [
  "An offer could be taken after its deadline.",
  "Another account could use up an offer’s id and strand its payout.",
  "Money sent to the pool by mistake counted as the pool’s.",
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

/** A figure in the sign's dots, with the line that says what it counts. */
function Figure({ value, children }: { value: string; children: ReactNode }) {
  return (
    <>
      <p className="figure text-[clamp(3.5rem,7vw,6.5rem)] leading-none">{value}</p>
      <p className="copy mt-4 text-muted">{children}</p>
    </>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-6 py-3">
      <dt className="text-muted">{label}</dt>
      <dd className="num">{children}</dd>
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

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h3 className="title">{title}</h3>
      <ul className="rows mt-5 border-y border-line text-muted">
        {items.map((item) => (
          <li key={item} className="copy max-w-none py-4">
            {item}
          </li>
        ))}
      </ul>
    </div>
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

      <Leg id="now" from={6} to={3} cover={0}>
        <LiveRead />
        <LiveFigures />
      </Leg>

      <Leg id="prices" from={3} to={1} cover={1}>
        <h2 className="heading">A bad day has a price</h2>
        <p className="copy mt-6 text-muted">
          What it costs, this minute, to cover tomorrow&rsquo;s bad day in every city where Gemini lists the high. The rarer the day, the cheaper the
          cover.
        </p>
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
            <Figure value="$2.00">The most they get: one day&rsquo;s data budget. You set it, and $2 is the default.</Figure>
            <Link href="/agent" className="btn btn-secondary mt-7">
              Run it yourself
            </Link>
          </>
        }
      >
        <h2 className="heading">An agent not worth robbing</h2>
        <p className="copy mt-6 text-muted">Its spending limits are a contract on {chainLabel}. We hand its key to an attacker, and this is what the chain does.</p>
        <p className="mt-14 flex items-center gap-2 border-b border-fg pb-3 text-muted">
          <span className="dot text-bad" />
          Attacker, signing with your agent&rsquo;s key
        </p>
        <ol className="rows border-b border-line">
          {ATTACK.map(({ tried, verdict, tone }) => (
            <li key={tried} className="copy flex max-w-none items-baseline justify-between gap-6 py-4">
              <span>{tried}</span>
              <span className={`status shrink-0 ${tone}`}>{verdict}</span>
            </li>
          ))}
        </ol>
        <RecentRefusals />
      </Leg>

      <Leg
        id="built"
        from={5}
        to={3}
        cover={3}
        aside={
          <dl className="rows border-y border-line">
            <Fact label="Agent’s limits">
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
        <h2 className="heading">How it&rsquo;s built</h2>
        <p className="copy mt-6 text-muted">One cover, from sentence to payout, and what runs each step.</p>
        <div className="mt-14">
          <Path steps={PATH} />
        </div>
      </Leg>

      <Leg id="checked" from={3} to={6} cover={4} aside={<Figure value="126">Contract tests, with fuzzing and invariant runs on both contracts.</Figure>}>
        <h2 className="heading">What we checked</h2>
        <p className="copy mt-6 text-muted">We had it reviewed independently, fixed what was found, and wrote down what is still trusted.</p>
        <div className="mt-14 grid gap-y-12">
          <List title="Found in review, now fixed" items={FIXED} />
          <List title="Still trusted" items={TRUSTED} />
        </div>
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
