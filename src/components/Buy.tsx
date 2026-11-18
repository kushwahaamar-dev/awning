"use client";

import { useEffect, useState } from "react";
import type { Address } from "viem";
import type { BlockReason } from "@/lib/chain/config";
import { signApproval } from "@/lib/chain/device";
import type { CoverTerms } from "@/lib/covers/service";
import { cents, usd } from "@/lib/format";
import { offerPrice } from "@/lib/hedge/quote";
import type { CoverPlan } from "@/lib/hedge/plan";
import { plain, REFUSAL } from "@/lib/words";
import { AllowanceForm, fundAndSetUp } from "./AllowanceForm";
import type { Purchase } from "./Bought";
import { Lock, Mic } from "./icons";
import { Standing } from "./Standing";
import { hasAllowance, post, useAccount, type Account } from "./account";
import type { Voice } from "./voice";

type Opened = { status: "open"; txHash: string } | { status: "blocked"; reason: BlockReason; txHash: string };
type Props = {
  plan: CoverPlan;
  coverRatio: number;
  onBought: (receipt: Omit<Purchase, "plan">) => void;
  /** The microphone, for a visitor who would sooner say it than press it. */
  voice?: Voice;
  /** Told what pressing the button would do right now, so the same thing can be done by voice; null while there is nothing to press. */
  onReady?: (act: (() => void) | null) => void;
  /** Told, in the words on screen, when a purchase is refused, fails, or needs the owner's go-ahead (`asks`). */
  onNotice?: (text: string, asks?: boolean) => void;
};
type Pricing = NonNullable<ReturnType<typeof offerPrice>>["pricing"];

// What the ticket says when a purchase doesn't go straight through. Written once, because it is also said aloud.
const REFUSED = "Your allowance refused this.";
const why = (reason: BlockReason) => `The agent asked for the premium, but ${REFUSAL[reason]}. Nothing was spent.`;
const goAhead = (premium: number, threshold: number) =>
  `${cents(premium)} is above the ${usd(threshold)} you asked to approve yourself, so the agent needs your go-ahead.`;

/**
 * The microphone beside the button. What it hears is taken as an answer to the quote.
 * @param word what to say to do what the button beside it does
 */
function Talk({ voice, busy, word, className = "" }: { voice: Voice; busy: boolean; word: string; className?: string }) {
  const recording = voice.state === "recording";
  return (
    <button
      type="button"
      onClick={recording ? voice.stop : voice.start}
      disabled={busy || voice.state === "transcribing"}
      aria-pressed={recording}
      className={`btn btn-lg ${recording ? "btn-recording" : "btn-secondary"} ${className}`}
    >
      <Mic />
      {{ idle: `Say “${word}”`, recording: "Stop, I’m done", transcribing: "Listening back…" }[voice.state]}
    </button>
  );
}

/** The buy button, the first-time setup, the approval step for large premiums, and what the mandate said. */
export function Buy(props: Props) {
  const { owner, account } = useAccount();
  const price = offerPrice(props.plan.quote)?.pricing ?? null;
  if (!owner || !account || !price) return null;
  return <Counter {...props} owner={owner} account={account} price={price} />;
}

/** The same, once there is an account to buy for and a price to buy at. */
function Counter({ plan, coverRatio, onBought, voice, onReady, onNotice, owner, account, price }: Props & { owner: Address; account: Account; price: Pricing }) {
  const { refresh } = useAccount();
  const [step, setStep] = useState<string | null>(null);
  // A first purchase sets up the allowance on its way. It goes on looking like a first purchase until it is done,
  // so the words under the button don't change while it is working.
  const [first, setFirst] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [pending, setPending] = useState<CoverTerms | null>(null);
  const [refused, setRefused] = useState<BlockReason | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { quote } = plan;
  const busy = step !== null;
  const { setup, allowance } = account;

  async function run(first: string, work: () => Promise<void>) {
    // The microphone may still be open for an answer. Pressing the button is the answer.
    voice?.cancel();
    setStep(first);
    setError(null);
    setRefused(null);
    try {
      await work();
    } catch (e) {
      const message = plain(e);
      setError(message);
      onNotice?.(message);
    } finally {
      setStep(null);
    }
  }

  async function open(terms: CoverTerms, signature: string | null) {
    const result = await post<Opened>(`/api/covers/${terms.id}/open`, { deadline: terms.deadline, signature });
    await refresh();
    setPending(null);
    if (result.status === "blocked") {
      setRefused(result.reason);
      onNotice?.(`${REFUSED} ${why(result.reason)}`);
    } else onBought({ premium: terms.premium, payout: terms.maxPayout, txHash: result.txHash });
  }

  async function buy() {
    // Asking for terms has the pool lock the payout, so the money is there before any premium moves.
    const terms = await post<CoverTerms>("/api/covers/quote", { owner, exposure: plan.exposure, coverRatio });
    // Within the allowance the agent just acts. Above the amount the owner set it has to come back and ask.
    if (terms.needsApproval) {
      setPending(terms);
      onNotice?.(goAhead(terms.premium, allowance.approvalThreshold), true);
    } else await open(terms, null);
  }

  const start = () => run("Locking your payout…", buy);
  const approve = () =>
    run("Placing cover…", async () => {
      if (pending) await open(pending, await signApproval(pending));
    });
  // A first purchase: test dollars, a vault, limits to fit, and then the cover, without leaving the quote.
  const setUpAndBuy = async () => {
    setFirst(true);
    await run("Setting up your agent…", async () => {
      await fundAndSetUp(owner, setup, price.total, setStep);
      await refresh();
      setStep("Locking your payout…");
      await buy();
    });
    setFirst(false);
  };

  const settingUp = !hasAllowance(account) || first;
  // What the button on screen would do if it were pressed now: the one thing a spoken "cover it" is allowed to do.
  // Nothing while a purchase is already under way, or while the limits are being chosen by hand.
  const act = busy || (settingUp && choosing && !pending) ? null : pending ? approve : settingUp ? setUpAndBuy : start;
  useEffect(() => {
    onReady?.(act);
    return () => onReady?.(null);
  });

  // Beside the buy button it shares the row, and on a phone takes a row of its own, as wide as the button above it.
  const talk = voice?.enabled && <Talk voice={voice} busy={busy} word="cover it" className="grow" />;
  const problems = (
    <>
      {refused && (
        <p role="alert" className="note note-bad mt-4 text-sm">
          <span className="text-fg">{REFUSED}</span> {why(refused)}
        </p>
      )}
      {(error ?? voice?.error) && (
        <p role="alert" className="note note-bad mt-4 text-sm break-words">
          {error ?? voice?.error}
        </p>
      )}
    </>
  );

  if (pending) {
    return (
      <div className="mt-6 border-t border-line pt-5">
        <p>{goAhead(pending.premium, allowance.approvalThreshold)}</p>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          <button type="button" onClick={approve} disabled={busy} aria-busy={busy} className="btn btn-lg btn-primary">
            {step ?? `Approve ${cents(pending.premium)}`}
          </button>
          {voice?.enabled && <Talk voice={voice} busy={busy} word="approve" />}
          <button type="button" onClick={() => setPending(null)} disabled={busy} className="link">
            Not now
          </button>
        </div>
        {problems}
      </div>
    );
  }

  if (settingUp) {
    if (choosing) {
      return (
        <div className="mt-6 border-t border-line pt-5">
          <p className="mb-5">Set your agent&rsquo;s limits, then buy.</p>
          <AllowanceForm />
        </div>
      );
    }
    return (
      <div className="mt-5">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={setUpAndBuy} disabled={busy} aria-busy={busy} className="btn btn-lg btn-primary grow">
            {step ?? `Buy cover for ${cents(price.total)}`}
          </button>
          {talk}
        </div>
        <p className="mt-3 text-sm text-muted">
          Your first cover also sets up your agent on {setup.chainName}, with test dollars and limits to fit.{" "}
          <button type="button" onClick={() => setChoosing(true)} disabled={busy} className="link">
            Set the limits yourself
          </button>
        </p>
        {problems}
      </div>
    );
  }

  const overLimit = price.total > allowance.perCoverCap;
  return (
    <div className="mt-5">
      {overLimit && (
        <p className="note mb-4 text-sm">
          This is over your {usd(allowance.perCoverCap)} limit for one cover and will be refused. Cover less, or raise the limit under Your agent.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={start} disabled={busy} aria-busy={busy} className="btn btn-lg btn-primary grow">
          {step ?? `Buy cover for ${cents(price.total)}`}
        </button>
        {talk}
      </div>
      <p className="mt-3 flex gap-2 text-sm text-muted">
        <Lock className="mt-1 size-3.5 flex-none text-fg" />
        <span>
          Your {usd(quote.payout)} is locked on {setup.chainName} before you pay.
        </span>
      </p>
      {problems}
      {/* Not offered in the middle of a purchase, where a second button would appear under the one just pressed. */}
      {!busy && <Standing plan={plan} coverRatio={coverRatio} price={price.total} />}
    </div>
  );
}
