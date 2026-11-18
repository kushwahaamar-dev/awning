"use client";

import { useEffect, useRef } from "react";

// The pictures the landing page opens on: animated scenes from ascii-magic-art (MIT), each a painting made of
// coloured characters. Each one is a small business on the kind of day it would want cover for.
const SCENES = {
  cold: { load: () => import("ascii-magic-art/pieces/aurora-cabin-snowfall.js"), label: "A cabin with lit windows deep in snow, under the northern lights" },
  hot: { load: () => import("ascii-magic-art/pieces/goa-shack-sunset.js"), label: "A beach café at sunset, its palms black against a hot sky" },
  fuel: { load: () => import("ascii-magic-art/pieces/market-auto-rickshaws.js"), label: "A street of small shops, with auto-rickshaws and motorbikes going by" },
};
// All three are drawn on square cells, this many across and down.
const COLS = 192;
const ROWS = 108;
const CELL_WIDTH = 0.602; // a cell is this wide for each unit of the font size the player is given

export type SceneName = keyof typeof SCENES;

/**
 * One scene, scaled to the width it is given. It moves only while `playing`; otherwise it holds the moment it
 * had reached. Anyone who prefers stillness gets one frame of it.
 */
export function Scene({ of, playing, className = "" }: { of: SceneName; playing: boolean; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const pre = useRef<HTMLPreElement>(null);
  const reached = useRef(4);

  useEffect(() => {
    const frame = box.current;
    const text = pre.current;
    if (!frame || !text) return;

    // The player sizes its canvas from the <pre>'s font size, so the font size is what fits the scene to the box.
    const fit = () => {
      text.style.fontSize = `${frame.clientWidth / (COLS * CELL_WIDTH)}px`;
    };
    fit();
    const watcher = new ResizeObserver(fit);
    watcher.observe(frame);

    let stop: (() => void) | undefined;
    let gone = false;
    Promise.all([import("ascii-magic-art/runtime/player.js"), SCENES[of].load()]).then(([{ play }, piece]) => {
      if (gone) return;
      stop = play(text, piece, { maxFps: 20, t0: reached.current, still: playing ? undefined : true, onFrame: (_, t) => (reached.current = t) });
    });

    return () => {
      gone = true;
      stop?.();
      watcher.disconnect();
    };
  }, [of, playing]);

  // The player adds its canvas beside the <pre> and remembers it on the element, both outside React's
  // knowledge. They are left alone between plays, so a scene that stops keeps its last frame, and cleared away
  // only when the scene itself goes.
  useEffect(() => {
    const frame = box.current;
    const text = pre.current;
    return () => {
      frame?.querySelector("canvas")?.remove();
      if (text) Reflect.deleteProperty(text, "_canvas");
    };
  }, []);

  return (
    <div ref={box} role="img" aria-label={SCENES[of].label} className={`overflow-hidden ${className}`} style={{ aspectRatio: COLS / ROWS }}>
      <pre ref={pre} aria-hidden className="m-0 text-[#e4e4e7]" />
    </div>
  );
}
