"use client";

import { useEffect, useState } from "react";
import { setAllowance, walletBalance } from "@/lib/chain/device";
import { usd } from "@/lib/format";
import { post, useAccount, type Account } from "./account";

const FIELDS = [
  { key: "deposit", label: "Put into your vault", hint: null },
  { key: "perCoverCap", label: "Most it can spend on one cover", hint: null },
  { key: "monthlyCap", label: "Most it can spend on cover in a month", hint: null },
  { key: "approvalThreshold", label: "Ask me first above", hint: null },
  { key: "dailyDataCap", label: "Daily data budget", hint: "The most a hijacked agent could take." },
] as const;

type Key = (typeof FIELDS)[number]["key"];
type Limits = Record<Key, number>;

const USUAL: Limits = { deposit: 2000, perCoverCap: 500, monthlyCap: 1500, approvalThreshold: 100, dailyDataCap: 2 };
// What stays in the wallet for network fees, and the least a day of forecasts costs.
const FEE_RESERVE = 0.25;
const TWO_FORECASTS = 0.04;
const toCents = (n: number) => Math.round(n * 100) / 100;

/**
 * The usual limits, shrunk in proportion when the wallet holds less than the usual deposit.
 * @param firstPremium a purchase the limits must let through, so setting up to buy it can't end in a refusal
 */
export function fittedLimits(wallet: number, firstPremium = 0): Limits {
  const scale = Math.min(1, Math.max(0, wallet - FEE_RESERVE) / USUAL.deposit);
  const deposit = toCents(USUAL.deposit * scale);
  const room = Math.min(deposit, toCents(firstPremium * 1.25));
  return {
    deposit,
    perCoverCap: Math.max(room, toCents(USUAL.perCoverCap * scale)),
    monthlyCap: Math.max(room, toCents(USUAL.monthlyCap * scale)),
    approvalThreshold: Math.max(room, toCents(USUAL.approvalThreshold * scale)),
    dailyDataCap: Math.min(deposit, Math.max(TWO_FORECASTS, toCents(USUAL.dailyDataCap * scale))),
  };
}

/** Everything a first purchase needs, in one go: test dollars if the wallet is empty, then a vault and limits to fit. */
export async function fundAndSetUp(owner: string, setup: Account["setup"], firstPremium: number, onStep: (label: string) => void) {
  let wallet = await walletBalance();
  if (wallet <= FEE_RESERVE) {
    onStep("Getting test dollars…");
    await post("/api/faucet", { owner });
    wallet = await walletBalance();
  }
  await setAllowance({ agent: setup.agent, venue: setup.venue, ...fittedLimits(wallet, firstPremium) }, onStep);
}

/**
 * A dollar amount in a box of its own. It reads the way money is written, 2,000 and not 2000, until
 * it is being typed in, and the sign stays beside the figure however short the figure is.
 */
function Dollars({ id, value, onChange }: { id: string; value: number; onChange: (value: number) => void }) {
  // What is in the box while the cursor is in it; otherwise the box shows the amount itself.
  const [typing, setTyping] = useState<string | null>(null);
  const shown = typing ?? value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return (
    <span className="field flex min-w-[7.5rem] items-baseline justify-end gap-1">
      <span className="num text-muted">$</span>
      <input
        id={id}
        name={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        required
        value={shown}
        onFocus={() => setTyping(String(value))}
        onBlur={() => setTyping(null)}
        onChange={(e) => {
          const text = e.target.value.replace(/[^0-9.]/g, "");
          setTyping(text);
          onChange(Number(text) || 0);
        }}
        style={{ width: `${Math.max(1, shown.length)}ch` }}
        className="num bg-transparent text-right"
      />
    </span>
  );
}

/** Funds the vault and sets the limits the mandate will hold the agent to. */
export function AllowanceForm({ onDone }: { onDone?: () => void }) {
  const { owner, account, refresh } = useAccount();
  const [edited, setEdited] = useState<Partial<Limits>>({});
  const [wallet, setWallet] = useState<number | null>(null);
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (owner) walletBalance().then(setWallet, () => setWallet(null));
  }, [owner, step]);

  if (!owner || !account) return null;
  const { setup } = account;
  // Until the owner types a figure, each one follows what the wallet can actually fund.
  const values = { ...(wallet !== null && wallet > FEE_RESERVE ? fittedLimits(wallet) : USUAL), ...edited };
  const short = wallet !== null && wallet < values.deposit;
  // Figures that contradict each other are said so here, before anything is signed.
  const contradictions = [
    values.deposit <= 0 && "Put something into the vault: the agent can only spend what is in it.",
    values.perCoverCap <= 0 && "With nothing allowed for one cover, the agent can’t buy any.",
    values.perCoverCap > values.monthlyCap && "One cover is allowed more than the whole month is. Raise the month, or lower the cover.",
    values.dailyDataCap > values.deposit && "The daily data budget is more than the vault would hold.",
  ].filter((problem): problem is string => Boolean(problem));

  async function run(work: () => Promise<void>) {
    setError(null);
    try {
      await work();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStep(null);
    }
  }

  const getTestDollars = () =>
    run(async () => {
      setStep("Getting test dollars…");
      await post("/api/faucet", { owner });
    });

  const save = () =>
    run(async () => {
      await setAllowance({ agent: setup.agent, venue: setup.venue, ...values }, setStep);
      onDone?.();
    });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      {/* Each figure is in a box of its own, so the lines need no rules between them. */}
      <div className="space-y-3">
        {FIELDS.map(({ key, label, hint }) => (
          <label key={key} htmlFor={key} className="flex items-center justify-between gap-4">
            <span>
              {label}
              {hint && <span className="block text-sm text-muted">{hint}</span>}
            </span>
            <Dollars id={key} value={values[key]} onChange={(value) => setEdited({ ...edited, [key]: value })} />
          </label>
        ))}
      </div>

      {contradictions.length > 0 && (
        <ul role="alert" className="note mt-6 space-y-1 text-sm">
          {contradictions.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}
      {/* Why the button below can't be pressed yet, and the way to make it so. */}
      {short && (
        <p className="note mt-6 text-sm">
          You have {usd(wallet)} in test dollars, less than the {usd(values.deposit)} going into the vault.{" "}
          <button type="button" onClick={getTestDollars} disabled={step !== null} className="link text-fg">
            Get test dollars
          </button>
        </p>
      )}

      <button type="submit" disabled={step !== null || short || contradictions.length > 0} aria-busy={step !== null} className="btn btn-primary mt-6">
        {step ?? "Set allowance"}
      </button>
      {error && (
        <p role="alert" className="note note-bad mt-4 text-sm break-words">
          {error}
        </p>
      )}
    </form>
  );
}
