"use client";

import { useEffect, useRef } from "react";
import type { Piece } from "ascii-magic-art/runtime/player.js";
import type { Trigger } from "@/lib/hedge/exposure";

// Animated scenes from ascii-magic-art (MIT). Each is a small module that draws a frame of text for a moment
// in time. The library's player prints it as halftone dots, in the piece's own colours, on the page's white:
// the same dots as the sign over the shop.
const CELL_WIDTH = 0.602; // a monospace cell is this wide for each unit of font size, and one unit tall

/** A part of a piece: the padlock without the dialog drawn round it, the coin without its floor. */
type Crop = { left: number; top: number; cols: number; rows: number };
/** `at` is the moment shown to anyone who prefers stillness, for a piece whose first frame isn't its best. */
type Source = { load: () => Promise<Piece>; cols: number; rows: number; label: string; crop?: Crop; at?: number };

const SCENES = {
  shop: {
    load: () => import("ascii-magic-art/pieces/lemonade-stand-pour.js"),
    cols: 84,
    rows: 38,
    label: "A stall under a striped awning on a sunny day, pouring a glass of lemonade",
  },
  cold: { load: () => import("ascii-magic-art/pieces/snowfall.js"), cols: 96, rows: 34, label: "Snow falling over a pine valley" },
  cabin: { load: () => import("ascii-magic-art/pieces/snowy-cabin.js"), cols: 96, rows: 36, label: "A log cabin in snowy woods at dusk, smoke rising from its chimney" },
  warm: { load: () => import("ascii-magic-art/pieces/sunrise-horizon.js"), cols: 96, rows: 34, label: "The sun climbing over the sea", at: 14 },
  dunes: { load: () => import("ascii-magic-art/pieces/desert-dunes.js"), cols: 96, rows: 36, label: "Sand dunes baking under a blazing sky" },
  price: { load: () => import("ascii-magic-art/pieces/candlestick-chart.js"), cols: 78, rows: 23, label: "A price chart, candle by candle" },
  sky: { load: () => import("ascii-magic-art/pieces/cloud-drift.js"), cols: 100, rows: 32, label: "Clouds drifting over distant hills" },
  lock: {
    load: () => import("ascii-magic-art/pieces/empty-access-denied.js"),
    cols: 19,
    rows: 14,
    crop: { left: 19, top: 1, cols: 19, rows: 14 },
    label: "A padlock snapping shut",
    at: 2,
  },
  coin: {
    load: () => import("ascii-magic-art/pieces/spinning-coin.js"),
    cols: 56,
    rows: 22,
    crop: { left: 0, top: 1, cols: 56, rows: 22 },
    label: "A gold coin spinning on its edge",
  },
} satisfies Record<string, Source>;

export type Scene = keyof typeof SCENES;

/** The picture for a risk: cold, heat, a price, or the sky for anything else. */
export function sceneFor(trigger: Trigger): Scene {
  if (trigger.family === "price") return "price";
  if (trigger.family === "temperature") return trigger.direction === "below" ? "cold" : "warm";
  return "sky";
}

// A second cold day, or a second warm one, shown beside the first.
const OTHER: Partial<Record<Scene, Scene>> = { cold: "cabin", warm: "dunes" };

/** A picture for each of several risks shown together, so two of a kind don't get the same one. */
export function scenesFor(triggers: Trigger[]): Scene[] {
  const used = new Set<Scene>();
  return triggers.map((trigger) => {
    const first = sceneFor(trigger);
    const scene = used.has(first) ? (OTHER[first] ?? first) : first;
    used.add(scene);
    return scene;
  });
}

/** The same piece, drawn only inside `crop`. */
function cropped(piece: Piece, { left, top, cols, rows }: Crop): Piece {
  const cut = (layer: string) =>
    layer
      .split("\n")
      .slice(top, top + rows)
      .map((row) => [...row].slice(left, left + cols).join(""))
      .join("\n");
  return {
    meta: { ...piece.meta, cols, rows },
    default: () => {
      const draw = piece.default();
      return (t) => {
        const frame = draw(t);
        return typeof frame === "string" ? cut(frame) : { ...frame, text: cut(frame.text), color: cut(frame.color) };
      };
    },
  };
}

/**
 * One scene, scaled to the width it is given. It plays only while on screen and holds a still frame for
 * anyone who prefers reduced motion.
 */
export function Ascii({ scene, className = "" }: { scene: Scene; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const pre = useRef<HTMLPreElement>(null);
  const { cols, rows, label } = SCENES[scene];

  useEffect(() => {
    const frame = box.current;
    const text = pre.current;
    if (!frame || !text) return;
    const source: Source = SCENES[scene];

    // The player sizes its canvas from the <pre>'s font size, so the font size is what fits the scene to the box.
    const fit = () => {
      text.style.fontSize = `${frame.clientWidth / (source.cols * CELL_WIDTH)}px`;
    };
    fit();
    const watcher = new ResizeObserver(fit);
    watcher.observe(frame);

    let stop: (() => void) | undefined;
    let gone = false;
    Promise.all([import("ascii-magic-art/runtime/player.js"), source.load()]).then(([{ play }, piece]) => {
      if (gone) return;
      // Printed the way a halftone is on paper: where the picture is dark the dots are large, and white stays paper.
      stop = play(text, source.crop ? cropped(piece, source.crop) : piece, { look: { look: "dots", invert: true }, maxFps: 20, t0: source.at });
    });

    return () => {
      gone = true;
      stop?.();
      watcher.disconnect();
      // The player adds its canvas beside the <pre> and remembers it on the element, both outside
      // React's knowledge. Without this a second scene would draw to a canvas that is no longer on the page.
      frame.querySelector("canvas")?.remove();
      Reflect.deleteProperty(text, "_canvas");
    };
  }, [scene]);

  return (
    <div ref={box} role="img" aria-label={label} className={`ascii overflow-hidden ${className}`} style={{ aspectRatio: (cols * CELL_WIDTH) / rows }}>
      <pre ref={pre} aria-hidden className="m-0 leading-none" />
    </div>
  );
}
