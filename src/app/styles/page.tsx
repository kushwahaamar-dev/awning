import { notFound } from "next/navigation";
import { Ascii, type Scene } from "@/components/Ascii";
import { Drawing, type Subject } from "@/components/Drawing";
import { Cold, Fuel, Hot } from "@/components/icons";

// The same three bad days in each way the site can draw one, to choose between with the eye. Not part of the product.
const DAYS: { name: string; drawing: Subject; scene: Scene; Mark: typeof Cold }[] = [
  { name: "A cold day", drawing: "cold", scene: "cabin", Mark: Cold },
  { name: "A hot day", drawing: "hot", scene: "dunes", Mark: Hot },
  { name: "A jump in fuel", drawing: "fuel", scene: "price", Mark: Fuel },
];
const WAYS = [
  { name: "Line drawing", used: "The shop’s own style. On the landing page, the find page and the agent page." },
  { name: "Dots", used: "Animated, from the ASCII library. On a quote, and when cover is bought." },
  { name: "Mark", used: "A sign more than a picture. In the corner of each ticket." },
];

export default function Styles() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <div className="inner py-12">
      <h1 className="heading">Three ways to draw a bad day</h1>
      <div className="mt-12 grid gap-x-10 gap-y-12 md:grid-cols-[8rem_repeat(3,minmax(0,1fr))]">
        <span />
        {WAYS.map(({ name, used }) => (
          <div key={name}>
            <h2 className="title">{name}</h2>
            <p className="mt-1 text-sm text-muted">{used}</p>
          </div>
        ))}
        {DAYS.map(({ name, drawing, scene, Mark }) => (
          <div key={name} className="contents">
            <p className="text-muted md:self-center">{name}</p>
            <Drawing subject={drawing} className="w-full" />
            <Ascii scene={scene} className="w-full self-center" />
            <Mark className="size-32 self-center justify-self-center" />
          </div>
        ))}
      </div>
    </div>
  );
}
