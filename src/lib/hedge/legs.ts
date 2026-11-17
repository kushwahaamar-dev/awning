import type { Contract, Market } from "../gemini/market";
import type { Trigger } from "./exposure";

export type Leg = {
  symbol: string;
  label: string;
  side: "yes" | "no";
  bid: number | null;
  ask: number | null;
  postOnly: boolean;
  tick: number;
};

export type Coverage = {
  legs: Leg[];
  /** Completes the sentence "Pays if …". */
  pays: string;
  /** Set when the market's steps forced the cover to start somewhere other than the user's threshold. */
  snappedTo: number | null;
};

const cents = (n: number) => Math.round(n * 100) / 100;

function leg(contract: Contract, side: Leg["side"]): Leg {
  const { yesBid, yesAsk } = contract;
  return {
    symbol: contract.symbol,
    label: contract.label,
    side,
    // Selling a Yes at the bid is the same trade as buying a No, so the No book is the Yes book mirrored.
    bid: side === "yes" ? yesBid : yesAsk === null ? null : cents(1 - yesAsk),
    ask: side === "yes" ? yesAsk : yesBid === null ? null : cents(1 - yesBid),
    postOnly: contract.postOnly,
    tick: contract.tick,
  };
}

function nearest(values: number[], target: number, preferHigher: boolean): number | null {
  let best: number | null = null;
  for (const v of values) {
    if (best === null) best = v;
    const closer = Math.abs(v - target) < Math.abs(best - target);
    const tie = Math.abs(v - target) === Math.abs(best - target) && (preferHigher ? v > best : v < best);
    if (closer || tie) best = v;
  }
  return best;
}

type Ranged = { contract: Contract; lo: number | null; hi: number | null };

function ranged(market: Market): Ranged[] {
  return market.contracts.flatMap((contract) =>
    contract.outcome.kind === "range" ? [{ contract, lo: contract.outcome.lo, hi: contract.outcome.hi }] : [],
  );
}

function subjectName({ subject }: Market) {
  if (subject.family === "temperature") return `${subject.city}’s high`;
  if (subject.family === "price") return subject.name.replace(/^Oil \((.+)\)$/, "$1 oil");
  return "the result";
}

function format(value: number, unit: Market["unit"]) {
  return unit === "$" ? `$${value.toLocaleString("en-US")}` : `${value}${unit ?? ""}`;
}

/** Buckets where exactly one resolves Yes: buy Yes on every bucket inside the trigger region. */
function coverPartition(market: Market, direction: "above" | "below", threshold: number): Coverage | null {
  const buckets = ranged(market);
  const edges = buckets.flatMap((b) => (direction === "below" ? b.hi : b.lo) ?? []);
  // On a tie, start cover on the side that protects more of the user's range.
  const edge = nearest(edges, threshold, direction === "below");
  if (edge === null) return null;

  const inside = buckets
    .filter((b) => (direction === "below" ? b.hi !== null && b.hi <= edge : b.lo !== null && b.lo >= edge))
    .sort((a, b) => (a.lo ?? -Infinity) - (b.lo ?? -Infinity));
  return {
    legs: inside.map((b) => leg(b.contract, "yes")),
    pays: `${subjectName(market)} is ${format(edge, market.unit)} or ${direction === "below" ? "below" : "above"}`,
    snappedTo: edge === threshold ? null : edge,
  };
}

/** Nested "X or above" strikes: one contract does the job, Yes for a rise and No for a fall. */
function coverLadder(market: Market, direction: "above" | "below", threshold: number): Coverage | null {
  const strikes = ranged(market).filter((b) => b.lo !== null && b.hi === null);
  const strike = nearest(strikes.map((b) => b.lo!), threshold, direction === "below");
  if (strike === null) return null;

  const contract = strikes.find((b) => b.lo === strike)!.contract;
  return {
    legs: [leg(contract, direction === "above" ? "yes" : "no")],
    pays:
      direction === "above"
        ? `${subjectName(market)} is at ${format(strike, "$")} or above`
        : `${subjectName(market)} is below ${format(strike, "$")}`,
    snappedTo: strike === threshold ? null : strike,
  };
}

function coverGame(market: Market, team: string, outcome: "wins" | "loses"): Coverage | null {
  const wanted = team.toLowerCase();
  const contract = market.contracts.find(
    (c) =>
      c.outcome.kind === "team" &&
      (c.outcome.team.toLowerCase().includes(wanted) || c.outcome.abbreviation.toLowerCase() === wanted),
  );
  if (!contract || contract.outcome.kind !== "team") return null;

  // A No on the team pays on a loss or a tie, which is what "they didn't win" costs the user.
  return outcome === "wins"
    ? { legs: [leg(contract, "yes")], pays: `the ${contract.outcome.team} win`, snappedTo: null }
    : { legs: [leg(contract, "no")], pays: `the ${contract.outcome.team} don’t win`, snappedTo: null };
}

export function buildCoverage(market: Market, trigger: Trigger): Coverage | null {
  if (trigger.family === "game") {
    return market.structure === "moneyline" ? coverGame(market, trigger.team, trigger.outcome) : null;
  }
  if (market.structure === "partition") return coverPartition(market, trigger.direction, trigger.threshold);
  if (market.structure === "ladder") return coverLadder(market, trigger.direction, trigger.threshold);
  return null;
}
