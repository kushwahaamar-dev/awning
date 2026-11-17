"use client";

import useSWR from "swr";
import type { Proof, Trace } from "@/app/api/proof/route";
import { ago } from "@/lib/format";
import { External } from "./icons";

type Timed = Trace & { when: string };

// "How long ago" is worked out when the answer arrives, not while drawing, so a redraw can't change it.
async function fetchRefusals(url: string): Promise<Timed[]> {
  const proof: Proof = await (await fetch(url)).json();
  return (proof.refusals ?? []).map((trace) => ({ ...trace, when: ago(trace.at) }));
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
  const { data: refusals } = useSWR("/api/proof", fetchRefusals, { refreshInterval: 30_000, revalidateOnFocus: false });
  if (refusals?.length === 0) return null;
  const last = refusals?.[0] ?? WAITING;
  return (
    <p className={`mt-5 text-sm text-muted transition-opacity duration-300 ${refusals ? "" : "opacity-0"}`} aria-hidden={!refusals}>
      <span className="text-faint">On the chain, {last.when}.</span> {last.note}{" "}
      {last.receipt && (
        <a href={last.receipt} target="_blank" rel="noreferrer" className="link inline-flex items-center gap-1">
          receipt <External />
        </a>
      )}
    </p>
  );
}
