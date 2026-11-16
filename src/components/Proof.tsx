"use client";

import useSWR from "swr";
import type { Proof, Trace } from "@/app/api/proof/route";
import { ago } from "@/lib/format";
import { External } from "./icons";

type Timed = Trace & { when: string };
type TimedProof = { refusals: Timed[]; steps: Partial<Record<keyof Proof["steps"], Timed>> };

// "How long ago" is worked out when the answer arrives, not while drawing, so a redraw can't change it.
async function fetchProof(url: string): Promise<TimedProof> {
  const proof: Proof = await (await fetch(url)).json();
  const timed = (trace: Trace) => ({ ...trace, when: ago(trace.at) });
  return {
    refusals: (proof.refusals ?? []).map(timed),
    steps: Object.fromEntries(Object.entries(proof.steps ?? {}).map(([step, trace]) => [step, timed(trace)])),
  };
}

const useProof = () => useSWR("/api/proof", fetchProof, { refreshInterval: 30_000, revalidateOnFocus: false }).data;

function Receipt({ href }: { href: string | null }) {
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noreferrer" className="link inline-flex items-center gap-1 text-xs">
      receipt <External />
    </a>
  );
}

/** What the contract last said no to, read from the chain: the claim above it, with receipts. */
export function RecentRefusals({ chain }: { chain: string }) {
  const proof = useProof();
  if (!proof?.refusals.length) return null;
  return (
    <div className="mt-10">
      <h3 className="title">The last things the contract refused on {chain}</h3>
      <ol className="rows mt-4 border-y border-line">
        {proof.refusals.map((refusal) => (
          <li key={refusal.at + refusal.note} className="grid gap-x-6 gap-y-1 py-3.5 sm:grid-cols-[6.5rem_minmax(0,1fr)_auto] sm:items-baseline">
            <span className="text-xs text-faint">{refusal.when}</span>
            <span className="text-soft">{refusal.note}</span>
            <Receipt href={refusal.receipt} />
          </li>
        ))}
      </ol>
    </div>
  );
}

/** One cover's path, step by step, each with the last time that step really ran. */
export function Path({ steps }: { steps: { title: string; body: string; made: string[] }[] }) {
  const proof = useProof();
  return (
    <ol className="rows border-y border-line">
      {steps.map(({ title, body, made }) => {
        const last = proof?.steps[title as keyof Proof["steps"]];
        return (
          <li key={title} className="grid items-baseline gap-x-8 gap-y-1 py-5 sm:grid-cols-[6rem_minmax(0,1fr)_minmax(0,17.5rem)]">
            <h3 className="text-lg font-[560]">{title}</h3>
            <p className="text-lg text-muted">{body}</p>
            <div className="sm:text-right">
              <p className="num text-sm text-soft">{made.join(" + ")}</p>
              {last && (
                <p className="mt-1 text-xs text-faint">
                  Last: {last.note}, <span className="whitespace-nowrap">{last.when}</span> <Receipt href={last.receipt} />
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
