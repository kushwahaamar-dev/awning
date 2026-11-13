"use client";

import { useEffect, useRef } from "react";

// Animated scenes from ascii-magic-art (MIT). Each is a small module that draws a frame of text for
// a moment in time; the library's player paints it as halftone dots on a canvas.
const CELL_WIDTH = 0.602; // a monospace cell is this wide for each unit of font size

const SCENES = {
  street: { load: () => import("ascii-magic-art/pieces/neon-city-rain.js"), cols: 100, rows: 36, square: false },
  lighthouse: { load: () => import("ascii-magic-art/pieces/cliff-lighthouse-night.js"), cols: 192, rows: 108, square: true },
  sunrise: { load: () => import("ascii-magic-art/pieces/sunrise-horizon.js"), cols: 96, rows: 34, square: false },
  snow: { load: () => import("ascii-magic-art/pieces/snowfall.js"), cols: 96, rows: 34, square: false },
  storm: { load: () => import("ascii-magic-art/pieces/lightning-storm.js"), cols: 96, rows: 34, square: false },
  prices: { load: () => import("ascii-magic-art/pieces/candlestick-chart.js"), cols: 78, rows: 23, square: false },
} as const;

export type Scene = keyof typeof SCENES;

/**
 * One scene, scaled to the width it is given. It plays only while on screen and holds a still frame
 * for anyone who prefers reduced motion. It is decoration with a description, not content.
 */
export function Ascii({ scene, label, className = "" }: { scene: Scene; label: string; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const pre = useRef<HTMLPreElement>(null);
  const { cols, rows, square } = SCENES[scene];
  // Text cells are taller than they are wide; photo-like scenes use square ones.
  const ratio = square ? cols / rows : (cols * CELL_WIDTH) / rows;

  useEffect(() => {
    const frame = box.current;
    const text = pre.current;
    if (!frame || !text) return;

    // The player sizes its canvas from the <pre>'s font size, so the font size is what fits the scene to the box.
    const fit = () => {
      text.style.fontSize = `${frame.clientWidth / (cols * CELL_WIDTH)}px`;
    };
    fit();
    const watcher = new ResizeObserver(fit);
    watcher.observe(frame);

    let stop: (() => void) | undefined;
    let gone = false;
    Promise.all([import("ascii-magic-art/runtime/player.js"), SCENES[scene].load()]).then(([{ play }, piece]) => {
      if (!gone) stop = play(text, piece, { look: { look: "dots" }, maxFps: 24 });
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
  }, [scene, cols]);

  return (
    <div ref={box} role="img" aria-label={label} className={`overflow-hidden ${className}`} style={{ aspectRatio: ratio }}>
      <pre ref={pre} aria-hidden className="m-0 leading-none text-soft" />
    </div>
  );
}
