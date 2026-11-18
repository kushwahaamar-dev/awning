"use client";

import { useState } from "react";
import useSWR from "swr";
import { isAddress } from "viem";
import { DESTINATIONS, type Destination } from "@/lib/chain/cctp";
import { cashOut } from "@/lib/chain/device";
import { cents } from "@/lib/format";
import { useAccount } from "./account";
import { plain } from "@/lib/words";

const fetchFee = async (url: string): Promise<number> => {
  const data = await (await fetch(url)).json();
  if (typeof data.fee !== "number") throw new Error(data.error ?? "Circle didn’t quote a fee.");
  return data.fee;
};

const fetchDelivery = async (url: string): Promise<string | null> => (await (await fetch(url)).json()).delivered ?? null;

/** Sends money from the vault to an address on another chain, delivered by Circle. */
export function CashOut({ onClose }: { onClose: () => void }) {
  const { owner, account, refresh } = useAccount();
  const [amount, setAmount] = useState(1);
  const [destination, setDestination] = useState<Destination>(DESTINATIONS[0]);
  const [address, setAddress] = useState<string>(owner ?? "");
  const [step, setStep] = useState<string | null>(null);
  const [sent, setSent] = useState<{ burn: string; to: Destination; arrives: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: fee, error: feeError } = useSWR(`/api/cashout?to=${destination.domain}`, fetchFee, { refreshInterval: 30_000 });
  // Circle takes a few seconds to see the burn and deliver; ask until it has.
  const { data: delivered } = useSWR(sent && `/api/cashout?tx=${sent.burn}`, fetchDelivery, { refreshInterval: (latest) => (latest ? 0 : 2_500) });

  if (!account) return null;
  const balance = account.allowance.balance;
  const ready = fee !== undefined && amount > fee && amount <= balance && isAddress(address);

  async function send() {
    if (fee === undefined || !isAddress(address)) return;
    setError(null);
    try {
      const burn = await cashOut(amount, { domain: destination.domain, address }, fee, setStep);
      setSent({ burn, to: destination, arrives: amount - fee });
      await refresh();
    } catch (e) {
      setError(plain(e));
    } finally {
      setStep(null);
    }
  }

  if (sent) {
    return (
      <div className="mt-5 border-t border-line pt-5" aria-live="polite">
        {delivered ? (
          <p>
            <span>
              {cents(sent.arrives)} arrived on {sent.to.name}.
            </span>{" "}
            <a href={sent.to.explorer + delivered} target="_blank" rel="noreferrer" className="link">
              See it there
            </a>
          </p>
        ) : (
          <p className="text-soft">
            <span className="text-fg">On its way to {sent.to.name}.</span> Circle is delivering {cents(sent.arrives)}.
          </p>
        )}
        <button type="button" onClick={onClose} className="link mt-4 text-sm">
          Done
        </button>
      </div>
    );
  }

  return (
    <form
      className="mt-5 border-t border-line pt-5"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <p className="title">Send money out to another chain</p>
      <p className="mt-1 text-sm text-muted">Circle delivers it.</p>

      <label htmlFor="cashAmount" className="mt-5 flex items-center justify-between gap-4">
        <span>How much</span>
        {/* The sign sits in the box with the figure, as it does on the allowance. */}
        <span className="field flex items-baseline gap-1">
          <span className="num text-muted">$</span>
          <input
            id="cashAmount"
            type="number"
            min={0}
            max={balance}
            step="any"
            required
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            className="num w-20 bg-transparent text-right"
          />
        </span>
      </label>

      <label htmlFor="cashChain" className="mt-3 flex items-center justify-between gap-4">
        <span>To</span>
        <select
          id="cashChain"
          value={destination.domain}
          onChange={(e) => setDestination(DESTINATIONS.find((d) => d.domain === Number(e.target.value))!)}
          className="field"
        >
          {DESTINATIONS.map((d) => (
            <option key={d.domain} value={d.domain}>
              {d.name}
            </option>
          ))}
        </select>
      </label>

      <label htmlFor="cashAddress" className="mt-3 block">
        Address there
      </label>
      <input
        id="cashAddress"
        required
        value={address}
        onChange={(e) => setAddress(e.target.value.trim())}
        spellCheck={false}
        className="field num mt-2 block w-full text-sm"
      />

      <p className="mt-4 text-sm text-muted">
        {feeError
          ? "Circle isn’t quoting a delivery fee right now."
          : fee === undefined
            ? "Asking Circle what delivery costs…"
            : amount > fee
              ? `Circle charges ${cents(fee)} to deliver it, so ${cents(amount - fee)} arrives.`
              : `Delivery costs ${cents(fee)}, so send more than that.`}
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-4">
        <button type="submit" disabled={!ready || step !== null} className="btn btn-primary">
          {step ?? `Send to ${destination.name}`}
        </button>
        {step === null && (
          <button type="button" onClick={onClose} className="link">
            Not now
          </button>
        )}
      </div>
      {error && <p className="note note-bad mt-4 text-sm">{error}</p>}
    </form>
  );
}
