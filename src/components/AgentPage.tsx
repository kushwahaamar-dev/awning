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
import { CashOut } from "./CashOut";
import { Stamp } from "./Sketch";
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
      <div className="panel mt-7 p-5 sm:p-6">
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
    // One card: the limits on the grey, and on a white card inside it the one figure they come down to.
    <div className="panel mt-7 grid gap-1.5 p-1.5 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <div className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1">
          <h2 className="title">Allowance</h2>
          <span className={`status ${a.paused ? "status-bad" : "status-good"}`}>{a.paused ? "Paused" : `In force on ${account.setup.chainName}`}</span>
        </div>
        <dl className="rows mt-4 border-y border-line">
          {rows.map(({ label, value, left }) => (
            <div key={label} className="flex items-baseline justify-between gap-6 py-2.5">
              <dt className="text-muted">{label}</dt>
              <dd className="text-right">
                <span className="num">{value}</span>
                {left && <span className="num block text-sm text-muted">{left}</span>}
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

      <div className="inset p-5 sm:self-start">
        <p className="text-sm text-muted">The most a hijacked agent could take right now</p>
        <p className="figure mt-3">{cents(a.dataLeftToday)}</p>
        <button type="button" onClick={togglePause} disabled={busy} aria-busy={busy} className={`btn mt-5 ${a.paused ? "btn-primary" : "btn-danger"}`}>
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
    <section id="standing" className="section scroll-mt-20">
      <h2 className="heading flex items-center gap-4">
        <Stamp of="day" />
        What you&rsquo;ve left with the agent
      </h2>
      <p className="copy mt-4">Each day it decides whether cover is worth buying, and says why.</p>
      {account.standing.map((order) => (
        <article key={order.id} className="panel mt-6">
          <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 p-4 sm:p-5">
            <div className="max-w-md min-w-0">
              <h3 className="title">{order.exposure.summary}</h3>
              <p className="mt-1 text-sm text-muted">
                Every day, up to {usd(order.dailyCap)} a day.{order.instruction && <> You told it: &ldquo;{order.instruction}&rdquo;</>}
              </p>
            </div>
            <button type="button" onClick={() => stop(order.id)} disabled={stopping === order.id} className="btn btn-secondary">
              {stopping === order.id ? "Stopping…" : "Stop"}
            </button>
          </div>
          {/* What it decided each day, on a white card inside the order's own. */}
          {order.decisions.length === 0 ? (
            <p className="inset m-1.5 mt-0 px-4 py-3.5 text-muted">Nothing yet. It acts when the next day&rsquo;s market is listed.</p>
          ) : (
            <ol className="rows inset m-1.5 mt-0">
              {order.decisions.map((decision) => (
                <li key={decision.id} className="grid gap-x-6 gap-y-1.5 px-4 py-3.5 sm:grid-cols-[8.5rem_1fr]">
                  <div className="flex items-center gap-3 sm:flex-col sm:items-start sm:gap-1">
                    <p className="num text-sm text-muted">{calendarDay(decision.day)}</p>
                    <span className={`status ${DECISIONS[decision.kind].tone}`}>{DECISIONS[decision.kind].label}</span>
                  </div>
                  <div>
                    <p className="text-soft">{decision.reason}</p>
                    <p className="num mt-1 text-sm text-muted">{sawThen(decision)}</p>
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
  // A row is as tall before the test as it will be after, when each one gains a line saying why it was refused.
  const ROW = "flex min-h-[4.625rem] items-start justify-between gap-5 px-4 py-3 text-[0.9375rem]";

  return (
    <section className="section">
      <h2 className="heading flex items-center gap-4">
        <Stamp of="lock" />
        Test the limits
      </h2>
      <p className="copy mt-4">
        Hand the agent&rsquo;s key to an attacker and let them try to empty your vault. Every attempt is a real transaction on {account?.setup.chainName ?? "the chain"}.
      </p>
      <button type="button" onClick={run} disabled={busy} aria-busy={busy} className="btn btn-danger mt-5">
        {busy ? "Attacking…" : "Hijack my agent"}
      </button>
      {error && <p className="note note-bad mt-4 text-sm">{error}</p>}

      <div ref={verdict} className="panel mt-6 scroll-mb-6 p-1.5">
        <p className="flex items-center gap-2 px-4 py-2.5 text-sm text-muted">
          <span className="dot text-bad" />
          Attacker, signing with your agent&rsquo;s key
        </p>
        <div className="inset">
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
              <div className="land border-t border-line px-4 py-5" style={order(result.steps.length * 2 + 1)}>
                <p className="text-sm text-muted">The attacker got away with</p>
                <p className="figure mt-2">{cents(result.taken)}</p>
                <p className="mt-2 text-sm text-muted">Everything else is still in your vault.</p>
              </div>
            </>
          ) : (
            <>
              <ol className="rows">
                {planned.map((tried) => (
                  <li key={tried} className={ROW}>
                    <p className="text-soft">{tried}</p>
                    <span className={`status shrink-0 ${busy ? "status-accent status-live" : ""}`}>{busy ? "Trying…" : "Not tried yet"}</span>
                  </li>
                ))}
              </ol>
              <div className="border-t border-line px-4 py-5">
                <p className="text-sm text-muted">The attacker got away with</p>
                <p aria-hidden className="figure mt-2 text-faint">
                  $-.--
                </p>
                <p className="mt-2 text-sm text-muted">{busy ? "The contracts are answering each attempt." : "Run the test to find out."}</p>
              </div>
            </>
          )}
        </div>
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
    <section className="section">
      <h2 className="heading flex items-center gap-4">
        <Stamp of="awning" />
        Everything the agent has done
      </h2>
      <p className="copy mt-4">Read from {account.setup.chainName}, refusals included.</p>
      <FeedSource />
      {account.activity.length === 0 ? (
        <p className="mt-6 text-muted">Nothing yet.</p>
      ) : (
        <ol className="rows mt-6 border-y border-line">
          {account.activity.map((event) => {
            const { text, refused } = describeEvent(event.kind, event.args);
            return (
              <li key={event.id} className="grid gap-x-5 gap-y-0.5 py-3 sm:grid-cols-[8rem_1fr_auto] sm:items-baseline">
                <time dateTime={event.at} className="num text-sm text-faint">
                  {day(event.at).split(", ")[1]}, {clock(event.at)}
                </time>
                <span className={refused ? "text-bad" : "text-soft"}>{text}</span>
                {event.explorer && (
                  <a href={event.explorer} target="_blank" rel="noreferrer" className="link flex items-center gap-1 text-sm">
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
  if (error && !account) return <p className="note note-bad mt-14">{error}</p>;
  if (!account) return <p className="mt-14 text-muted">Loading your account…</p>;

  const ready = hasAllowance(account);
  return (
    <>
      <section className="pt-8 sm:pt-14">
        <h1 className="sign">{ready ? "What your agent is allowed to do" : "Give your agent an allowance"}</h1>
        <p className="lede mt-3">A contract on {account.setup.chainName} holds it to these limits, even if it is fooled or taken over.</p>
        {ready ? (
          <Limits account={account} />
        ) : (
          <div className="panel mt-7 p-5 sm:p-6">
            <AllowanceForm />
          </div>
        )}
      </section>
      {ready && <StandingOrders account={account} />}
      {ready && <HijackTest />}
      {(ready || account.activity.length > 0) && <ActivityFeed account={account} />}
    </>
  );
}
