"use client";

import { useState, type CSSProperties } from "react";
import { setPaused } from "@/lib/chain/device";
import type { HijackStep } from "@/lib/covers/hijack";
import { cents, clock, day, usd } from "@/lib/format";
import { REFUSAL, describeEvent } from "@/lib/words";
import { AllowanceForm } from "./AllowanceForm";
import { hasAllowance, post, useAccount, type Account } from "./account";

const sentence = (clause: string) => `${clause[0].toUpperCase()}${clause.slice(1)}.`;

function Limits({ account }: { account: Account }) {
  const { refresh } = useAccount();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
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
      <div className="permit max-w-2xl px-7 pt-14 pb-8 sm:px-10 sm:pb-10">
        <AllowanceForm onDone={() => setEditing(false)} />
        <button type="button" onClick={() => setEditing(false)} className="link mt-6">
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
    <div className="grid items-start gap-x-12 gap-y-10 lg:grid-cols-12">
      <div className="permit px-7 pt-14 pb-8 sm:px-10 sm:pb-10 lg:col-span-7">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <h2 className="display display-md">Allowance</h2>
          <p className={`flex items-center gap-2 rounded-full px-3 py-1 text-sm font-bold ${a.paused ? "bg-persimmon" : "bg-tint"}`}>
            <span aria-hidden className={`size-2.5 rounded-full ${a.paused ? "bg-ink" : "bg-cobalt"}`} />
            {a.paused ? "Paused" : `In force on ${account.setup.chainName}`}
          </p>
        </div>
        <dl className="mt-6 divide-y divide-rule border-y border-rule text-lg">
          {rows.map(({ label, value, left }) => (
            <div key={label} className="flex items-baseline justify-between gap-6 py-3">
              <dt>{label}</dt>
              <dd className="text-right">
                <span className="till font-bold">{value}</span>
                {left && <span className="till block text-sm text-mute">{left}</span>}
              </dd>
            </div>
          ))}
        </dl>
        <button type="button" onClick={() => setEditing(true)} className="link mt-6">
          Change limits
        </button>
      </div>

      <div className="rounded-[2rem] bg-cobalt p-8 shadow-[0_2rem_3rem_-1.75rem_rgb(0_0_0/0.7)] sm:p-10 lg:col-span-5">
        <p className="text-lg text-haze">If someone took over the agent this minute, the most they could move to themselves is</p>
        <p className="display mt-3 text-[clamp(4rem,8vw,6.5rem)] leading-none text-sun">{cents(a.dataLeftToday)}</p>
        <p className="mt-4 text-lg text-haze">Everything else can only go to the venue you approved.</p>
        <button type="button" onClick={togglePause} disabled={busy} className={`btn mt-8 ${a.paused ? "btn-cream" : "btn-danger"}`}>
          {busy ? "One moment…" : a.paused ? "Let the agent resume" : "Pause the agent"}
        </button>
        {error && <p className="mt-3 font-semibold">{error}</p>}
        {a.paused && <p className="mt-4 font-bold text-sun">The agent is paused. It can&rsquo;t spend anything until you let it resume.</p>}
      </div>
    </div>
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
    <section className="shutter mt-24 rounded-[2rem] px-6 py-14 sm:px-12 sm:py-16">
      <div className="grid gap-x-12 gap-y-10 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <h2 className="display display-lg">Test the limits</h2>
          <p className="mt-4 text-lg text-haze">
            Agents read things strangers wrote, and sooner or later one gets talked into something. This hands the agent&rsquo;s own key to an
            attacker and lets them try to empty your vault, with real transactions.
          </p>
          <button type="button" onClick={run} disabled={busy} className="btn btn-danger mt-7">
            {busy ? "Attacking…" : "Hijack my agent"}
          </button>
          {error && <p className="mt-3 text-ember">{error}</p>}
        </div>

        <div className="lg:col-span-7">
          {result ? (
            <>
              <ol className="divide-y divide-cream/15 border-y border-cream/15">
                {result.steps.map((step, i) => (
                  <li key={step.txHash} className="flex items-start justify-between gap-6 py-4">
                    <div>
                      <p className="text-lg">
                        {step.tried} <span className="till text-haze">{cents(step.amount)}</span>
                      </p>
                      {!step.ok && <p className="text-haze">{sentence(REFUSAL[step.reason])}</p>}
                    </div>
                    <span className={`stamp shrink-0 ${step.ok ? "text-sun" : "text-persimmon"}`} style={{ "--i": i } as CSSProperties}>
                      {step.ok ? "Went through" : "Refused"}
                    </span>
                  </li>
                ))}
              </ol>
              <p className="display display-md mt-8">The attacker got away with {cents(result.taken)}.</p>
            </>
          ) : (
            <p className="rounded-2xl border-2 border-dashed border-cream/30 bg-night/40 p-8 text-lg text-haze">
              Each attempt is a real transaction. What the contract says to each one shows up here.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function ActivityFeed({ account }: { account: Account }) {
  return (
    <section className="mt-24">
      <h2 className="display display-lg">Everything the agent has done</h2>
      <p className="mt-4 max-w-xl text-lg text-haze">Read from the contract&rsquo;s own record on {account.setup.chainName}, including what it was refused.</p>
      {account.activity.length === 0 ? (
        <p className="mt-8 text-lg">Nothing yet. It starts when you set an allowance.</p>
      ) : (
        <ol className="mt-8 max-w-4xl divide-y divide-cream/15 border-y border-cream/15">
          {account.activity.map((event) => {
            const { text, refused } = describeEvent(event.kind, event.args);
            return (
              <li key={event.id} className="grid gap-x-6 gap-y-1 py-4 sm:grid-cols-[9rem_1fr_auto]">
                <time dateTime={event.at} className="till pt-1 text-sm text-haze">
                  {day(event.at).split(", ")[1]}, {clock(event.at)}
                </time>
                <span className={`text-lg ${refused ? "text-ember" : ""}`}>{text}</span>
                {event.explorer && (
                  <a href={event.explorer} target="_blank" rel="noreferrer" className="link pt-1 text-sm text-haze">
                    receipt
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
  if (error && !account) return <p className="text-lg font-semibold text-ember">{error}</p>;
  if (!account) return <p className="text-lg text-haze">Loading your account…</p>;

  const ready = hasAllowance(account);
  return (
    <>
      <section>
        <h1 className="display display-xl rise max-w-[9.6em]">
          {ready ? "What your agent is allowed to do" : "Give your agent an allowance"}
        </h1>
        <p className="rise mt-6 mb-10 max-w-2xl text-xl text-haze" style={{ "--i": 1 } as CSSProperties}>
          The agent buys cover and data on your behalf. These limits are written into a contract on {account.setup.chainName}, so they hold
          even if the agent is fooled or taken over.
        </p>
        {ready ? (
          <Limits account={account} />
        ) : (
          <div className="permit max-w-2xl px-7 pt-14 pb-8 sm:px-10 sm:pb-10">
            <AllowanceForm />
          </div>
        )}
      </section>
      {ready && <HijackTest />}
      <ActivityFeed account={account} />
    </>
  );
}
