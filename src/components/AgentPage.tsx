"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import useSWR from "swr";
import { cctpAvailable } from "@/lib/chain/cctp";
import { setPaused } from "@/lib/chain/device";
import { ATTEMPTS } from "@/lib/covers/attempts";
import type { HijackStep } from "@/lib/covers/hijack";
import { calendarDay, cents, clock, day, percent, usd } from "@/lib/format";
import { REFUSAL, describeEvent } from "@/lib/words";
import { AllowanceForm } from "./AllowanceForm";
import { Ascii } from "./Ascii";
import { CashOut } from "./CashOut";
import { hasAllowance, post, useAccount, type Account, type Decision } from "./account";
import { External } from "./icons";

const sentence = (clause: string) => `${clause[0].toUpperCase()}${clause.slice(1)}.`;
const order = (i: number) => ({ "--i": i }) as CSSProperties;

function Limits({ account }: { account: Account }) {
  const { refresh } = useAccount();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const a = account.allowance;

  async function togglePause() {
    setBusy(true);
    setError(null);
    try {
      await setPaused(!a.paused);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <div className="panel max-w-2xl p-6 sm:p-8">
        <AllowanceForm onDone={() => setEditing(false)} />
        <button type="button" onClick={() => setEditing(false)} className="link mt-5 text-sm">
          Keep the current limits
        </button>
      </div>
    );
  }

  const rows = [
    { label: "In your vault", value: cents(a.balance) },
    { label: "One cover, at most", value: usd(a.perCoverCap) },
    { label: "Cover this month, at most", value: usd(a.monthlyCap), left: `${cents(a.premiumLeftThisMonth)} left` },
    { label: "Asks you first above", value: usd(a.approvalThreshold) },
    { label: "Data budget, per day", value: usd(a.dailyDataCap), left: `${cents(a.dataLeftToday)} left today` },
  ];

  return (
    <div className="wide-and-aside grid items-start gap-x-14 gap-y-5 lg:max-xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
      <div className="panel p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <h2 className="title">Allowance</h2>
          <span className={`status ${a.paused ? "status-bad" : "status-good"}`}>{a.paused ? "Paused" : `In force on ${account.setup.chainName}`}</span>
        </div>
        <dl className="rows mt-5 border-y border-line">
          {rows.map(({ label, value, left }) => (
            <div key={label} className="flex items-baseline justify-between gap-6 py-3">
              <dt className="text-muted">{label}</dt>
              <dd className="text-right">
                <span className="num text-lg">{value}</span>
                {left && <span className="num block text-xs text-faint">{left}</span>}
              </dd>
            </div>
          ))}
        </dl>
        {sending ? (
          <CashOut onClose={() => setSending(false)} />
        ) : (
          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" onClick={() => setEditing(true)} className="btn btn-secondary">
              Change limits
            </button>
            {cctpAvailable && (
              <button type="button" onClick={() => setSending(true)} className="btn btn-secondary">
                Send money out
              </button>
            )}
          </div>
        )}
      </div>

      <div className="panel p-6 sm:p-8">
        <p className="text-muted">The most a hijacked agent could take right now</p>
        <p className="figure mt-4 text-[clamp(3rem,6vw,4.5rem)] leading-none text-accent">{cents(a.dataLeftToday)}</p>
        <button type="button" onClick={togglePause} disabled={busy} aria-busy={busy} className={`btn mt-6 ${a.paused ? "btn-primary" : "btn-danger"}`}>
          {busy ? "One moment…" : a.paused ? "Let the agent resume" : "Pause the agent"}
        </button>
        {error && <p className="note note-bad mt-4 text-sm">{error}</p>}
        {a.paused && <p className="note note-bad mt-4 text-sm">The agent is paused. It can&rsquo;t spend anything until you let it resume.</p>}
      </div>
    </div>
  );
}

const DECISIONS = {
  bought: { label: "Bought", tone: "status-good" },
  skipped: { label: "Left it", tone: "" },
  refused: { label: "Refused", tone: "status-bad" },
} as const;

/** The numbers the agent had in front of it, so its reasoning can be checked against them. */
function sawThen({ facts }: Decision) {
  const odds = [
    facts.marketOdds !== null && `market ${percent(facts.marketOdds)}`,
    facts.forecastOdds !== null && `weather model ${percent(facts.forecastOdds)}`,
  ].filter(Boolean);
  return `${cents(facts.premium)} to cover ${usd(facts.payout)}${odds.length ? `. Odds: ${odds.join(", ")}` : ""}.`;
}

function StandingOrders({ account }: { account: Account }) {
  const { owner, refresh } = useAccount();
  const [stopping, setStopping] = useState<number | null>(null);
  if (account.standing.length === 0) return null;

  async function stop(id: number) {
    setStopping(id);
    try {
      await post(`/api/standing/${id}/stop`, { owner });
      await refresh();
    } finally {
      setStopping(null);
    }
  }

  return (
    <section id="standing" className="mt-24 scroll-mt-20">
      <h2 className="heading">What you&rsquo;ve left with the agent</h2>
      <p className="mt-3 text-lg text-muted">Each day it decides whether cover is worth buying, and says why.</p>
      {account.standing.map((order) => (
        <article key={order.id} className="panel mt-8">
          <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4 p-6 sm:p-8">
            <div className="max-w-2xl">
              <h3 className="title">{order.exposure.summary}</h3>
              <p className="mt-2 text-sm text-muted">
                Every day, up to {usd(order.dailyCap)} a day.{order.instruction && <> You told it: &ldquo;{order.instruction}&rdquo;</>}
              </p>
            </div>
            <button type="button" onClick={() => stop(order.id)} disabled={stopping === order.id} className="btn btn-secondary">
              {stopping === order.id ? "Stopping…" : "Stop"}
            </button>
          </div>
          {order.decisions.length === 0 ? (
            <p className="border-t border-line px-6 py-5 text-muted sm:px-8">Nothing yet. It acts when the next day&rsquo;s market is listed.</p>
          ) : (
            <ol className="rows border-t border-line">
              {order.decisions.map((decision) => (
                <li key={decision.id} className="grid gap-x-8 gap-y-2 px-6 py-5 sm:grid-cols-[8.5rem_1fr] sm:px-8">
                  <div className="flex items-center gap-3 sm:flex-col sm:items-start sm:gap-2">
                    <p className="num text-sm text-muted">{calendarDay(decision.day)}</p>
                    <span className={`status ${DECISIONS[decision.kind].tone}`}>{DECISIONS[decision.kind].label}</span>
                  </div>
                  <div>
                    <p className="text-soft">{decision.reason}</p>
                    <p className="num mt-1.5 text-xs text-faint">{sawThen(decision)}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </article>
      ))}
    </section>
  );
}

function HijackTest() {
  const { owner, account, refresh } = useAccount();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ steps: HijackStep[]; taken: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const verdict = useRef<HTMLDivElement>(null);
  // On a phone the result opens below the button that asked for it, so it is brought into view.
  useEffect(() => {
    if (result) verdict.current?.scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [result]);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      setResult(await post("/api/agent/hijack", { owner }));
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  // What will be tried is on the page before the button is pressed, so pressing it changes what the rows say and not how many there are.
  // With nothing left of today's data budget there is nothing for the last attempt to take, and the test leaves it out.
  const planned = Object.values(ATTEMPTS).slice(0, account && account.allowance.dataLeftToday > 0 ? 5 : 4);
  const ROW = "flex min-h-[4.8125rem] items-start justify-between gap-6 px-5 py-4";

  return (
    <section className="mt-24 grid gap-x-20 gap-y-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
      <div>
        <h2 className="heading">Test the limits</h2>
        <p className="mt-3 text-lg text-muted">
          Hand the agent&rsquo;s key to an attacker and let them try to empty your vault. Every attempt is a real transaction on {account?.setup.chainName ?? "the chain"}.
        </p>
        <button type="button" onClick={run} disabled={busy} aria-busy={busy} className="btn btn-lg btn-danger mt-6">
          {busy ? "Attacking…" : "Hijack my agent"}
        </button>
        {error && <p className="note note-bad mt-4 text-sm">{error}</p>}
      </div>

      <div ref={verdict} className="panel scroll-mb-6 overflow-hidden">
        <p className="flex items-center gap-2 border-b border-line px-5 py-3 text-xs text-muted">
          <span className="dot text-bad" />
          Attacker, signing with your agent&rsquo;s key
        </p>
        {result ? (
          <>
            <ol className="rows">
              {result.steps.map((step, i) => (
                <li key={step.txHash} className={ROW}>
                  <div>
                    <p>
                      {step.tried} <span className="num text-muted">{cents(step.amount)}</span>
                    </p>
                    {!step.ok && <p className="mt-0.5 text-sm text-muted">{sentence(REFUSAL[step.reason])}</p>}
                    {step.returned && <p className="mt-0.5 text-sm text-muted">Your limits allowed it, but the pool never offered that cover.</p>}
                  </div>
                  <span className={`status land shrink-0 ${!step.ok ? "status-bad" : step.returned ? "status-accent" : ""}`} style={order(i * 2)}>
                    {!step.ok ? "Refused" : step.returned ? "Sent back" : "Went through"}
                  </span>
                </li>
              ))}
            </ol>
            {/* The answer the whole test is for, landing after the last verdict. */}
            <div className="land border-t border-line px-5 py-6" style={order(result.steps.length * 2 + 1)}>
              <p className="text-muted">The attacker got away with</p>
              <p className="figure mt-2 text-[clamp(2.75rem,5vw,4rem)] leading-none text-accent">{cents(result.taken)}</p>
              <p className="mt-3 text-muted">Everything else is still in your vault.</p>
            </div>
          </>
        ) : (
          <>
            <ol className="rows">
              {planned.map((tried) => (
                <li key={tried} className={ROW}>
                  <p className="text-soft">{tried}</p>
                  <span className={`status shrink-0 ${busy ? "status-accent status-live" : "text-faint"}`}>{busy ? "Trying…" : "Not tried yet"}</span>
                </li>
              ))}
            </ol>
            <div className="border-t border-line px-5 py-6">
              <p className="text-muted">The attacker got away with</p>
              <p aria-hidden className="figure mt-2 text-[clamp(2.75rem,5vw,4rem)] leading-none text-faint">
                $-.--
              </p>
              <p className="mt-3 text-muted">{busy ? "The contracts are answering each attempt." : "Run the test to find out."}</p>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

type Feed = { on: boolean; events: number; lastAt: string | null };
const fetchFeed = async (url: string): Promise<Feed | null> => (await (await fetch(url)).json()).feed ?? null;
const FRESH_MS = 90_000;

/** Where the events on this page come from: pushed by the QuickNode Stream, or read from the chain while it is quiet. */
function FeedSource() {
  const { data: feed } = useSWR("/api/stats#feed", () => fetchFeed("/api/stats"), { refreshInterval: 5_000 });
  if (!feed?.on) return null;
  if (!feed.lastAt) return <p className="status mt-4">QuickNode Stream connected, waiting for its first event</p>;
  // The page asks again every few seconds, so the chain's clock is close enough to the browser's.
  const live = new Date(feed.lastAt).getTime() > new Date().getTime() - FRESH_MS;
  return (
    <p className={`status mt-4 whitespace-normal ${live ? "status-good status-live" : ""}`}>
      {live ? "Live from a QuickNode Stream" : "Fed by a QuickNode Stream"}: {feed.events} events delivered, the last at {clock(feed.lastAt)}
    </p>
  );
}

function ActivityFeed({ account }: { account: Account }) {
  return (
    <section className="mt-24">
      <h2 className="heading">Everything the agent has done</h2>
      <p className="mt-3 text-lg text-muted">Read from {account.setup.chainName}, refusals included.</p>
      <FeedSource />
      {account.activity.length === 0 ? (
        <p className="mt-8 text-soft">Nothing yet.</p>
      ) : (
        <ol className="rows panel mt-8">
          {account.activity.map((event) => {
            const { text, refused } = describeEvent(event.kind, event.args);
            return (
              <li key={event.id} className="grid gap-x-6 gap-y-1 px-5 py-3.5 sm:grid-cols-[9.5rem_1fr_auto] sm:items-baseline">
                <time dateTime={event.at} className="num text-xs text-faint">
                  {day(event.at).split(", ")[1]}, {clock(event.at)}
                </time>
                <span className={refused ? "text-bad" : "text-soft"}>{text}</span>
                {event.explorer && (
                  <a href={event.explorer} target="_blank" rel="noreferrer" className="link flex items-center gap-1 text-xs">
                    receipt <External />
                  </a>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

export function AgentPage() {
  const { account, error } = useAccount();
  if (error && !account) return <p className="note note-bad mx-auto mt-20 max-w-6xl">{error}</p>;
  if (!account) return <p className="mx-auto mt-20 max-w-6xl text-muted">Loading your account…</p>;

  const ready = hasAllowance(account);
  return (
    <div className="mx-auto max-w-6xl">
      <section className="pt-12 sm:pt-20">
        {/* The same two columns before and after the allowance is set, so the scene doesn't move when it is. */}
        <div className="grid items-start gap-x-14 gap-y-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <div>
            <h1 className="sign">{ready ? "What your agent is allowed to do" : "Give your agent an allowance"}</h1>
            <p className="mt-4 max-w-xl text-lg text-muted">
              A contract on {account.setup.chainName} holds it to these limits, even if it is fooled or taken over.
            </p>
            {!ready && (
              <div className="panel mt-10 p-6 sm:p-8">
                <AllowanceForm />
              </div>
            )}
          </div>
          <div className="max-lg:hidden">
            <Ascii scene="lock" className="mx-auto max-w-[11rem]" />
          </div>
        </div>
        {ready && (
          <div className="mt-10">
            <Limits account={account} />
          </div>
        )}
      </section>
      {ready && <StandingOrders account={account} />}
      {ready && <HijackTest />}
      {(ready || account.activity.length > 0) && <ActivityFeed account={account} />}
    </div>
  );
}
