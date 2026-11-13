"use client";

import type { CoverPlan } from "@/lib/hedge/plan";
import { cents, day, percent, usd } from "@/lib/format";
import { Buy } from "./Buy";

type Props = {
  plan: CoverPlan;
  coverRatio: number;
  onCoverChange: (ratio: number) => void;
  onBought: () => void;
};

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex items-baseline ${strong ? "font-bold" : ""}`}>
      <span>{label}</span>
      <span className="leader" />
      <span className="figures">{value}</span>
    </div>
  );
}

export function Receipt({ plan, coverRatio, onCoverChange, onBought }: Props) {
  const { quote, coverage, market, exposure, forecast } = plan;
  const cheapest = quote.resting ?? quote.now;
  // When the market sees the event as near-certain, cover costs what it pays and isn't worth buying.
  const worthIt = cheapest !== null && cheapest.total < quote.payout;

  return (
    <section aria-label="Cover" className="receipt px-6 pt-6">
      <p className="text-mute">
        Cover for {day(market.startsAt ?? market.expiresAt)}, on Gemini&rsquo;s &ldquo;{market.title.replace(/\?$/, "")}&rdquo;
      </p>
      <p className="mt-1 font-display text-3xl leading-tight font-bold tracking-tight [font-stretch:85%]">
        Pays {usd(quote.payout)} if {coverage.pays}
      </p>

      <div className="mt-6 space-y-2 border-t-2 border-dashed border-rule pt-5 text-lg">
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
        <p className="mt-2 text-sm text-mute">
          Costs include an estimated {cents(cheapest.fees)} in Gemini fees.
          {forecast && ` Your agent paid ${cents(forecast.paid)} for a ${forecast.members}-run forecast to check the price against.`}
        </p>
      ) : (
        <p className="mt-4 text-brick">
          Nobody is quoting this market right now, so there is no price to show. Check back closer to the date.
        </p>
      )}

      <div className="mt-6 border-t-2 border-dashed border-rule pt-5">
        <label htmlFor="cover" className="flex items-baseline justify-between text-lg">
          <span>Cover</span>
          <span className="figures font-bold">
            {percent(coverRatio)} of your {usd(exposure.lossUsd)} loss
          </span>
        </label>
        <input
          id="cover"
          type="range"
          min={10}
          max={100}
          step={5}
          value={Math.round(coverRatio * 100)}
          onChange={(e) => onCoverChange(Number(e.target.value) / 100)}
          className="mt-2 w-full accent-awning"
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

      <div className="mt-6 border-t-2 border-dashed border-rule pt-5 text-sm text-mute">
        <p>What gets bought on Gemini, {quote.contracts.toLocaleString("en-US")} contracts of each:</p>
        <ul className="mt-1">
          {coverage.legs.map((leg) => (
            <li key={leg.symbol} className="figures">
              {leg.side === "yes" ? "Yes" : "No"} on &ldquo;{leg.label}&rdquo;
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
