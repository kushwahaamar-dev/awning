import { Grid, clamp, rng, smooth } from "ascii-magic-art/lib/kit.js";
import type { Piece } from "ascii-magic-art/runtime/glyphs.js";

// Awning's own piece, made the way the library's are: a shop in the rain, seen from the street, whose awning
// rolls out. Once it is out the last of the rain under it falls away and the ground there is dry, in ink, as it
// is under the shop at the top of the landing page. Drawn on square cells, one dot to a cell.
const COLS = 120;
const ROWS = 66;
const GROUND = 62;
const SHOP = { left: 16, right: 103, top: 6 };
const BOARD = { left: 28, right: 91, top: 9, bottom: 21 };
// The awning is fixed along this line and lets out downwards, spreading as it comes towards the eye.
const HINGE = { y: 25, left: 22, right: 97 };
const REACH = 14;
const SPREAD = 8;
const STRIPES = 9;
const OPENS_AT = 0.7;
const TAKES = 1.5;
const FALL = 30; // cells a second

// The name over the door, in the dots of a shop's sign: seven rows to a letter, five dots across.
const LETTERS: Record<string, string[]> = {
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  W: ["#...#", "#...#", "#...#", "#.#.#", "#.#.#", "#.#.#", ".#.#."],
  N: ["#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#", "#...#"],
  I: [".###.", "..#..", "..#..", "..#..", "..#..", "..#..", ".###."],
  G: [".###.", "#...#", "#....", "#.###", "#...#", "#...#", ".###."],
};
// How much of its cell a mark covers, a quarter at a time. The printer turns that into the size of the dot.
const INK = ["", "░", "▒", "▓", "█"];

export const meta: Piece["meta"] & { cell: "square" } = {
  name: "Awning Out",
  cell: "square",
  cols: COLS,
  rows: ROWS,
  fps: 20,
  palette: { w: "#ffffff", a: "#f2b54a" },
};

export default function create(): ReturnType<Piece["default"]> {
  const grid = new Grid(COLS, ROWS);
  const random = rng(7);
  // Where rain comes down, and when: the same every time, so it is the same rain on every screen.
  const drops = Array.from({ length: COLS }, () => (random() < 0.6 ? [random(), random()] : []));
  const splashes = Array.from({ length: COLS }, () => random());
  const put = (x: number, y: number, ink: number, colour = "w") => grid.set(x, y, INK[ink], colour);

  return (t) => {
    grid.clear();
    const out = smooth(clamp((t - OPENS_AT) / TAKES));
    const hem = HINGE.y + out * REACH;
    /** How far the awning has spread, each side, by the time it is this far down. */
    const spread = (y: number) => (SPREAD * (y - HINGE.y)) / REACH;
    const [from, to] = [HINGE.left - spread(hem), HINGE.right + spread(hem)];
    // Once the awning starts out no new rain gets under it, and what was already falling there falls away.
    const cleared = t > OPENS_AT ? HINGE.y + FALL * (t - OPENS_AT) : HINGE.y;

    for (let x = 0; x < COLS; x++) {
      for (const phase of drops[x]) {
        const head = Math.floor(((t * FALL + phase * 90) % (GROUND + 12)) - 6);
        for (let tail = 0; tail < 3; tail++) {
          const y = head - tail;
          if (y < 0 || y >= GROUND) continue;
          // The name is lit, so it shows through the rain in front of it.
          if (x >= BOARD.left && x <= BOARD.right && y >= BOARD.top && y <= BOARD.bottom) continue;
          if (out > 0 && x >= from && x <= to && y > HINGE.y && y < cleared) continue;
          put(x, y, tail === 0 ? 3 : 2);
        }
      }
    }

    // The shop: its roof, its walls, the board and the name on it.
    for (let x = SHOP.left - 2; x <= SHOP.right + 2; x++) put(x, SHOP.top, 4);
    for (let y = SHOP.top + 1; y < GROUND; y++) {
      put(SHOP.left, y, 3);
      put(SHOP.right, y, 3);
    }
    for (let x = BOARD.left; x <= BOARD.right; x++) {
      put(x, BOARD.top, 3);
      put(x, BOARD.bottom, 3);
    }
    for (let y = BOARD.top; y <= BOARD.bottom; y++) {
      put(BOARD.left, y, 3);
      put(BOARD.right, y, 3);
    }
    [..."AWNING"].forEach((letter, i) =>
      LETTERS[letter].forEach((row, r) => {
        for (let c = 0; c < row.length; c++) if (row[c] === "#") put(40 + i * 7 + c, 12 + r, 4);
      }),
    );

    // The door, the window, and the table and stools the awning is for.
    for (let y = 44; y < GROUND; y++) {
      put(24, y, 3);
      put(37, y, 3);
    }
    for (let x = 24; x <= 37; x++) put(x, 44, 3);
    put(34, 54, 4);
    for (let x = 46; x <= 94; x++) {
      put(x, 44, 3);
      put(x, 53, 3);
    }
    for (let y = 44; y <= 53; y++) for (const x of [46, 62, 78, 94]) put(x, y, 3);
    for (let x = 58; x <= 72; x++) put(x, 57, 4);
    for (let y = 58; y < GROUND; y++) put(65, y, 4);
    for (const stool of [50, 78]) {
      for (let x = stool; x <= stool + 4; x++) put(x, 59, 4);
      for (let y = 60; y < GROUND; y++) put(stool + 2, y, 4);
    }

    // The ground: wet and splashing, and solid ink under the awning as it comes out.
    for (let x = 0; x < COLS; x++) {
      if (out > 0 && x >= from && x <= to) {
        put(x, GROUND, 4);
        put(x, GROUND + 1, Math.ceil(out * 4));
        put(x, GROUND + 2, Math.ceil(out * 4));
      } else {
        put(x, GROUND, 3);
        if ((splashes[x] + t * 1.7) % 1 < 0.16) put(x, GROUND - 1, 2);
      }
    }

    // The awning: rolled against the wall, then let out. Every other stripe is the awning's colour; the ones
    // between are left as paper and closed off by a hem, so it reads as one cloth and not five flags.
    const last = Math.floor(hem) + 2;
    for (let y = HINGE.y; y <= last; y++) {
      const wide = spread(Math.min(y, hem));
      const [left, right] = [HINGE.left - wide, HINGE.right + wide];
      for (let x = Math.ceil(left); x <= Math.floor(right); x++) {
        const along = ((x - left) / (right - left + 0.001)) * STRIPES;
        const within = along - Math.floor(along);
        // Below the hem each stripe ends in a tongue a little narrower than itself: the scallops of the valance.
        const cutAway = y === last && (within < 0.2 || within > 0.8);
        if (cutAway) grid.set(x, y, " ", " ");
        else if (Math.floor(along) % 2 === 0) put(x, y, 4, "a");
        else if (y === last && out > 0) put(x, y, 3);
        else grid.set(x, y, " ", " ");
      }
      put(Math.round(left), y, 4);
      put(Math.round(right), y, 4);
    }
    for (let x = HINGE.left; x <= HINGE.right; x++) put(x, HINGE.y - 1, 4);
    return grid.frame();
  };
}
