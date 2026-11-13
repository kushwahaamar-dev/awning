"use client";

import type { CSSProperties } from "react";
import type { CoverPlan } from "@/lib/hedge/plan";
import { cents, day, percent, usd } from "@/lib/format";
import { offerPrice } from "@/lib/hedge/quote";
import { Buy } from "./Buy";
import { Mark } from "./Logo";

type Props = {
  plan: CoverPlan;
  coverRatio: number;
  onCoverChange: (ratio: number) => void;
  onBought: () => void;
};

const MIN_COVER = 10;

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-6 py-2.5 ${strong ? "text-fg" : "text-muted"}`}>
      <dt>{label}</dt>
      <dd className={`num ${strong ? "text-xl font-medium text-accent" : "text-soft"}`}>{value}</dd>
    </div>
  );
}

/** The quote: what the cover pays, what it costs, how much of the loss to cover, and the way to buy it. */
export function Receipt({ plan, coverRatio, onCoverChange, onBought }: Props) {
  const { quote, coverage, market, exposure, forecast } = plan;
  const price = offerPrice(quote)?.pricing ?? null;
  // When the market sees the event as near-certain, cover costs what it pays and isn't worth buying.
  const worthIt = price !== null && price.total < quote.payout;
  const cover = Math.round(coverRatio * 100);

  return (
    <section aria-label="Cover" className="panel p-6 sm:p-7">
      <p className="flex items-center justify-between text-sm text-muted">
        <span className="flex items-center gap-2">
          <Mark className="size-4 text-accent" />
          Cover
        </span>
        <span className="num">{day(market.startsAt ?? market.expiresAt)}</span>
      </p>
      <h2 className="title mt-5 text-[1.375rem]">
        Pays {usd(quote.payout)} if {coverage.pays}
      </h2>
      <p className="mt-2 text-sm text-muted">On Gemini&rsquo;s &ldquo;{market.title.replace(/\?$/, "")}&rdquo;</p>

      <dl className="rows mt-5 border-y border-line">
        {quote.marketOdds !== null && <Line label="The market's odds it happens" value={percent(quote.marketOdds)} />}
        {forecast && <Line label="A weather model's odds" value={percent(forecast.odds)} />}
        {price && (
          <>
            <Line label="What this cover costs" value={cents(price.total)} strong />
            <Line label="If it happens, you're up" value={cents(quote.payout - price.total)} />
            <Line label="If it doesn't, you're out" value={cents(price.total)} />
          </>
        )}
      </dl>
      {price ? (
        <p className="mt-3 text-xs text-faint">
          The cost is Gemini&rsquo;s price for this, including an estimated {cents(price.fees)} in exchange fees.
          {forecast && ` Your agent paid ${cents(forecast.paid)} for a ${forecast.members}-run forecast to check the price against.`}
        </p>
      ) : (
        <p className="note note-bad mt-4">Nobody is quoting this market right now, so there is no price to show. Check back closer to the date.</p>
      )}

      <div className="mt-6">
        <label htmlFor="cover" className="flex items-baseline justify-between text-sm">
          <span className="text-muted">Cover</span>
          <span>
            <span className="num">{percent(coverRatio)}</span> of your {usd(exposure.lossUsd)} loss
          </span>
        </label>
        <input
          id="cover"
          type="range"
          min={MIN_COVER}
          max={100}
          step={5}
          value={cover}
          onChange={(e) => onCoverChange(Number(e.target.value) / 100)}
          className="range mt-1"
          style={{ "--fill": `${((cover - MIN_COVER) / (100 - MIN_COVER)) * 100}%` } as CSSProperties}
        />
      </div>

      {worthIt ? (
        <Buy plan={plan} coverRatio={coverRatio} onBought={onBought} />
      ) : (
        price && (
          <p className="note mt-5">
            The market treats this as all but certain, so cover would cost as much as it pays. Try a threshold that is less likely to be hit.
          </p>
        )
      )}

      <div className="mt-6 border-t border-line pt-4 text-xs text-faint">
        <p>What the pool buys on Gemini to cover itself, {quote.contracts.toLocaleString("en-US")} contracts of each:</p>
        <ul className="num mt-1.5 space-y-0.5">
          {coverage.legs.map((leg) => (
            <li key={leg.symbol}>
              {leg.side === "yes" ? "Yes" : "No"} on &ldquo;{leg.label}&rdquo;
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
