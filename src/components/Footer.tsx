import { chain, chainLabel, mandateAddress } from "@/lib/chain/config";
import { shortAddress } from "@/lib/format";

/** What is real behind the page, and where to check it. */
export function Footer() {
  const explorer = chain.blockExplorers?.default.url;
  return (
    <footer className="overflow-hidden bg-awning-deep text-paper">
      <div className="mx-auto max-w-7xl px-5 pt-16 sm:px-10">
        <dl className="grid gap-x-10 gap-y-8 md:grid-cols-3">
          <div>
            <dt className="font-bold text-marigold">Markets and payouts</dt>
            <dd className="mt-1 text-paper/75">Gemini prediction markets. Awning never decides whether something happened; Gemini&rsquo;s resolution does.</dd>
          </div>
          <div>
            <dt className="font-bold text-marigold">Limits</dt>
            <dd className="mt-1 text-paper/75">
              Held by a contract on {chainLabel}
              {mandateAddress && (
                <>
                  {" "}
                  at{" "}
                  {explorer ? (
                    <a href={`${explorer}/address/${mandateAddress}`} target="_blank" rel="noreferrer" className="link till text-paper">
                      {shortAddress(mandateAddress)}
                    </a>
                  ) : (
                    <span className="till text-paper">{shortAddress(mandateAddress)}</span>
                  )}
                </>
              )}
              . Refusals are written to the chain too.
            </dd>
          </div>
          <div>
            <dt className="font-bold text-marigold">Money</dt>
            <dd className="mt-1 text-paper/75">USDC throughout. Premiums, payouts, and the cents your agent pays per request for forecasts.</dd>
          </div>
        </dl>
        <p className="mt-10 max-w-xl text-sm text-paper/60">
          Awning buys exchange-traded contracts on your behalf. It is not insurance, and cover can pay differently from what you actually lose.
        </p>
      </div>
      <p aria-hidden className="display -mb-[0.2em] mt-6 text-center text-[clamp(6rem,27vw,24rem)] leading-[0.8] text-awning select-none">
        Awning
      </p>
    </footer>
  );
}
