"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import type { CoverPlan } from "@/lib/hedge/plan";
import { cents, day, percent, usd } from "@/lib/format";
import { offerPrice, quoteCover } from "@/lib/hedge/quote";
import { hasAllowance, useAccount } from "./account";
import type { Purchase } from "./Bought";
import { Buy } from "./Buy";
import { useLiveLegs } from "./liveLegs";
import { Standing } from "./Standing";

type Props = {
  plan: CoverPlan;
  coverRatio: number;
  /** A price for the cover level just chosen is on its way, so the figures shown are the old ones. */
  repricing: boolean;
  onCoverChange: (ratio: number) => void;
  onBought: (receipt: Omit<Purchase, "plan">) => void;
};

const MIN_COVER = 10;
const STEP = 5;

/** The quote, as a ticket under the awning: what the cover pays, what it costs, how much of the loss to cover, and the way to buy it. */
export function Receipt({ plan: priced, coverRatio, repricing, onCoverChange, onBought }: Props) {
  const { account } = useAccount();
  // The quote arrives priced by the server; from then on it follows Gemini's own feed. Only a price
  // that can be bought at once is taken from the feed, because a resting price also leans on the forecast.
  const feed = useLiveLegs(priced.coverage.legs);
  const fromFeed = feed.live ? quoteCover({ ...priced.coverage, legs: feed.legs }, priced.exposure.lossUsd, coverRatio) : null;
  const live = fromFeed?.now != null && priced.quote.now !== null && !repricing;
  const plan = live ? { ...priced, coverage: { ...priced.coverage, legs: feed.legs }, quote: fromFeed! } : priced;
  const { quote, coverage, market, exposure, forecast } = plan;
  const price = offerPrice(quote)?.pricing ?? null;
  // When the market sees the event as near-certain, cover costs what it pays and isn't worth buying.
  const worthIt = price !== null && price.total < quote.payout;
  const cover = Math.round(coverRatio * 100);
  // The pool sells only what it can lock in full, so a thin pool caps how much of a loss it can take on.
  const free = account?.pool.free ?? Infinity;
  const backable = Math.min(100, Math.floor(((free / exposure.lossUsd) * 100) / STEP) * STEP);
  const most = Math.max(MIN_COVER, backable);

  return (
    <section aria-label="Cover" className="ticket">
      <div aria-hidden className="valance" />
      <div className="p-5 sm:p-7">
        <p className="flex items-center justify-between gap-4 text-sm text-muted">
          <span className="num">{day(market.startsAt ?? market.expiresAt)}</span>
          {/* Up here it can come and go as the feed does without moving a line of the quote. */}
          {live && <span className="status status-good status-live">Live price</span>}
        </p>
        {/* The two figures a quote comes down to, side by side where there is room for both. */}
        <div className="mt-5 grid gap-x-8 gap-y-6 sm:grid-cols-2">
          <h2>
            <span className="block text-sm text-muted">Pays</span>
            <span className="figure mt-1 block">{usd(quote.payout)}</span>
            <span className="mt-2 block text-pretty">if {coverage.pays}</span>
          </h2>
          {price && (
            <div aria-busy={repricing} className={`transition-opacity ${repricing ? "opacity-40" : ""}`}>
              <p>
                <span className="block text-sm text-muted">Costs</span>
                <span className="figure mt-1 block">{cents(price.total)}</span>
              </p>
              <dl className="mt-2 text-sm text-muted">
                {quote.marketOdds !== null && (
                  <div>
                    <dt className="inline">The market&rsquo;s odds </dt>
                    <dd className="num inline text-fg">{percent(quote.marketOdds)}</dd>
                  </div>
                )}
                {forecast && (
                  <div>
                    <dt className="inline">A weather model&rsquo;s </dt>
                    <dd className="num inline text-fg">{percent(forecast.odds)}</dd>
                  </div>
                )}
              </dl>
            </div>
          )}
        </div>
        {!price && <p className="note note-bad mt-6">Nobody is selling this on Gemini right now, so there is no price. Try a day closer to today.</p>}

        {price && (
          <div className="mt-6">
            <label htmlFor="cover" className="flex items-baseline justify-between gap-4 text-[0.9375rem]">
              <span className="text-muted">Cover</span>
              <span>
                <span className="num">{percent(coverRatio)}</span> of your {usd(exposure.lossUsd)} loss
              </span>
            </label>
            <input
              id="cover"
              type="range"
              min={MIN_COVER}
              max={most}
              step={STEP}
              value={Math.min(cover, most)}
              onChange={(e) => onCoverChange(Number(e.target.value) / 100)}
              className="range mt-1"
              style={{ "--fill": `${most === MIN_COVER ? 100 : ((Math.min(cover, most) - MIN_COVER) / (most - MIN_COVER)) * 100}%` } as CSSProperties}
            />
          </div>
        )}

        {!price ? null : !worthIt ? (
          <>
            <p className="note mt-5">
              The market sees this as near certain, so cover costs as much as it pays.{" "}
              {exposure.recurring ? "Your agent can watch it and buy on the days it’s worth it." : "Try a threshold less likely to be hit."}
            </p>
            {/* Today’s price says nothing about a normal day, so the cap starts from the size of the loss instead. */}
            {exposure.recurring && <Standing plan={plan} coverRatio={coverRatio} price={quote.payout * 0.15} alone />}
            {exposure.recurring && account && !hasAllowance(account) && (
              <Link href="/agent" className="btn btn-secondary mt-3 w-full">
                Set up your agent to watch it
              </Link>
            )}
          </>
        ) : backable < MIN_COVER ? (
          <p className="note mt-5">
            The pool has {usd(Math.floor(free))} free right now, too little to back this cover. It grows as backers add to it and as cover expires.
          </p>
        ) : cover > backable ? (
          <div className="note mt-5">
            <p>
              The pool has {usd(Math.floor(free))} free right now, so it can back {backable}% of this loss.
            </p>
            <button type="button" onClick={() => onCoverChange(backable / 100)} className="btn btn-secondary mt-3">
              Cover {backable}%
            </button>
          </div>
        ) : (
          <div inert={repricing} className={`transition-opacity ${repricing ? "opacity-40" : ""}`}>
            <Buy plan={plan} coverRatio={coverRatio} onBought={onBought} />
          </div>
        )}

        <details className="mt-6 border-t border-line pt-4 text-sm text-muted">
          <summary className="cursor-pointer select-none transition-colors hover:text-fg">The small print</summary>
          <p className="mt-3">
            Priced on Gemini&rsquo;s &ldquo;{market.title.replace(/\?$/, "")}&rdquo;
            {price && `, including about ${cents(price.fees)} in exchange fees`}.
            {forecast && ` Your agent paid ${cents(forecast.paid)} for the ${forecast.members}-run forecast.`}
          </p>
          <p className="mt-3">The pool hedges it on Gemini with {quote.contracts.toLocaleString("en-US")} contracts of each:</p>
          <ul className="num mt-1.5 space-y-0.5">
            {coverage.legs.map((leg) => (
              <li key={leg.symbol}>
                {leg.side === "yes" ? "Yes" : "No"} on &ldquo;{leg.label}&rdquo;
              </li>
            ))}
          </ul>
        </details>
      </div>
    </section>
  );
}
