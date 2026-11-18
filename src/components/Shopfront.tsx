"use client";

import { memo, useEffect, useState, type CSSProperties } from "react";
import { camera, radians, type Point, type View } from "./iso";

// A shop under its awning in the rain, as a model on a slab. Measured in the model's own units:
// x runs along the shopfront, y out towards the street, z up.
const SHOP = { wide: 180, deep: 46, tall: 96 };
const DOOR = { left: 16, wide: 26, tall: 50 };
// The glass runs nearly to the pavement, so what shows under the awning reads as a shop window and not a ledge.
const WINDOW = { left: 56, wide: 108, sill: 3, tall: 47, panes: 4 };
const BOARD = { left: 12, wide: 156, foot: 59, tall: 31 };
// A table and two stools on the dry ground: what the awning is for.
const TABLE = { x: 118, y: 23, tall: 15, round: 8.5 };
const STOOLS = [
  { x: 98, y: 27, tall: 9, round: 4.2 },
  { x: 139, y: 20, tall: 9, round: 4.2 },
];
// The awning: fixed to the wall above the door and window, and let out over the pavement on two posts.
const CANOPY = { left: 10, wide: 160, at: 53, out: 44, drop: 13, valance: 5, stripes: 11 };
const SLAB = { left: -46, wide: 272, back: -46, deep: 132, thick: 5 };
const SKY = 120;
const DROP = 5;

// The name over the door, in the dots of a shop's sign: seven rows to a letter, five dots across.
const LETTERS: Record<string, string[]> = {
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  W: ["#...#", "#...#", "#...#", "#.#.#", "#.#.#", "#.#.#", ".#.#."],
  N: ["#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#", "#...#"],
  I: [".###.", "..#..", "..#..", "..#..", "..#..", "..#..", ".###."],
  G: [".###.", "#...#", "#....", "#.###", "#...#", "#...#", ".###."],
};
const SIGN = "AWNING";
// Five dots to a letter and two dark columns between letters, which is what keeps W, N, I and N apart.
const LETTER = 7;
const SIGN_COLUMNS = SIGN.length * LETTER - 2;
const PITCH = (BOARD.wide - 6) / SIGN_COLUMNS;

// Where the page opens, the shopfront is seen nearly square on, its sign easy to read. Scrolling walks the eye
// round the corner, up and back, until it is the awning and the dry ground under it that fill the picture.
const OPENING: View = { turn: radians(28), tilt: radians(21), zoom: 1, lift: 0 };
const LEAVING: View = { turn: radians(52), tilt: radians(38), zoom: 0.8, lift: -36 };

// Where each streak of rain comes down. The same every time, so the server and the browser draw the same rain.
const STREAKS = (() => {
  let seed = 11;
  const next = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  return Array.from({ length: 64 }, () => ({ x: SLAB.left + next() * SLAB.wide, y: SLAB.back + next() * SLAB.deep, late: next() }));
})();

/** How high a streak is stopped: by the awning, by the roof, or not until the pavement. */
function landsAt(x: number, y: number) {
  if (x >= CANOPY.left && x <= CANOPY.left + CANOPY.wide && y >= 0 && y <= CANOPY.out) return CANOPY.at - (y / CANOPY.out) * CANOPY.drop;
  if (x >= 0 && x <= SHOP.wide && y >= -SHOP.deep && y <= 0) return SHOP.tall;
  return 0;
}

/** Rain that the shop stands in front of is drawn before it; the rest falls in front of everything. */
const behindShop = (x: number, y: number) => y < -SHOP.deep || (x < 0 && y < 0);

const Sign = memo(function Sign() {
  return (
    <g stroke="none" fill="currentColor">
      {Array.from({ length: SIGN_COLUMNS * 7 }, (_, i) => {
        const column = i % SIGN_COLUMNS;
        const row = Math.floor(i / SIGN_COLUMNS);
        const lit = column % LETTER < 5 && LETTERS[SIGN[Math.floor(column / LETTER)]][row][column % LETTER] === "#";
        return <circle key={i} cx={BOARD.left + 3 + (column + 0.5) * PITCH} cy={BOARD.foot + (BOARD.tall + 7 * PITCH) / 2 - (row + 0.5) * PITCH} r={lit ? PITCH * 0.39 : 0.3} />;
      })}
    </g>
  );
});

const Front = memo(function Front() {
  return (
    <>
      <rect width={SHOP.wide} height={SHOP.tall} />
      <rect x={DOOR.left} width={DOOR.wide} height={DOOR.tall} />
      <rect x={DOOR.left + 4} y={16} width={DOOR.wide - 8} height={DOOR.tall - 20} />
      <line x1={DOOR.left + DOOR.wide - 2} y1={22} x2={DOOR.left + DOOR.wide - 2} y2={28} />
      {Array.from({ length: WINDOW.panes }, (_, i) => (
        <rect key={i} x={WINDOW.left + (i * WINDOW.wide) / WINDOW.panes} y={WINDOW.sill} width={WINDOW.wide / WINDOW.panes} height={WINDOW.tall} />
      ))}
      <rect x={BOARD.left} y={BOARD.foot} width={BOARD.wide} height={BOARD.tall} />
    </>
  );
});

const stripeWidth = CANOPY.wide / CANOPY.stripes;
const striped = (i: number) => (i % 2 ? "var(--color-bg)" : "var(--color-lit)");

const Stripes = memo(function Stripes({ length }: { length: number }) {
  return (
    <>
      {Array.from({ length: CANOPY.stripes }, (_, i) => (
        <rect key={i} x={i * stripeWidth} width={stripeWidth} height={length} fill={striped(i)} />
      ))}
    </>
  );
});

function Rain({ streaks, view }: { streaks: typeof STREAKS; view: ReturnType<typeof camera> }) {
  return (
    <g stroke="var(--color-edge)">
      {streaks.map(({ x, y, late }) => {
        const [left, top] = view.at([x, y, SKY]);
        const fall = (SKY - landsAt(x, y) - DROP) * view.rise;
        // Two drops to a streak, half a fall apart, so there is always one on its way down.
        return (
          <g key={x} transform={`translate(${left.toFixed(2)} ${top.toFixed(2)})`} style={{ "--fall": fall.toFixed(1) } as CSSProperties}>
            {[0, 0.5].map((half) => (
              <line key={half} y2={DROP * view.rise} className="drop" style={{ animationDelay: `calc(var(--fall) * ${(-(late + half) * 9).toFixed(2)}ms)` }} />
            ))}
          </g>
        );
      })}
    </g>
  );
}

/**
 * The shop at the top of the page: its name in lights over the door, its awning out, and rain coming down on
 * everything but the ground under it. Scrolling walks the eye round it; anyone who prefers stillness sees it from the front.
 */
export function Shopfront({ className = "" }: { className?: string }) {
  const [gone, setGone] = useState(0);

  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const follow = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setGone(Math.min(1, scrollY / (innerHeight * 0.85))));
    };
    follow();
    addEventListener("scroll", follow, { passive: true });
    addEventListener("resize", follow);
    return () => {
      cancelAnimationFrame(frame);
      removeEventListener("scroll", follow);
      removeEventListener("resize", follow);
    };
  }, []);

  // Eased at both ends, so the walk starts and stops gently.
  const eased = gone * gone * (3 - 2 * gone);
  const between = (key: keyof View) => OPENING[key] + (LEAVING[key] - OPENING[key]) * eased;
  const view = camera({ turn: between("turn"), tilt: between("tilt"), zoom: between("zoom"), lift: between("lift") });
  const slope = Math.hypot(CANOPY.out, CANOPY.drop);
  const lip: Point = [CANOPY.left, CANOPY.out, CANOPY.at - CANOPY.drop];
  const posts = [CANOPY.left, CANOPY.left + CANOPY.wide].map((x) => [view.at([x, CANOPY.out, CANOPY.at - CANOPY.drop]), view.at([x, CANOPY.out, 0])]);

  return (
    <svg
      role="img"
      aria-label="A shop in the rain with the name Awning in lights over its door. Its striped awning is out, and the ground under it is dry."
      viewBox="-90 -136 320 218"
      className={`shopfront overflow-visible ${className}`}
      fill="var(--color-bg)"
      stroke="currentColor"
      strokeWidth={1}
      strokeLinejoin="round"
    >
      <Rain streaks={STREAKS.filter(({ x, y }) => behindShop(x, y))} view={view} />

      {/* The slab the model stands on: its top, and the two edges that face the eye. */}
      <g transform={view.plane([SLAB.left, SLAB.back, 0], [1, 0, 0], [0, 1, 0])}>
        <rect width={SLAB.wide} height={SLAB.deep} />
        {/* The ground the awning keeps dry. */}
        <rect x={CANOPY.left - SLAB.left} y={-SLAB.back} width={CANOPY.wide} height={CANOPY.out} fill="currentColor" />
      </g>
      <g transform={view.plane([SLAB.left, SLAB.back + SLAB.deep, 0], [1, 0, 0], [0, 0, -1])}>
        <rect width={SLAB.wide} height={SLAB.thick} fill="currentColor" />
      </g>
      <g transform={view.plane([SLAB.left + SLAB.wide, SLAB.back + SLAB.deep, 0], [0, -1, 0], [0, 0, -1])}>
        <rect width={SLAB.deep} height={SLAB.thick} fill="currentColor" />
      </g>

      {/* The shop: roof, the side that faces the eye, and the front. */}
      <g transform={view.plane([0, 0, SHOP.tall], [1, 0, 0], [0, -1, 0])}>
        <rect width={SHOP.wide} height={SHOP.deep} />
        <rect x={4} y={4} width={SHOP.wide - 8} height={SHOP.deep - 8} />
      </g>
      <g transform={view.plane([SHOP.wide, 0, 0], [0, -1, 0], [0, 0, 1])}>
        <rect width={SHOP.deep} height={SHOP.tall} />
      </g>
      <g transform={view.plane([0, 0, 0], [1, 0, 0], [0, 0, 1])}>
        <Front />
      </g>

      {/* The table and stools, each a top on a leg. Drawn in paper with an ink edge, so they read on the dry ground and against the shop. */}
      {[...STOOLS, TABLE].map(({ x, y, tall, round }) => (
        <g key={x}>
          <g transform={view.plane([x - 0.7, y, 0], [1, 0, 0], [0, 0, 1])}>
            <rect width={1.4} height={tall} />
          </g>
          <g transform={view.plane([x, y, tall], [1, 0, 0], [0, 1, 0])}>
            <circle r={round} />
          </g>
        </g>
      ))}

      {posts.map(([head, foot]) => (
        <line key={head[0]} x1={head[0]} y1={head[1]} x2={foot[0]} y2={foot[1]} />
      ))}
      <g transform={view.plane([CANOPY.left, 0, CANOPY.at], [1, 0, 0], [0, CANOPY.out / slope, -CANOPY.drop / slope])}>
        <Stripes length={slope} />
      </g>
      <g transform={view.plane(lip, [1, 0, 0], [0, 0, -1])}>
        <Stripes length={CANOPY.valance} />
      </g>

      <Rain streaks={STREAKS.filter(({ x, y }) => !behindShop(x, y))} view={view} />
      {/* The name is lit, so it shows through the rain in front of it. */}
      <g transform={view.plane([0, 0, 0], [1, 0, 0], [0, 0, 1])}>
        <Sign />
      </g>
    </svg>
  );
}
