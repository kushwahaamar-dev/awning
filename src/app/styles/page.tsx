import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { Art, type Picture, type Way } from "@/components/Art";
import { Drawing, type Subject } from "@/components/Drawing";

// The three steps of the landing page, drawn each way the pictures under the first screen could be drawn, so the
// choice can be made with the eye. Not part of the product, and not served on the public site.
const STEPS: { picture: Picture; drawing: Subject; title: string; body: string }[] = [
  { picture: "day", drawing: "cold", title: "Say it", body: "Any bad day, in your own words, and what it would cost you." },
  { picture: "price", drawing: "ticket", title: "See the price", body: "A market sets it, not an insurer. No forms, no adjuster." },
  { picture: "paid", drawing: "coins", title: "Get paid", body: "Your payout is locked before you pay. If the day happens, it arrives by itself." },
];

const WAYS: { way: Way; name: string; says: string }[] = [
  { way: "cut", name: "A. Cut paper", says: "Flat shapes in ink and amber, no outlines. Bold and friendly." },
  { way: "sketch", name: "B. Sketch", says: "Drawn by hand with a marker, the amber printed a little off the line." },
  { way: "stamp", name: "C. Stamps", says: "A rubber stamp for each step, the way a counter marks a ticket." },
  { way: "type", name: "D. Type", says: "No pictures. The figure itself, as large as it goes, with amber run under it." },
];

function Row({ name, says, picture }: { name: string; says: string; picture: (step: (typeof STEPS)[number]) => ReactNode }) {
  return (
    <section className="section band">
      <div className="inner">
        <h2 className="heading">{name}</h2>
        <p className="lede mt-3">{says}</p>
        <ol className="mt-12 grid gap-x-10 gap-y-14 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step.title}>
              <div className="flex h-44 items-end sm:h-52">{picture(step)}</div>
              <h3 className="heading mt-8">
                <span className="num mr-3 text-muted">{i + 1}</span>
                {step.title}
              </h3>
              <p className="lede mt-3 max-w-xs">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export default function Styles() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <>
      <div className="inner pt-8 pb-12">
        <h1 className="display">Pick the art.</h1>
        <p className="lede mt-5">The same three steps, drawn four ways, and the way they are drawn on the page now. Tell me a letter, or what to mix.</p>
      </div>
      <div className="space-y-6">
        {WAYS.map(({ way, name, says }) => (
          <Row key={way} name={name} says={says} picture={({ picture }) => <Art way={way} picture={picture} className="h-full" />} />
        ))}
        <Row name="E. Line drawing (on the page now)" says="The shop’s own style: ink line on a slab, amber as the one colour." picture={({ drawing }) => <Drawing subject={drawing} className="h-full" />} />
      </div>
    </>
  );
}
