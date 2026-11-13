"use client";

import { useState, type CSSProperties } from "react";
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
          <span className={`badge ${a.paused ? "badge-bad" : "badge-good"}`}>
            <span className="dot" />
            {a.paused ? "Paused" : `In force on ${account.setup.chainName}`}
          </span>
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
        <p className="text-muted">If someone took over the agent this minute, the most they could move to themselves is</p>
        <p className="num mt-4 text-[clamp(3rem,6vw,4.5rem)] leading-none font-medium tracking-[-0.04em] text-accent">{cents(a.dataLeftToday)}</p>
        <p className="mt-4 text-muted">Everything else can only go to the pool you approved, and the pool sends back what it didn&rsquo;t offer.</p>
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
  bought: { label: "Bought", tone: "badge-good" },
  skipped: { label: "Left it", tone: "" },
  refused: { label: "Refused", tone: "badge-bad" },
} as const;

/** The numbers the agent had in front of it, so its reasoning can be checked against them. */
function sawThen({ facts }: Decision) {
  const odds = [facts.marketOdds !== null && `market ${percent(facts.marketOdds)}`, facts.forecastOdds !== null && `weather model ${percent(facts.forecastOdds)}`].filter(Boolean);
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
      <p className="mt-3 max-w-2xl text-lg text-muted">
        Each day it looks at the price and a forecast it pays for, and decides for itself whether the cover is worth buying. These are its own
        words on each call.
      </p>
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
            <p className="border-t border-line px-6 py-5 text-muted sm:px-8">Nothing to decide yet. It acts when the next day&rsquo;s market is listed.</p>
          ) : (
            <ol className="rows border-t border-line">
              {order.decisions.map((decision) => (
                <li key={decision.id} className="grid gap-x-8 gap-y-2 px-6 py-5 sm:grid-cols-[8.5rem_1fr] sm:px-8">
                  <div className="flex items-center gap-3 sm:flex-col sm:items-start sm:gap-2">
                    <p className="num text-sm text-muted">{calendarDay(decision.day)}</p>
                    <span className={`badge ${DECISIONS[decision.kind].tone}`}>{DECISIONS[decision.kind].label}</span>
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
        <p className="mt-3 text-lg text-muted">
          Agents read things strangers wrote, and sooner or later one gets talked into something. This hands the agent&rsquo;s own key to an
          attacker and lets them try to empty your vault, with real transactions.
        </p>
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
                  <span className={`badge land shrink-0 ${!step.ok ? "badge-bad" : step.returned ? "badge-accent" : ""}`} style={order(i)}>
                    {!step.ok ? "Refused" : step.returned ? "Sent back" : "Went through"}
                  </span>
                </li>
              ))}
            </ol>
            <p className="title border-t border-line px-5 py-5">The attacker got away with {cents(result.taken)}.</p>
          </>
        ) : (
          <p className="px-5 py-10 text-center text-muted">Each attempt is a real transaction. What the contracts say to each one shows up here.</p>
        )}
      </div>
    </section>
  );
}

function ActivityFeed({ account }: { account: Account }) {
  return (
    <section className="mt-24">
      <h2 className="heading">Everything the agent has done</h2>
      <p className="mt-3 max-w-xl text-lg text-muted">Read from the contracts&rsquo; own record on {account.setup.chainName}, including what it was refused.</p>
      {account.activity.length === 0 ? (
        <p className="mt-8 text-soft">Nothing yet. It starts when you set an allowance.</p>
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
        <div className="mb-10 grid items-end gap-x-14 gap-y-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div>
            <h1 className="display rise max-w-[13em]">{ready ? "What your agent is allowed to do" : "Give your agent an allowance"}</h1>
            <p className="rise mt-5 max-w-2xl text-lg text-muted" style={order(1)}>
              The agent buys cover and data on your behalf. These limits are written into a contract on {account.setup.chainName}, so they
              hold even if the agent is fooled or taken over.
            </p>
          </div>
          <div className="rise panel overflow-hidden max-lg:hidden" style={order(2)}>
            <Ascii scene="lighthouse" label="A lighthouse on a cliff sweeping its beam across a starry night" className="bg-[#060708]" />
          </div>
        </div>
        <div className="rise" style={order(2)}>
          {ready ? (
            <Limits account={account} />
          ) : (
            <div className="panel max-w-2xl p-6 sm:p-8">
              <AllowanceForm />
            </div>
          )}
        </div>
      </section>
      {ready && <StandingOrders account={account} />}
      {ready && <HijackTest />}
      <ActivityFeed account={account} />
    </>
  );
}
