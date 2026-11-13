"use client";

import type { CSSProperties } from "react";
import type { CoverPlan } from "@/lib/hedge/plan";
import { cents, day, percent, usd } from "@/lib/format";
import { Buy } from "./Buy";

type Props = {
  plan: CoverPlan;
  coverRatio: number;
  onCoverChange: (ratio: number) => void;
  onBought: () => void;
};

const MIN_COVER = 10;

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex items-baseline ${strong ? "font-bold" : ""}`}>
      <span className={strong ? "highlighted" : ""}>{label}</span>
      <span className="leader" />
      <span className="till">{value}</span>
    </div>
  );
}

export function Receipt({ plan, coverRatio, onCoverChange, onBought }: Props) {
  const { quote, coverage, market, exposure, forecast } = plan;
  const cheapest = quote.resting ?? quote.now;
  // When the market sees the event as near-certain, cover costs what it pays and isn't worth buying.
  const worthIt = cheapest !== null && cheapest.total < quote.payout;
  const cover = Math.round(coverRatio * 100);

  return (
    <div>
      <div aria-hidden className="printer-slot" />
      <div className="receipt-feed">
        <section aria-label="Cover" className="receipt px-7 pt-8">
          <p className="till flex justify-between text-sm text-mute">
            <span>Awning</span>
            <span>{day(market.startsAt ?? market.expiresAt)}</span>
          </p>
          <h2 className="display display-md mt-5">
            Pays {usd(quote.payout)} if {coverage.pays}
          </h2>
          <p className="mt-3 text-mute">On Gemini&rsquo;s &ldquo;{market.title.replace(/\?$/, "")}&rdquo;</p>

          <div className="tear mt-6 space-y-2.5 pt-5 text-lg">
            {quote.marketOdds !== null && <Line label="The market's odds it happens" value={percent(quote.marketOdds)} />}
            {forecast && <Line label="A weather model's odds" value={percent(forecast.odds)} />}
            {quote.resting && <Line label="Cost if you leave an order" value={cents(quote.resting.total)} strong />}
            {quote.now && <Line label="Cost if you buy right now" value={cents(quote.now.total)} strong={!quote.resting} />}
            {cheapest && (
              <>
                <Line label="If it happens, you're up" value={cents(quote.payout - cheapest.total)} />
                <Line label="If it doesn't, you're out" value={cents(cheapest.total)} />
              </>
            )}
          </div>
          {cheapest ? (
            <p className="mt-3 text-sm text-mute">
              Costs include an estimated {cents(cheapest.fees)} in Gemini fees.
              {forecast && ` Your agent paid ${cents(forecast.paid)} for a ${forecast.members}-run forecast to check the price against.`}
            </p>
          ) : (
            <p className="mt-4 text-brick">
              Nobody is quoting this market right now, so there is no price to show. Check back closer to the date.
            </p>
          )}

          <div className="tear mt-6 pt-5">
            <label htmlFor="cover" className="flex items-baseline justify-between text-lg">
              <span>Cover</span>
              <span className="font-bold">
                <span className="till">{percent(coverRatio)}</span> of your {usd(exposure.lossUsd)} loss
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
            cheapest && (
              <p className="mt-6 border-l-4 border-marigold pl-4">
                The market treats this as all but certain, so cover would cost as much as it pays. Try a threshold that is less likely to be hit.
              </p>
            )
          )}

          <div className="tear mt-6 pt-5 text-sm text-mute">
            <p>What gets bought on Gemini, {quote.contracts.toLocaleString("en-US")} contracts of each:</p>
            <ul className="till mt-2 space-y-0.5 text-xs">
              {coverage.legs.map((leg) => (
                <li key={leg.symbol}>
                  {leg.side === "yes" ? "Yes" : "No"} on &ldquo;{leg.label}&rdquo;
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}
