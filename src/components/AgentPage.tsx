"use client";

import { useState, type CSSProperties } from "react";
import useSWR from "swr";
import { cctpAvailable } from "@/lib/chain/cctp";
import { setPaused } from "@/lib/chain/device";
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
    { label: "Data, per day", value: usd(a.dailyDataCap), left: `${cents(a.dataLeftToday)} left today` },
  ];

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
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
        <p className="mt-4 text-muted">The rest can only go to the pool, which returns anything it didn&rsquo;t offer.</p>
        <button type="button" onClick={togglePause} disabled={busy} className={`btn mt-6 ${a.paused ? "btn-primary" : "btn-danger"}`}>
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
  const { owner, refresh } = useAccount();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ steps: HijackStep[]; taken: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <section className="mt-24 grid gap-x-16 gap-y-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
      <div>
        <h2 className="heading">Test the limits</h2>
        <p className="mt-3 text-lg text-muted">Hand the agent&rsquo;s key to an attacker and let them try to empty your vault. The transactions are real.</p>
        <button type="button" onClick={run} disabled={busy} className="btn btn-lg btn-danger mt-6">
          {busy ? "Attacking…" : "Hijack my agent"}
        </button>
        {error && <p className="note note-bad mt-4 text-sm">{error}</p>}
      </div>

      <div className="panel overflow-hidden">
        <p className="flex items-center gap-2 border-b border-line px-5 py-3 text-xs text-muted">
          <span className="dot text-bad" />
          Attacker, signing with your agent&rsquo;s key
        </p>
        {result ? (
          <>
            <ol className="rows">
              {result.steps.map((step, i) => (
                <li key={step.txHash} className="flex items-start justify-between gap-6 px-5 py-4">
                  <div>
                    <p>
                      {step.tried} <span className="num text-muted">{cents(step.amount)}</span>
                    </p>
                    {!step.ok && <p className="mt-0.5 text-sm text-muted">{sentence(REFUSAL[step.reason])}</p>}
                    {step.returned && <p className="mt-0.5 text-sm text-muted">Your limits allowed it, but the pool never offered that cover.</p>}
                  </div>
                  <span className={`status land shrink-0 ${!step.ok ? "status-bad" : step.returned ? "status-accent" : ""}`} style={order(i)}>
                    {!step.ok ? "Refused" : step.returned ? "Sent back" : "Went through"}
                  </span>
                </li>
              ))}
            </ol>
            <p className="title border-t border-line px-5 py-5">The attacker got away with {cents(result.taken)}.</p>
          </>
        ) : (
          <p className="px-5 py-10 text-center text-muted">What the contracts say to each attempt shows up here.</p>
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
                <span className={refused ? "text-[#ff8a84]" : "text-soft"}>{text}</span>
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
  if (error && !account) return <p className="note note-bad mt-20">{error}</p>;
  if (!account) return <p className="mt-20 text-muted">Loading your account…</p>;

  const ready = hasAllowance(account);
  return (
    <>
      <section className="pt-16 sm:pt-24">
        <div
          className={`grid gap-x-14 gap-y-8 ${ready ? "items-center lg:grid-cols-[minmax(0,1fr)_24rem]" : "items-start lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]"}`}
        >
          <div>
            <h1 className="heading rise">{ready ? "What your agent is allowed to do" : "Give your agent an allowance"}</h1>
            <p className="rise mt-4 max-w-xl text-lg text-muted" style={order(1)}>
              A contract on {account.setup.chainName} enforces these limits, even if the agent is fooled or taken over.
            </p>
            {!ready && (
              <div className="rise panel mt-10 p-6 sm:p-8" style={order(2)}>
                <AllowanceForm />
              </div>
            )}
          </div>
          <div className="rise max-lg:hidden" style={order(2)}>
            <Ascii scene="lighthouse" label="A lighthouse on a cliff sweeping its beam across a starry night" className="fade-soft" />
          </div>
        </div>
        {ready && (
          <div className="rise mt-10" style={order(2)}>
            <Limits account={account} />
          </div>
        )}
      </section>
      {ready && <StandingOrders account={account} />}
      {ready && <HijackTest />}
      {(ready || account.activity.length > 0) && <ActivityFeed account={account} />}
    </>
  );
}
