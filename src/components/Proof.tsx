"use client";

import useSWR from "swr";
import type { Proof, Trace } from "@/app/api/proof/route";
import { ago } from "@/lib/format";
import { External } from "./icons";

export type Timed = Trace & { when: string };
export type TimedProof = { refusals: Timed[]; evidence: Partial<Record<keyof Proof["evidence"], Timed>>; counts: Proof["counts"] };

// "How long ago" is worked out when the answer arrives, not while drawing, so a redraw can't change it.
async function fetchProof(url: string): Promise<TimedProof> {
  const res = await fetch(url);
  // A reading that failed is no reading. Nothing is shown for it, where a nought would say "this never happened".
  if (!res.ok) throw new Error(`The proof could not be read (${res.status})`);
  const proof: Proof = await res.json();
  const timed = (trace: Trace): Timed => ({ ...trace, when: ago(trace.at) });
  return {
    refusals: proof.refusals.map(timed),
    evidence: Object.fromEntries(Object.entries(proof.evidence).map(([step, trace]) => [step, timed(trace)])),
    counts: proof.counts,
  };
}

/** What has really happened on the chain so far. Undefined until it has been read. The landing page and the proof page share the one reading. */
export const useProof = () => useSWR("/api/proof", fetchProof, { refreshInterval: 30_000, revalidateOnFocus: false }).data;

/** The way to where something on the chain can be checked. Nothing where the chain has no explorer. */
export function Receipt({ href }: { href: string | null }) {
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noreferrer" className="link inline-flex items-center gap-1">
      receipt <External />
    </a>
  );
}

// The test on the agent page leaves refusals like this one, so it stands in for the real thing, unseen, until the chain has answered.
const WAITING: Timed = {
  at: "",
  receipt: null,
  when: "00 hours ago",
  note: "An agent tried to pay $1,987.15 to 0x9fE4…a6e0. Refused: it’s over its owner’s limit for a single cover.",
};

/** The last thing the contract said no to, read from the chain: the claim above it, with a receipt. */
export function LastRefusal() {
  const refusals = useProof()?.refusals;
  if (refusals?.length === 0) return null;
  const last = refusals?.[0] ?? WAITING;
  return (
    <p className={`mt-5 text-sm text-muted transition-opacity duration-300 ${refusals ? "" : "opacity-0"}`} aria-hidden={!refusals}>
      <span className="text-faint">On the chain, {last.when}.</span> {last.note} <Receipt href={last.receipt} />
    </p>
  );
}
