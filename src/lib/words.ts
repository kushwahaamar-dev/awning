import type { BlockReason } from "./chain/config";
import { cents, shortAddress, usd } from "./format";

/** The risk shown in an empty box, wherever someone is asked to describe theirs. */
export const EXAMPLE_RISK = "If it’s too cold to sit outside tomorrow, my patio is out $300…";

/** Why the mandate refused, completing the sentence "…, but ___". */
export const REFUSAL: Record<BlockReason, string> = {
  Paused: "the agent is paused",
  Expired: "the allowance has run out",
  VenueNotAllowed: "that address isn’t on your approved list",
  OverPerHedgeCap: "it’s over your limit for a single cover",
  OverPeriodCap: "it would go over your monthly limit",
  OverDailyFloat: "it’s over today’s data budget",
  ApprovalRequired: "it needed your approval and didn’t have it",
  ApprovalExpired: "your approval had expired",
  InsufficientBalance: "there isn’t enough in your vault",
};

type Args = Record<string, string | number | boolean>;

/** One mandate event as a sentence the owner can read. */
export function describeEvent(kind: string, a: Args): { text: string; refused?: boolean } {
  const money = (key: string) => cents(a[key] as number);
  switch (kind) {
    case "Deposited":
      return { text: `You added ${money("amount")} to your vault.` };
    case "Withdrawn":
      return { text: `You took ${money("amount")} out of your vault.` };
    case "PolicySet":
      return {
        text: `You set the agent’s limits: ${usd(a.floatDailyCap as number)} a day for data, ${usd(a.premiumPerHedgeCap as number)} per cover, ${usd(a.premiumPeriodCap as number)} a month, and your approval above ${usd(a.approvalThreshold as number)}.`,
      };
    case "VenueSet":
      return { text: a.allowed ? `You approved ${shortAddress(a.venue as string)} to receive premiums.` : `You removed ${shortAddress(a.venue as string)} from your approved list.` };
    case "PausedSet":
      return { text: a.paused ? "You paused the agent." : "You let the agent resume." };
    case "FloatDrawn":
      return { text: `The agent drew ${money("amount")} for data, ${money("drawnToday")} so far today.` };
    case "Offered":
      return { text: `The pool locked ${money("payout")} to back cover it offered you for ${money("premium")}.` };
    case "HedgeOpened":
      return { text: `The agent paid a ${money("premium")} premium for cover worth up to ${money("maxPayout")}, ${a.ownerApproved ? "with your approval" : "within its allowance"}.` };
    case "Rejected":
      return { text: `The pool sent back ${money("refunded")} it was paid for cover it never offered.` };
    case "ClaimedUnresolved":
      return { text: `No result was reported in time, so the pool paid ${money("payout")} into your vault.` };
    case "HedgeClosed":
      if (a.outcome === "Paid") return { text: `Cover paid ${money("payout")} into your vault.` };
      if (a.outcome === "Refunded") return { text: `${money("payout")} of premium came back to your vault.` };
      return { text: "A cover ended without paying out." };
    case "Blocked": {
      const tried = a.action === "DrawFloat" ? `draw ${money("amount")} for data` : `pay ${money("amount")} to ${shortAddress(a.counterparty as string)}`;
      return { text: `Refused. The agent tried to ${tried}, but ${REFUSAL[a.reason as BlockReason]}.`, refused: true };
    }
    default:
      return { text: kind };
  }
}
