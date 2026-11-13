"use client";

import { useState } from "react";
import { setPaused } from "@/lib/chain/device";
import type { HijackStep } from "@/lib/covers/hijack";
import { cents, clock, day, usd } from "@/lib/format";
import { REFUSAL, describeEvent } from "@/lib/words";
import { AllowanceForm } from "./AllowanceForm";
import { hasAllowance, post, useAccount, type Account } from "./account";

const heading = "font-display text-3xl font-bold tracking-tight [font-stretch:85%]";

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
      <>
        <AllowanceForm onDone={() => setEditing(false)} />
        <button type="button" onClick={() => setEditing(false)} className="mt-4 underline underline-offset-4">
          Keep the current limits
        </button>
      </>
    );
  }

  const rows = [
    ["In your vault", cents(a.balance)],
    ["One cover, at most", usd(a.perCoverCap)],
    ["Cover this month, at most", `${usd(a.monthlyCap)} (${cents(a.premiumLeftThisMonth)} left)`],
    ["Asks you first above", usd(a.approvalThreshold)],
    ["Data, per day", `${usd(a.dailyDataCap)} (${cents(a.dataLeftToday)} left today)`],
  ];

  return (
    <>
      <dl className="figures max-w-xl divide-y divide-rule border-y border-rule text-lg">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-6 py-2.5">
            <dt>{label}</dt>
            <dd className="text-right font-bold">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 max-w-xl text-mute">
        If someone took over the agent this minute, the most they could move to themselves is{" "}
        <span className="font-bold text-ink">{cents(a.dataLeftToday)}</span>. Everything else can only go to the venue you approved.
      </p>
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={togglePause}
          disabled={busy}
          className={`rounded-sm px-6 py-3 text-lg font-bold disabled:opacity-50 ${a.paused ? "bg-awning text-paper" : "bg-brick text-paper"}`}
        >
          {busy ? "One moment…" : a.paused ? "Let the agent resume" : "Pause the agent"}
        </button>
        <button type="button" onClick={() => setEditing(true)} className="underline underline-offset-4">
          Change limits
        </button>
        {error && <p className="text-brick">{error}</p>}
      </div>
      {a.paused && <p className="mt-3 font-bold text-brick">The agent is paused. It can&rsquo;t spend anything until you let it resume.</p>}
    </>
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
    <section className="mt-16">
      <h2 className={heading}>Test the limits</h2>
      <p className="mt-2 max-w-xl text-mute">
        Agents read things strangers wrote, and sooner or later one gets talked into something. This hands the agent&rsquo;s own key to an
        attacker and lets them try to empty your vault, with real transactions.
      </p>
      <button type="button" onClick={run} disabled={busy} className="mt-5 rounded-sm border-2 border-brick px-6 py-3 text-lg font-bold text-brick disabled:opacity-50">
        {busy ? "Attacking…" : "Hijack my agent"}
      </button>
      {error && <p className="mt-3 text-brick">{error}</p>}

      {result && (
        <div className="mt-6 max-w-2xl">
          <ol className="divide-y divide-rule border-y border-rule">
            {result.steps.map((step) => (
              <li key={step.txHash} className="flex flex-wrap items-baseline justify-between gap-x-6 py-3">
                <span className="text-lg">
                  {step.tried} <span className="figures text-mute">({cents(step.amount)})</span>
                </span>
                <span className={`font-bold ${step.ok ? "text-ink" : "text-brick"}`}>{step.ok ? "Went through" : `Refused: ${REFUSAL[step.reason]}`}</span>
              </li>
            ))}
          </ol>
          <p className="mt-4 font-display text-2xl font-bold">
            The attacker got away with {cents(result.taken)}.
          </p>
        </div>
      )}
    </section>
  );
}

function ActivityFeed({ account }: { account: Account }) {
  return (
    <section className="mt-16">
      <h2 className={heading}>Everything the agent has done</h2>
      <p className="mt-2 max-w-xl text-mute">Read from the contract&rsquo;s own record on {account.setup.chainName}, including what it was refused.</p>
      {account.activity.length === 0 ? (
        <p className="mt-6">Nothing yet. It starts when you set an allowance.</p>
      ) : (
        <ol className="mt-6 max-w-3xl divide-y divide-rule border-y border-rule">
          {account.activity.map((event) => {
            const { text, refused } = describeEvent(event.kind, event.args);
            return (
              <li key={event.id} className={`grid grid-cols-[7.5rem_1fr] gap-4 py-3 ${refused ? "text-brick" : ""}`}>
                <time dateTime={event.at} className="figures text-sm text-mute">
                  {day(event.at).split(", ")[1]}, {clock(event.at)}
                </time>
                <span>
                  {text}{" "}
                  {event.explorer && (
                    <a href={event.explorer} target="_blank" rel="noreferrer" className="text-sm text-mute underline underline-offset-2">
                      receipt
                    </a>
                  )}
                </span>
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
  if (error && !account) return <p className="text-brick">{error}</p>;
  if (!account) return <p className="text-mute">Loading your account…</p>;

  const ready = hasAllowance(account);
  return (
    <>
      <section>
        <h1 className="font-display text-4xl leading-[1.05] font-bold tracking-tight [font-stretch:85%] sm:text-5xl">
          {ready ? "What your agent is allowed to do" : "Give your agent an allowance"}
        </h1>
        <p className="mt-4 mb-8 max-w-xl text-lg text-mute">
          The agent buys cover and data on your behalf. These limits are written into a contract on {account.setup.chainName}, so they hold
          even if the agent is fooled or taken over.
        </p>
        {ready ? <Limits account={account} /> : <AllowanceForm />}
      </section>
      {ready && <HijackTest />}
      <ActivityFeed account={account} />
    </>
  );
}
