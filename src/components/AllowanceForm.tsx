"use client";

import { useEffect, useState } from "react";
import { isLocalChain } from "@/lib/chain/config";
import { setAllowance, walletBalance } from "@/lib/chain/device";
import { usd } from "@/lib/format";
import { post, useAccount } from "./account";

const FIELDS = [
  { key: "deposit", label: "Put into your vault", hint: "Premiums are paid from here, and payouts land here." },
  { key: "perCoverCap", label: "Most it can spend on one cover", hint: null },
  { key: "monthlyCap", label: "Most it can spend on cover in a month", hint: null },
  { key: "approvalThreshold", label: "Ask me first above", hint: "Anything larger needs a tap from you on this device." },
  { key: "dailyDataCap", label: "Daily allowance for buying data", hint: "Forecasts and prices the agent pays for per request. This is all a hijacked agent could ever take." },
] as const;

type Key = (typeof FIELDS)[number]["key"];
const DEFAULTS: Record<Key, number> = { deposit: 2000, perCoverCap: 500, monthlyCap: 1500, approvalThreshold: 100, dailyDataCap: 2 };

/** Funds the vault and sets the limits the mandate will hold the agent to. */
export function AllowanceForm({ onDone }: { onDone?: () => void }) {
  const { owner, account, refresh } = useAccount();
  const [values, setValues] = useState(DEFAULTS);
  const [wallet, setWallet] = useState<number | null>(null);
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (owner) walletBalance().then(setWallet, () => setWallet(null));
  }, [owner, step]);

  if (!owner || !account) return null;
  const { setup } = account;
  const short = wallet !== null && wallet < values.deposit;

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
      setStep("Getting test dollars");
      await post("/api/dev/fund", { owner });
    });

  const save = () =>
    run(async () => {
      await setAllowance({ agent: setup.agent, venue: setup.venue, ...values }, setStep);
      onDone?.();
    });

  return (
    <form
      className="max-w-xl"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div className="space-y-5">
        {FIELDS.map(({ key, label, hint }) => (
          <div key={key}>
            <label htmlFor={key} className="flex items-baseline justify-between gap-4 text-lg">
              <span>{label}</span>
              <span className="flex items-baseline gap-1">
                <span className="till text-mute">$</span>
                <input
                  id={key}
                  type="number"
                  min={0}
                  step="any"
                  required
                  value={values[key]}
                  onChange={(e) => setValues({ ...values, [key]: Number(e.target.value) })}
                  className="till w-28 border-b-2 border-ink bg-transparent py-1 text-right text-xl font-bold focus:border-cobalt focus:outline-none"
                />
              </span>
            </label>
            {hint && <p className="mt-1 text-sm text-mute">{hint}</p>}
          </div>
        ))}
      </div>

      {short && (
        <p className="note mt-6">
          This device&rsquo;s wallet holds {usd(wallet)}.{" "}
          {isLocalChain ? (
            <button type="button" onClick={getTestDollars} disabled={step !== null} className="link font-bold">
              Get test dollars
            </button>
          ) : (
            <>
              Send {setup.chainName} USDC to <span className="font-bold break-all">{owner}</span> from faucet.circle.com, then come back.
            </>
          )}
        </p>
      )}

      <div className="mt-7 flex flex-wrap items-center gap-4">
        <button type="submit" disabled={step !== null || short} className="btn btn-primary">
          {step ?? "Set allowance"}
        </button>
        {error && <p className="text-brick">{error}</p>}
      </div>
    </form>
  );
}
