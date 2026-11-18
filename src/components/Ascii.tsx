"use client";

import { useEffect, useRef } from "react";
import type { Frame, Piece } from "ascii-magic-art/runtime/glyphs.js";
import type { Trigger } from "@/lib/hedge/exposure";

// Animated scenes from ascii-magic-art (MIT). Each piece is a small module that draws a frame of text, with a
// colour for every character, for a moment in time. They are printed here in the two inks the rest of the page
// is drawn in: black dots, and the amber of the awning for whatever in the piece is yellow, gold or orange.
const CELL_WIDTH = 0.602; // a monospace cell is this wide for each unit of its height
const MAX_FPS = 20;
const SIZES = 4; // of dot
const STROKE = 10; // a character covering less of its cell than this is a guide line or a speck, not a stroke
const AMBER = "#f2b54a";

/**
 * Which end of a piece gets the ink. A night scene is drawn by its lights: snow, a window, a bolt of lightning.
 * A day scene is drawn by its shadows, and its sky is left as paper.
 */
type Tone = "lights" | "shadows";
type Source = {
  load: () => Promise<Piece>;
  /** The size of what is shown, in the piece's cells. */
  cols: number;
  rows: number;
  tone: Tone;
  label: string;
  /** Where the part shown starts, for a piece shown in part: the candles without their made-up prices. */
  from?: { left: number; top: number };
  /** Drawn on square cells, one dot to a cell, and not on the tall cells of text. */
  square?: true;
  /** A piece made of lines and not of shading: every stroke is inked, however thin the character that draws it. */
  drawn?: true;
  /** The moment shown to anyone who prefers stillness, for a piece whose first frame isn't its best. */
  at?: number;
};

const SCENES = {
  // Awning's own, made with the library's kit: the others are the library's.
  awning: {
    load: () => import("./awning-out"),
    cols: 120,
    rows: 66,
    tone: "lights",
    square: true,
    label: "A shop in the rain letting out its striped awning. The rain under it stops, and the ground there is dry.",
    at: 4,
  },
  cabin: {
    load: () => import("ascii-magic-art/pieces/snowy-cabin.js"),
    cols: 96,
    rows: 36,
    tone: "lights",
    label: "A cabin with lit windows in snowy woods, smoke rising from its chimney",
  },
  dunes: { load: () => import("ascii-magic-art/pieces/desert-dunes.js"), cols: 96, rows: 36, tone: "shadows", label: "Sand dunes baking under a blazing sun" },
  price: {
    load: () => import("ascii-magic-art/pieces/candlestick-chart.js"),
    cols: 70,
    rows: 20,
    from: { left: 0, top: 2 },
    tone: "lights",
    drawn: true,
    label: "A price moving, candle by candle",
  },
  storm: {
    load: () => import("ascii-magic-art/pieces/tornado.js"),
    cols: 96,
    rows: 36,
    tone: "lights",
    label: "A tornado crossing open plains, throwing up dust",
  },
} satisfies Record<string, Source>;

export type Scene = keyof typeof SCENES;

/** The picture for a risk: cold, heat, a price, or a storm for anything else. */
export function sceneFor(trigger: Trigger): Scene {
  if (trigger.family === "price") return "price";
  if (trigger.family === "temperature") return trigger.direction === "below" ? "cabin" : "dunes";
  return "storm";
}

type Ink = { light: number; amber: boolean };
const PLAIN: Ink = { light: 0.88, amber: false };

/** Each of a piece's colours as the printer sees it: how light it is, and whether it is yellow, gold or orange enough to take the awning's ink. */
function inksOf(piece: Piece) {
  const inks = new Map<string, Ink>();
  for (const [key, hex] of Object.entries(piece.meta.palette ?? {})) {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const [most, spread] = [Math.max(r, g, b), Math.max(r, g, b) - Math.min(r, g, b)];
    const hue = spread && 60 * (most === r ? ((g - b) / spread + 6) % 6 : most === g ? (b - r) / spread + 2 : (r - g) / spread + 4);
    inks.set(key, { light: 0.2126 * r + 0.7152 * g + 0.0722 * b, amber: most >= 0.45 && spread >= 0.18 && hue >= 18 && hue <= 62 });
  }
  return inks;
}

/**
 * One scene, scaled to the width it is given. It plays only while on screen and holds a still frame for
 * anyone who prefers reduced motion.
 */
export function Ascii({ scene, className = "" }: { scene: Scene; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const { cols, rows, label, square }: Source = SCENES[scene];

  useEffect(() => {
    const frame = box.current;
    const sheet = canvas.current;
    const ctx = sheet?.getContext("2d");
    if (!frame || !sheet || !ctx) return;
    const source: Source = SCENES[scene];
    const { cols, rows, tone } = source;
    const { left, top } = source.from ?? { left: 0, top: 0 };
    const style = getComputedStyle(frame);
    const black = style.color;
    const amber = style.getPropertyValue("--color-lit").trim() || AMBER;

    let stop = () => {};
    let gone = false;
    Promise.all([import("ascii-magic-art/runtime/glyphs.js"), source.load()]).then(([{ cover }, piece]) => {
      if (gone) return;
      const draw = piece.default();
      const inks = inksOf(piece);
      const light = new Float32Array(cols * rows);
      const warm = new Uint8Array(cols * rows);

      /** Reads the part of a frame that is shown into `light` and `warm`, cell by cell. A cell with nothing in it has no light at all, not even none. */
      const read = (moment: Frame) => {
        const lines = (typeof moment === "string" ? moment : moment.text).split("\n");
        const hues = typeof moment === "string" ? null : moment.color.split("\n");
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const glyph = lines[top + r]?.[left + c] ?? " ";
            const ink = inks.get(hues?.[top + r]?.[left + c] ?? " ") ?? PLAIN;
            const covered = glyph === " " ? 0 : cover(glyph);
            // In a drawing a thin stroke counts for half a cell of ink, so a candle's wick prints as surely as its body.
            light[r * cols + c] = covered === 0 ? -1 : (source.drawn && covered >= STROKE ? Math.max(50, covered) / 100 : (covered / 100) * ink.light);
            warm[r * cols + c] = ink.amber ? 1 : 0;
          }
        }
      };

      // How bright the piece gets is taken from a few moments spread along it, not from each frame as it comes:
      // a flash of lightning then swells the dots for an instant, instead of dimming everything else on the page.
      const peaks = Array.from({ length: 7 }, (_, i) => {
        read(draw(i * 2.3));
        return light.reduce((most, value) => Math.max(most, value), 0.01);
      }).sort((a, b) => a - b);
      const peak = peaks[3];

      const paint = (t: number) => {
        const width = frame.clientWidth;
        const scale = Math.min(2, devicePixelRatio || 1);
        const cellWide = width / cols;
        const cellTall = source.square ? cellWide : cellWide / CELL_WIDTH;
        const height = cellTall * rows;
        if (sheet.width !== Math.round(width * scale) || sheet.height !== Math.round(height * scale)) {
          sheet.width = Math.round(width * scale);
          sheet.height = Math.round(height * scale);
        }
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        ctx.clearRect(0, 0, width, height);

        // A cell of text is taller than it is wide, so it holds two dots, one above the other, and the dots stay on a square grid.
        const down = Math.round(cellTall / cellWide);
        const stepY = cellTall / down;
        const largest = 0.46 * Math.min(cellWide, stepY);
        const dots = [new Path2D(), new Path2D()];
        read(draw(t));
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const here = light[r * cols + c];
            if (here < 0) continue;
            const lit = Math.min(1, here / peak);
            const inked = tone === "lights" ? lit ** 1.25 : (1 - lit) ** 1.1;
            // The awning's colour is always a large dot: it is there to be seen, not to shade.
            const size = Math.ceil((warm[r * cols + c] ? Math.max(0.75, inked) : inked) * SIZES) / SIZES;
            // The faintest tone is left as paper, which is what keeps a scene from turning grey.
            if (size <= 1 / SIZES && !warm[r * cols + c]) continue;
            const radius = largest * size;
            const path = dots[warm[r * cols + c]];
            for (let j = 0; j < down; j++) {
              const [x, y] = [(c + 0.5) * cellWide, r * cellTall + (j + 0.5) * stepY];
              path.moveTo(x + radius, y);
              path.arc(x, y, radius, 0, Math.PI * 2);
            }
          }
        }
        ctx.fillStyle = black;
        ctx.fill(dots[0]);
        ctx.fillStyle = amber;
        ctx.fill(dots[1]);
      };

      let elapsed = source.at ?? 0;
      paint(elapsed);
      const resized = new ResizeObserver(() => paint(elapsed));
      resized.observe(frame);
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
        stop = () => resized.disconnect();
        return;
      }

      let visible = false;
      const seen = new IntersectionObserver(([entry]) => (visible = entry.isIntersecting), { rootMargin: "100px" });
      seen.observe(frame);
      const every = 1000 / Math.min(piece.meta.fps, MAX_FPS);
      // Each scene starts at a moment of its own within a frame, so the scenes on a page don't all redraw at once.
      let [request, before, drawn] = [0, 0, performance.now() - Math.random() * every];
      const tick = (now: number) => {
        request = requestAnimationFrame(tick);
        // Time only runs while the scene can be seen, so it picks up where it left off.
        if (visible && before) elapsed += (now - before) / 1000;
        before = now;
        if (!visible || now - drawn < every) return;
        drawn = now;
        paint(elapsed);
      };
      request = requestAnimationFrame(tick);
      stop = () => {
        cancelAnimationFrame(request);
        seen.disconnect();
        resized.disconnect();
      };
    });

    return () => {
      gone = true;
      stop();
    };
  }, [scene]);

  return (
    <div ref={box} role="img" aria-label={label} className={`ascii ${className}`} style={{ aspectRatio: square ? cols / rows : (cols * CELL_WIDTH) / rows }}>
      <canvas ref={canvas} aria-hidden className="block size-full" />
    </div>
  );
}
