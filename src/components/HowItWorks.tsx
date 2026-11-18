"use client";

import { cents, usd } from "@/lib/format";
import { Drawing } from "./Drawing";
import { kindOf, useExamples } from "./Risks";

// What the steps say until a live price has been read, and if none can be.
const TYPICAL = {
  said: "If it’s too cold to sit outside tomorrow, my patio is out $300.",
  payout: "$300",
  cost: "about $40",
  pays: "tomorrow turns out that cold",
  kind: "cold" as const,
};

/** The whole product in three steps, told with a bad day that can really be covered this minute and what it really costs. */
export function HowItWorks() {
  const live = useExamples()?.[0];
  const { said, payout, cost, pays, kind } = live
    ? { said: live.text, payout: usd(live.payout), cost: cents(live.cost), pays: live.pays, kind: kindOf(live.exposure.trigger) }
    : TYPICAL;
  const steps = [
    { picture: <Drawing subject={kind === "other" ? "cold" : kind} className="h-full" />, title: "Say what a bad day costs you", body: <>&ldquo;{said}&rdquo;</> },
    {
      picture: <Drawing subject="ticket" pays={payout} className="h-full" />,
      title: "See the price",
      body: (
        <>
          Awning finds the market that pays on exactly that day and quotes you: <span className="text-fg">{cost}</span> to cover{" "}
          <span className="text-fg">{payout}</span>.
        </>
      ),
    },
    {
      picture: <Drawing subject="coins" className="h-full" />,
      title: "Get paid if it happens",
      body: (
        <>
          If {pays}, the {payout} is yours automatically. There&rsquo;s no claim to file. If it doesn&rsquo;t happen, you&rsquo;re out the {cost}.
        </>
      ),
    },
  ];

  return (
    <ol className="grid gap-x-10 gap-y-14 md:grid-cols-3">
      {steps.map(({ picture, title, body }, i) => (
        <li key={title}>
          <div className="flex h-44 items-end sm:h-52">{picture}</div>
          <h3 className="title mt-8">
            <span className="num mr-3 text-muted">{i + 1}</span>
            {title}
          </h3>
          <p className="copy mt-3 max-w-sm text-muted">{body}</p>
        </li>
      ))}
    </ol>
  );
}
