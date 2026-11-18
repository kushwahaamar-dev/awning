"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import useSWR from "swr";
import type { Proof } from "@/app/api/proof/route";
import { DESTINATIONS } from "@/lib/chain/cctp";
import { ago, cents, usd } from "@/lib/format";
import { useCities } from "./PriceMap";
import { Receipt, useProof, type TimedProof } from "./Proof";
import { quoteLink, useExamples } from "./Risks";
import { Stamp, type Picture } from "./Sketch";

/** What this deployment is really running, as the server knows it: which chain, which contracts, and which sponsors' keys are set. */
export type Running = {
  chain: string;
  local: boolean;
  /** Where each contract can be read, when the chain has an explorer. */
  mandate: string | null;
  pool: string | null;
  hedging: "paper" | "sandbox" | "live";
  streams: boolean;
  voice: boolean;
  cctp: boolean;
  forecastPrice: number;
};

// The same address and shape the cash-out form reads, so one reading serves whichever page asked first.
const fetchFee = async (url: string): Promise<number> => {
  const data = await (await fetch(url)).json();
  if (typeof data.fee !== "number") throw new Error(data.error ?? "Circle didn’t quote a fee.");
  return data.fee;
};
// The chain whose delivery fee is asked for, as proof that Circle is answering.
const [QUOTED] = DESTINATIONS;
const REACHES = new Intl.ListFormat("en-GB", { type: "disjunction" }).format(DESTINATIONS.map((chain) => chain.name));

// Until an answer has come a row keeps its room and says nothing, so it never says "not yet" about something that has happened.
const WAITING = <span className="invisible">Reading</span>;
const QUIET = <span className="text-faint">Gemini isn&rsquo;t answering right now</span>;
const NOT_YET = <span className="text-faint">Not run on this chain yet</span>;

/** One line of a sponsor's table. The label is short and never wraps; whatever is long is on the right, and wraps there. */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-6 py-2.5">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 text-right break-words">{children}</dd>
    </div>
  );
}

/** One sponsor's technology: its name beside the rows that say what Awning does with it. */
function Part({ stamp, name, children }: { stamp: Picture; name: string; children: ReactNode }) {
  return (
    <section className="split mt-14">
      <h2 className="heading flex items-center gap-4">
        <Stamp of={stamp} />
        {name}
      </h2>
      <dl className="rows border-y border-line">{children}</dl>
    </section>
  );
}

/**
 * The last time something really happened, how long ago, and where to check it.
 * @param joined what goes between what happened and how long ago
 */
function Evidence({ of, proof, joined = ", " }: { of: keyof Proof["evidence"]; proof: TimedProof | undefined; joined?: string }) {
  if (!proof) return WAITING;
  const last = proof.evidence[of];
  if (!last) return NOT_YET;
  return (
    <>
      {last.note}
      {joined}
      <span className="whitespace-nowrap">{last.when}</span> <Receipt href={last.receipt} />
    </>
  );
}

/** A contract by its name, linked to where it can be read when the chain has an explorer. */
function Contract({ href, children }: { href: string | null; children: string }) {
  if (!href) return children;
  return (
    <a href={href} target="_blank" rel="noreferrer" className="link">
      {children}
    </a>
  );
}

/**
 * For whoever has to check that a sponsor's technology is really used: each one, what Awning does with it, and
 * the latest real transaction, order or event behind that, read as the page opens. What a sponsor's row says
 * follows the keys this deployment has; a sponsor that isn't switched on is said to be off, or left out.
 */
export function ProofPage({ running }: { running: Running }) {
  const proof = useProof();
  const examples = useExamples();
  const cities = useCities();
  const { data: fee, error: noFee } = useSWR(running.cctp ? `/api/cashout?to=${QUOTED.domain}` : null, fetchFee, { revalidateOnFocus: false });
  const example = examples?.[0];
  const refusal = proof?.refusals[0];

  return (
    <div className="pt-8 sm:pt-14">
      <h1 className="sign">What is really running</h1>
      <p className="lede mt-3">Each line is read from this deployment as the page opens, with a receipt wherever the chain keeps one.</p>

      <Part stamp="price" name="Gemini Prediction Markets">
        <Row label="Cities priced">
          {!cities ? (
            WAITING
          ) : cities.items.length === 0 ? (
            QUIET
          ) : (
            <>
              {/* Prices from before Gemini went quiet are said to be that old, not passed off as this minute's. */}
              {cities.items.filter((city) => city.example).length} of {cities.items.length}
              {cities.asOf ? `, as of ${ago(cities.asOf)}` : " now"}.{" "}
              <Link href="/#prices" className="link">
                See the map
              </Link>
            </>
          )}
        </Row>
        <Row label="Odds over time">
          <Evidence of="prices" proof={proof} joined=", the oldest " />
        </Row>
        <Row label="From contracts like">{!examples ? WAITING : example ? <span className="num">{example.legs[0].symbol}</span> : QUIET}</Row>
        <Row label="Prices on a quote">
          Live over Gemini&rsquo;s WebSocket.{" "}
          {example && (
            <Link href={quoteLink(example)} className="link">
              Open a quote
            </Link>
          )}
        </Row>
        {running.hedging !== "paper" && (
          <Row label="The pool’s hedge">
            <Evidence of="hedge" proof={proof} />
          </Row>
        )}
      </Part>

      <Part stamp="lock" name={running.local ? "The contracts" : "Arc"}>
        <Row label="Runs on">{running.chain[0].toUpperCase() + running.chain.slice(1)}</Row>
        <Row label="The agent’s limits">
          <Contract href={running.mandate}>AwningMandate</Contract>
        </Row>
        <Row label="The cover pool">
          <Contract href={running.pool}>AwningPool</Contract>, an ERC-4626 vault
        </Row>
        <Row label="Locks the payout">
          <Evidence of="locked" proof={proof} />
        </Row>
        <Row label="Takes the premium">
          <Evidence of="premium" proof={proof} />
        </Row>
        <Row label="Settles the cover">
          <Evidence of="settled" proof={proof} />
        </Row>
        <Row label="Covers written">{proof ? `${proof.counts.covers}, with ${usd(proof.counts.paidOut)} paid out` : WAITING}</Row>
        <Row label="Refused so far">{proof ? `${proof.counts.refusals} times, by the mandate` : WAITING}</Row>
        <Row label="Last refusal">
          {!proof ? (
            WAITING
          ) : !refusal ? (
            NOT_YET
          ) : (
            <>
              {refusal.note} <span className="whitespace-nowrap">{refusal.when[0].toUpperCase() + refusal.when.slice(1)}.</span> <Receipt href={refusal.receipt} />
            </>
          )}
        </Row>
        <Row label="Tested by">126 contract tests</Row>
      </Part>

      <Part stamp="paid" name="x402">
        <Row label="The agent buys">A forecast, to check the market&rsquo;s price against</Row>
        <Row label="Each request costs">{cents(running.forecastPrice)} in USDC</Row>
        <Row label="Last payment">
          <Evidence of="forecast" proof={proof} />
        </Row>
      </Part>

      <Part stamp="awning" name="Circle CCTP">
        {running.cctp ? (
          <>
            <Row label="Sends a payout to">{REACHES}</Row>
            <Row label="Circle’s fee now">
              {fee !== undefined ? `${cents(fee)} to ${QUOTED.name}` : noFee ? <span className="text-faint">Circle isn&rsquo;t quoting right now</span> : WAITING}
            </Row>
            <Row label="Try it">
              <Link href="/agent" className="link">
                Send money out, on the agent page
              </Link>
            </Row>
          </>
        ) : (
          <Row label="Sends a payout to">Another chain, from Arc testnet only</Row>
        )}
      </Part>

      <Part stamp="week" name="QuickNode Streams">
        {running.streams ? (
          <Row label="Delivers each event">
            <Evidence of="stream" proof={proof} joined=", the last " />
          </Row>
        ) : (
          <Row label="Contract events">Read from the chain&rsquo;s own logs here</Row>
        )}
      </Part>

      {running.voice && (
        <Part stamp="say" name="ElevenLabs">
          <Row label="Hears the bad day">Scribe, speech to text</Row>
          <Row label="Reads the price back">Flash, text to speech</Row>
          <Row label="Try it">
            <Link href="/app" className="link">
              Say it, on Get cover
            </Link>
          </Row>
        </Part>
      )}
    </div>
  );
}
