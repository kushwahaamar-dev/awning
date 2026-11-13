# Awning

Say what could go wrong for your business. Awning finds a Gemini prediction market that pays out
when it happens, tells you what the cover costs, and buys it for you, with an agent that can only
spend what an onchain mandate allows.

> "Any day Austin's high stays under 76, my ice cream truck is out about $300."
>
> **Pays $300 if Austin's high is 76°F or below. Costs $12.20 if you leave an order.**

Built for the University Blockchain Conference 2026 hackathon.

## The problem

Small businesses carry risks nobody will insure: a cold day, a spike in fuel, the home team losing.
Prediction markets price exactly these events, and owners have started using them by hand (Fortune
reported a restaurant group putting $60,000 on a baseball outcome in October 2026). Doing it by hand
means finding the right contract among a thousand, working out how many to buy, and understanding
where the market's settlement differs from your actual loss. Almost nobody will.

Handing the job to an AI agent creates the second problem. An agent that can spend money and reads
text written by strangers will eventually be talked into something. A spending limit written in a
prompt is a suggestion.

## What Awning does

1. **You describe a risk in a sentence**, typed or spoken.
2. **Claude turns it into a structured exposure**: what has to happen, where, when, and what it costs you.
   If something essential is missing it asks one question. If Gemini lists nothing that tracks the
   risk, it says so and records the gap.
3. **The engine matches it to live Gemini contracts** and builds the position that pays when your
   trigger happens: a basket of temperature buckets, a Yes or No on a price strike, or a No on a team.
4. **You get a receipt, not a trading screen**: what it pays, the market's odds, the cost to buy now,
   the cheaper cost of leaving an order, and a plain account of where a payout could differ from
   your loss (the settlement station, a snapped threshold, a proxy asset, a thin book).
5. **For temperature markets the agent buys a second opinion.** It pays two cents over x402 for an
   ensemble weather forecast, checks the market's price against it, and never bids above the middle
   of the book on a model's say-so.
6. **The agent asks the mandate for the premium.** Inside your limits it just acts. Above your
   approval line it has to come back for a signature from your device. Outside your limits the
   contract refuses and records the refusal.
7. **When Gemini resolves the market**, the payout lands in your vault in USDC.

## The mandate

`contracts/src/AwningMandate.sol` holds each owner's USDC and enforces what their agent may do:

| Limit | Enforced as |
| --- | --- |
| Daily allowance for buying data | `drawFloat` moves at most this much per UTC day to the agent's own address |
| Most for one cover | `openHedge` refuses a larger premium |
| Most for cover per 30-day period | `openHedge` refuses once the period total is reached. Periods are fixed windows, so spending can bunch on either side of a boundary |
| Where premiums may go | `openHedge` only pays venues the owner has allowlisted |
| Ask me first above | Larger premiums need the owner's EIP-712 signature over the exact terms |
| Pause | `setPaused` stops everything the agent can do |
| Expiry | The policy lapses on a date the owner sets |

A refusal is not a revert. The transaction succeeds, moves nothing, and emits
`Blocked(owner, agent, action, reason, amount, counterparty, ref)`, so every attempt the agent was
denied is part of the permanent record and shows up in the owner's activity feed.

**What a hijacked agent can take.** The app has a "Hijack my agent" button that hands the agent's
real key to an attacker script and sends real transactions: pay a premium to the attacker's address
(refused, not an approved payee), spend the whole balance on one premium (refused, over the per-cover
limit), draw the whole balance as data spending (refused, over the daily allowance), and finally
take whatever is left of today's data allowance, which succeeds. With the default limits the
attacker gets $2.00 out of a $2,000 vault. The contract exposes that number as
`limits(owner).floatRemainingToday`, and the app shows it.

What the mandate does not do: it cannot stop a hijacked agent from buying cover the owner didn't
want from an approved venue, up to the unapproved cap. That money goes to the venue, not the
attacker, and is bounded by the per-cover and monthly limits. See `contracts/README.md` for the full
trust statement.

The owner's key never reaches the server. In this build it is generated in the browser and kept in
local storage; the contract verifies owners through `SignatureChecker`, so a passkey smart account
(ERC-1271) works without changing it.

## Architecture

```
 browser                         server (Next.js)                       outside
 ───────                         ────────────────                       ───────
 device key (owner) ──signs──▶   /api/interpret ───────────────────▶   Claude
   allowance, approvals          /api/plan ──▶ hedge engine ───────▶   Gemini public market data
                                     │            └─▶ second opinion
                                     │                  │ x402: 402 → sign → settle
                                     │                  ▼
                                     │            /api/desk/forecast ─▶ Open-Meteo ensemble
                                 /api/covers ──▶ agent key ──▶ AwningMandate ──▶ venue key ──▶ Gemini trading API
                                                                    │                          (or paper fills)
                                 /api/streams ◀── QuickNode Stream ◀┘ contract logs
                                     │
                                 Postgres: covers, ledger, odds history, gaps
```

- `src/lib/gemini` reads Gemini's prediction market API and normalises three market shapes:
  partitions (temperature buckets), ladders (nested price strikes) and moneylines.
- `src/lib/hedge` is the engine: exposure schema, market matching, leg construction, pricing with
  Gemini's fee formula, and the basis assessment. It is pure and unit-tested against recorded Gemini data.
- `src/lib/covers` quotes, opens through the mandate, and settles against Gemini's resolution.
- `src/lib/desk` is the forecast desk (seller) and the agent's x402 buyer.
- `src/lib/ledger` stores contract events, fed by QuickNode Streams in production and by reading
  logs directly on a local chain.
- `src/lib/venue` places orders: through Gemini's trading API when keys are set, on paper otherwise.

## The agent's decision loop

For each request the agent runs a fixed sequence. The model is used for one step only, and never
chooses which transaction to send.

1. **Interpret** (Claude, structured output): sentence → `Exposure`, or one clarifying question, or "unlisted".
2. **Match** (code): find the market that settles on the exposure's subject and date.
3. **Construct** (code): choose legs, snapping the user's threshold to the market's steps and reporting the snap.
4. **Check** (code + paid data): for temperature markets, buy an ensemble forecast over x402 from the
   owner's data allowance and compute a fair price per leg.
5. **Price** (code): cost to buy now at the offer; cost to rest inside the spread, anchored on
   `min(mid, fair)`; fees from Gemini's schedule.
6. **Explain** (code): basis notes and a fit score.
7. **Ask the mandate** (agent key): `openHedge`. The outcome is one of opened, opened with the owner's
   signature, or `Blocked` with a reason.
8. **Place orders** (venue): only after the mandate paid. If placement fails the premium is returned.
9. **Settle** (venue key): when Gemini resolves, `closeHedge` credits winnings and any unspent premium.

**Safety limits in force**

- Onchain, outside the model: every limit in the mandate table above.
- In the x402 client: a per-request ceiling of $0.05 and an allowlist of sellers, applied before anything is signed.
- In the server: quotes are re-priced server-side from live data; the browser's numbers are never trusted.
  A cover's onchain `marketRef` commits to the exact contracts and sides it was priced on.
- At the API: every request that reads or spends an owner's account carries a session signed by
  that owner's key and verified against the chain, so nobody can ask the agent to act for someone else.
- In the design: the model has no tool that moves money. Prompt injection can at worst produce a
  wrong `Exposure`, which the owner sees restated on the receipt before buying.

## Economic design and risk assumptions

- **Cover is a position, not a policy.** Awning buys binary contracts that pay $1 each. The cost of
  cover is the market's probability plus fees. Likely events are expensive to cover and the receipt says so.
- **Basis risk is the main risk and is stated, not hidden.** Temperature settles on one airport
  station per the NWS daily climate report. Price markets settle on a reference index at one moment.
  A proxy (diesel hedged with crude) is flagged and scored down. The fit score is a heuristic.
- **Liquidity is thin.** Many contracts have no offer, or only accept resting orders. Awning quotes
  resting orders by default, shows when nothing can be priced, and refunds premium that never filled.
- **A quote lasts five minutes.** After that it has to be asked for again, so a price can't be held
  as a free option on where the market goes. Cover that would cost as much as it pays is not offered.
- **The forecast is a second opinion, not truth.** It is a raw 31-member GFS ensemble with half a
  member of smoothing per bucket and no bias correction. It can lower a bid and cannot raise one.
- **The venue is trusted.** Gemini is a centrally cleared, dollar-funded exchange with nothing
  onchain. The venue key is the adapter between the two worlds: it receives USDC premiums, holds the
  Gemini position, and returns USDC when the market resolves. The contract bounds what it can
  return (`maxPayout + premium`) but cannot verify the outcome it reports. `evidence` is a hash of
  the resolution it saw.
- **Fees** use `rate × price × (1 − price)` per contract with taker 7% and maker 1.75%. These rates
  come from a third-party summary of Gemini's schedule and are labelled as estimates.

## Sponsor technology

**Arc.** The mandate is deployed on Arc; USDC is both the asset in the vault and the gas, so an
owner needs one token and sees one balance. The x402 payments settle as EIP-3009
`transferWithAuthorization` on Arc's native USDC (`0x3600…0000`, EIP-712 domain `USDC`/`2`).

| Contract | Arc testnet (5042002) |
| --- | --- |
| AwningMandate | _to be filled in after deployment_ |
| USDC | `0x3600000000000000000000000000000000000000` |

**Gemini Prediction Markets.** Market data: `GET /v1/prediction-markets/events` filtered by
`category`, `search` and `status`, and `GET /v1/prediction-markets/events/{ticker}` for prices and
resolution. Trading: `POST /v1/prediction-markets/order`, `/orders/active`, `/orders/history` and
`/terms/status`, signed with HMAC-SHA384. Gemini's API has no price history, so Awning records its
own and charts what a dollar of each cover has cost over time. Risks people ask about that no market
tracks are stored as gaps.

**QuickNode Streams.** The activity ledger is fed by one Stream.

- Network: Arc testnet.
- Dataset: `block_with_receipts`, chosen over `logs` because each block carries its timestamp, so
  the app never calls back to the chain to date an event.
- Filter: `quicknode/filter.js`. It keeps logs whose `address` is the mandate, attaches the block
  timestamp, and returns `null` for blocks with none, so empty blocks are not delivered.
- Destination: webhook, `POST /api/streams`. The handler verifies QuickNode's
  `X-QN-Signature` (HMAC-SHA256 over nonce + timestamp + body, keyed with the Stream's security
  token), inflates gzip, and stores events idempotently by `txHash:logIndex`, which makes
  redelivery and backfill safe.
- `scripts/replay-streams.mjs` runs the same filter file over a local chain's blocks and posts the
  result, signed the same way, to test the path end to end.

**ElevenLabs.** Scribe (`scribe_v2`) transcribes push-to-talk recordings; Flash (`eleven_flash_v2_5`)
streams spoken replies: the clarifying question, the quote, and refusals. Replies are only spoken
after the person has used the microphone.

**x402.** The forecast desk and the agent's buyer use the official `@x402/core` and `@x402/evm`
packages (v2 protocol, `exact` scheme). The desk settles its own sales.

## Run it

Requires Node 22 or newer and [Foundry](https://getfoundry.sh).

```bash
npm install
npm run chain          # local chain with the mandate deployed; writes .env.development.local
npm run dev            # in a second terminal
```

Open http://localhost:3000, go to **Your agent**, press **Get test dollars**, then **Set allowance**.

Set `ANTHROPIC_API_KEY` to describe risks in your own words. Everything else is optional; see
`.env.example`. With no Gemini trading keys, orders fill on paper against Gemini's live prices: the
markets, prices and resolution are real and only the fill is assumed.

### Arc testnet

```bash
cd contracts
USDC_ADDRESS=0x3600000000000000000000000000000000000000 forge script script/Deploy.s.sol \
  --rpc-url arc_testnet --private-key $DEPLOYER_KEY --broadcast \
  --with-gas-price 25gwei --priority-gas-price 1gwei
```

Arc enforces a 20 gwei minimum base fee; without the gas flags Foundry's defaults can leave the
transaction pending. Put the addresses from `contracts/deployments/5042002.json` in `.env.local`.

## Tests

```bash
npm test                       # engine, settlement and forecast logic
npm run typecheck && npm run lint
cd contracts && forge test     # 94 tests including fuzz and invariants
LIVE=1 npx vitest run src/lib/hedge/live.test.ts   # sentence → priced cover against live Gemini and Claude
```

## What is real and what is not

| Real | Stand-in |
| --- | --- |
| Gemini markets, prices, and resolution | Fills, unless Gemini trading keys are set |
| Every mandate transaction, including refusals and the hijack test | The owner's key is browser storage rather than a passkey |
| x402 payments, settled onchain per request | The forecast desk is run by the same operator as the agent |
| The forecast data and the odds history | The venue's link between USDC and the Gemini account is one trusted key |

## What comes next

- Standing cover: "every day the high is under 70" bought each morning inside the monthly limit,
  which is what the per-period cap in the mandate is for.
- Passkey smart accounts for owners, and gas paid for them.
- A venue adapter that funds the Gemini account from USDC deposits and withdraws payouts, replacing the trusted desk.
- Bias-corrected forecasts, and fair values for price markets from options-implied volatility.
- Publishing the gaps list to Gemini as demand for new markets.
