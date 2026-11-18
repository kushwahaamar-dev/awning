import type { ReactNode } from "react";
import { camera, radians, type Point } from "./iso";

// Small things drawn the way the shop at the top of the landing page is: in line, on a slab, seen from the same
// side and height, with the awning's amber as the one colour. Each is a model measured in its own units.
const TURN = radians(32);
const { at, plane } = camera({ turn: TURN, tilt: radians(24), zoom: 1, lift: 0 });
const AMBER = "var(--color-lit)";
const INK = "currentColor";

/** Flat on the ground, or on top of something: x runs right and y comes towards the eye. */
const flat = (corner: Point) => plane(corner, [1, 0, 0], [0, 1, 0]);
/** Standing, facing the eye. Measured down from its top left corner, the way a page is, so words on it read. */
const facing = (corner: Point) => plane(corner, [1, 0, 0], [0, 0, -1]);
/** Standing, facing right, running back from its top front corner. */
const sideways = (corner: Point) => plane(corner, [0, -1, 0], [0, 0, -1]);

type Solid = { from: Point; size: [wide: number, deep: number, tall: number]; fill?: string; children?: ReactNode };

/** A box standing with its front bottom left corner at `from`. `children` are drawn on its front, measured from the top left. */
function Box({ from: [x, y, z], size: [wide, deep, tall], fill, children }: Solid) {
  return (
    <g fill={fill}>
      <rect transform={flat([x, y - deep, z + tall])} width={wide} height={deep} />
      <rect transform={sideways([x + wide, y, z + tall])} width={deep} height={tall} />
      <g transform={facing([x, y, z + tall])}>
        <rect width={wide} height={tall} />
        {children}
      </g>
    </g>
  );
}

/** The slab a model stands on: its top, and the two edges that face the eye, in ink. */
function Slab({ wide, deep }: { wide: number; deep: number }) {
  return (
    <>
      <rect transform={flat([0, 0, 0])} width={wide} height={deep} />
      <rect transform={facing([0, deep, 0])} width={wide} height={3} fill={INK} />
      <rect transform={sideways([wide, deep, 0])} width={deep} height={3} fill={INK} />
    </>
  );
}

/** A round thing with some height: a coin, a pot. The top can be given the awning's colour. */
function Drum({ on: [x, y, z], round, tall, top }: { on: Point; round: number; tall: number; top?: string }) {
  // The two edges of a drum are where a level circle looks widest, which is across the line of sight.
  const [dx, dy] = [Math.cos(TURN) * round, -Math.sin(TURN) * round];
  const corners = [at([x + dx, y + dy, z]), at([x + dx, y + dy, z + tall]), at([x - dx, y - dy, z + tall]), at([x - dx, y - dy, z])];
  return (
    <>
      <circle transform={flat([x, y, z])} r={round} />
      <polygon points={corners.map((corner) => corner.map((n) => n.toFixed(2)).join(",")).join(" ")} stroke="none" />
      <line x1={corners[0][0]} y1={corners[0][1]} x2={corners[1][0]} y2={corners[1][1]} />
      <line x1={corners[3][0]} y1={corners[3][1]} x2={corners[2][0]} y2={corners[2][1]} />
      <circle transform={flat([x, y, z + tall])} r={round} fill={top} />
    </>
  );
}

/** A top on a leg: a table, or a stool. */
function Stand({ on: [x, y], round, tall, cap = 0 }: { on: [x: number, y: number]; round: number; tall: number; cap?: number }) {
  const [foot, head] = [at([x, y, 0]), at([x, y, tall])];
  return (
    <>
      <line x1={foot[0]} y1={foot[1]} x2={head[0]} y2={head[1]} />
      <circle transform={flat([x, y, tall])} r={round} />
      {/* Snow lying on it: a second, rounder top. */}
      {cap > 0 && <Drum on={[x, y, tall]} round={round} tall={cap} />}
    </>
  );
}

// Where snow is in the air, and how big each flake is. The same every time.
const FLAKES: [Point, number][] = [
  [[8, 12, 44], 2.6],
  [[26, 30, 58], 1.8],
  [[44, 8, 50], 2.6],
  [[58, 44, 64], 1.8],
  [[70, 20, 46], 2.6],
  [[84, 52, 54], 1.8],
  [[96, 14, 60], 2.6],
  [[16, 56, 34], 1.8],
  [[36, 60, 50], 2.6],
  [[88, 30, 34], 1.8],
  [[102, 58, 38], 2.6],
  [[66, 64, 34], 1.8],
  [[24, 6, 30], 1.8],
  [[6, 40, 60], 1.8],
];

/** The tables outside, and the weather that empties them: snow lying and falling, or a sun too hot to sit under. */
function Patio({ weather }: { weather: "cold" | "hot" }) {
  const cap = weather === "cold" ? 2.6 : 0;
  const sun = at([14, 0, 46]);
  return (
    <>
      <Slab wide={110} deep={70} />
      <Stand on={[30, 26]} round={7.5} tall={14} cap={cap} />
      <Stand on={[57, 38]} round={16} tall={24} cap={cap} />
      <Stand on={[88, 48]} round={7.5} tall={14} cap={cap} />
      {weather === "cold" &&
        FLAKES.map(([point, size]) => {
          const [x, y] = at(point);
          // A flake is three short strokes crossed.
          return (
            <g key={point.join()} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}>
              {[0, 60, 120].map((turn) => (
                <line key={turn} y1={-size} y2={size} transform={`rotate(${turn})`} />
              ))}
            </g>
          );
        })}
      {weather === "hot" && (
        <g transform={`translate(${sun[0].toFixed(1)} ${sun[1].toFixed(1)})`}>
          {Array.from({ length: 12 }, (_, i) => (
            <line key={i} y1={-17} y2={-23} transform={`rotate(${i * 30})`} />
          ))}
          <circle r={13} fill={AMBER} />
        </g>
      )}
    </>
  );
}

/** A delivery van at a fuel pump: what a jump in the price of oil costs. */
function Van() {
  return (
    <>
      <Slab wide={118} deep={64} />
      {/* The van: its load, then its cab, seen from the side with its nose to the right. A wheel sits on the bottom edge of each. */}
      <Box from={[30, 40, 6]} size={[52, 26, 32]}>
        <rect y={13} width={52} height={7} fill={AMBER} />
        <circle cx={13} cy={32} r={6.5} />
      </Box>
      <Box from={[82, 40, 6]} size={[24, 26, 23]}>
        <rect x={6} y={4} width={13} height={8} />
        <circle cx={12} cy={23} r={6.5} />
      </Box>
      {/* The pump it has pulled up at, nearer the eye, with its price lit. */}
      <Box from={[6, 58, 0]} size={[13, 10, 32]}>
        <rect x={2.5} y={4} width={8} height={7} fill={AMBER} />
        <line x1={2.5} y1={15} x2={10.5} y2={15} />
        <line x1={2.5} y1={19} x2={10.5} y2={19} />
      </Box>
    </>
  );
}

/** Cover as a thing you hold: a ticket standing under the awning's stripes, with what it pays written on it. */
function Ticket({ pays }: { pays: string }) {
  return (
    <>
      <Slab wide={104} deep={52} />
      <Box from={[16, 30, 0]} size={[72, 3, 50]}>
        {[0, 2, 4, 6, 8].map((i) => (
          <rect key={i} x={i * 8} width={8} height={7} fill={AMBER} />
        ))}
        <line y1={7} y2={7} x2={72} />
        <text x={8} y={25} fontSize={13} fill={INK} stroke="none" letterSpacing={-0.5}>
          {pays}
        </text>
        <line x1={8} y1={33} x2={46} y2={33} />
        <line x1={8} y1={39} x2={34} y2={39} />
        <rect x={44} y={37} width={20} height={8} rx={4} fill={AMBER} />
      </Box>
    </>
  );
}

/** The payout: coins in two stacks, and one more on its way down. */
function Coins() {
  const stack = (x: number, y: number, count: number) => Array.from({ length: count }, (_, i) => <Drum key={`${x}-${i}`} on={[x, y, i * 3.6]} round={11} tall={3.6} top={AMBER} />);
  const falling = [at([44, 30, 44]), at([44, 30, 52])];
  return (
    <>
      <Slab wide={104} deep={58} />
      {stack(70, 22, 2)}
      {stack(44, 30, 5)}
      <Drum on={[44, 30, 30]} round={11} tall={3.6} top={AMBER} />
      <line x1={falling[0][0] - 6} y1={falling[0][1]} x2={falling[1][0] - 6} y2={falling[1][1]} />
      <line x1={falling[0][0] + 6} y1={falling[0][1] - 3} x2={falling[1][0] + 6} y2={falling[1][1] - 3} />
    </>
  );
}

/** Where the payout waits: a safe, shut. */
function Safe() {
  return (
    <>
      <Slab wide={100} deep={60} />
      <Box from={[26, 42, 0]} size={[48, 34, 46]}>
        <rect x={5} y={5} width={38} height={36} />
        <circle cx={24} cy={23} r={8} fill={AMBER} />
        <line x1={24} y1={15} x2={24} y2={19} />
        <line x1={36} y1={18} x2={36} y2={28} />
      </Box>
    </>
  );
}

// A week of takings, and the day the weather took.
const TAKINGS = [20, 27, 23, 31, 8, 25, 29];

/** A week of sales as bars, with the bad day short and in the awning's colour. */
function Week() {
  return (
    <>
      <Slab wide={112} deep={44} />
      {TAKINGS.map((tall, i) => (
        <Box key={i} from={[8 + i * 14, 28, 0]} size={[9, 9, tall]} fill={tall < 10 ? AMBER : undefined} />
      ))}
    </>
  );
}

// Each drawing with the part of the picture it fills, so none sits small in an empty frame.
const SUBJECTS = {
  cold: { draw: <Patio weather="cold" />, frame: "-42 -54 140 110", label: "Tables outside a shop, empty, with snow lying on them and more coming down" },
  hot: { draw: <Patio weather="hot" />, frame: "-42 -54 140 110", label: "Tables outside a shop, empty, under a hot sun" },
  fuel: { draw: <Van />, frame: "-38 -30 142 86", label: "A delivery van at a fuel pump" },
  ticket: { draw: null, frame: "-32 -40 126 86", label: "A ticket under striped awning, marked with what it pays" },
  coins: { draw: <Coins />, frame: "-35 -36 128 86", label: "Two stacks of coins, with one more coin landing" },
  safe: { draw: <Safe />, frame: "-36 -42 126 92", label: "A safe, shut" },
  week: { draw: <Week />, frame: "-28 -22 128 70", label: "A week of sales as bars, one day far shorter than the rest" },
};

export type Subject = keyof typeof SUBJECTS;

/**
 * One of the site's line drawings. It takes the text colour for its ink.
 * @param pays what the ticket says it pays, when the drawing is the ticket
 */
export function Drawing({ subject, pays = "$300", className = "" }: { subject: Subject; pays?: string; className?: string }) {
  const { draw, frame, label } = SUBJECTS[subject];
  return (
    <svg role="img" aria-label={label} viewBox={frame} className={`drawing ${className}`} fill="var(--color-bg)" stroke={INK} strokeWidth={1} strokeLinejoin="round">
      {draw ?? <Ticket pays={pays} />}
    </svg>
  );
}
