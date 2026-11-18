// The pictures under the first screen and inside the app: drawn by hand with a marker, in the page's ink, with
// the awning's amber filled in a little off the line, the way a second colour lands when it is printed.
const AMBER = "var(--color-lit)";
const INK = "currentColor";
const PAPER = "var(--color-bg)";
const PEN = { fill: "none", stroke: INK, strokeWidth: 3.2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

const PICTURES = {
  day: "A storm cloud in front of the sun, raining",
  price: "A ticket marked $300",
  paid: "A stack of coins, and one more arriving",
  lock: "A padlock, shut",
  week: "A week of sales as bars, with one day far shorter than the rest under a rain cloud",
};

export type Picture = keyof typeof PICTURES;

function Day() {
  const cloud = "M64 118a26 26 0 0 1 4-52 40 40 0 0 1 76-8 28 28 0 0 1 26 60Z";
  return (
    <>
      <circle cx={176} cy={56} r={30} fill={AMBER} />
      <path d={cloud} fill={PAPER} />
      <path d={cloud} {...PEN} />
      <path d="M176 22v-10M206 34l8-7M218 62h10" {...PEN} />
      <path d="M80 134l-8 22M108 134l-8 22M136 134l-8 22M164 134l-8 22" {...PEN} />
    </>
  );
}

function Price() {
  return (
    <g transform="rotate(-5 120 90)">
      <rect x={48} y={52} width={158} height={88} rx={10} fill={AMBER} />
      {/* A ticket's outline, with the half-moons punched out of its two ends. */}
      <path d="M40 54a10 10 0 0 1 10-10h140a10 10 0 0 1 10 10v22a12 12 0 0 0 0 24v22a10 10 0 0 1-10 10H50a10 10 0 0 1-10-10v-22a12 12 0 0 0 0-24Z" {...PEN} />
      <path d="M158 52v72" {...PEN} strokeDasharray="3 9" />
      <text x={52} y={103} fontSize={36} fontWeight={600} letterSpacing={-1.5} fill={INK}>
        $300
      </text>
      <path d="M168 82h18M168 96h11" {...PEN} />
    </g>
  );
}

function Paid() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <ellipse cx={110} cy={128 - i * 22} rx={46} ry={14} fill={AMBER} transform="translate(5 4)" />
          <ellipse cx={104} cy={128 - i * 22} rx={46} ry={14} {...PEN} />
          <path d={`M58 ${128 - i * 22}v14a46 14 0 0 0 92 0v-14`} {...PEN} />
        </g>
      ))}
      <circle cx={186} cy={52} r={24} fill={AMBER} transform="translate(5 4)" />
      <circle cx={182} cy={50} r={24} {...PEN} />
      <path d="M182 38v24M176 44c8-6 16 2 6 6s-2 12 6 6" {...PEN} strokeWidth={2.6} />
      <path d="M40 60l10 6M36 82h12M150 22l-4 12" {...PEN} />
    </>
  );
}

function Lock() {
  return (
    <>
      <rect x={76} y={84} width={100} height={76} rx={12} fill={AMBER} />
      <rect x={70} y={78} width={100} height={76} rx={12} {...PEN} />
      <path d="M90 78V58a30 30 0 0 1 60 0v20" {...PEN} />
      <circle cx={120} cy={110} r={8} {...PEN} />
      <path d="M120 118v16" {...PEN} />
      <path d="M186 62l12-8M192 84h14M52 62l-12-8" {...PEN} />
    </>
  );
}

// A week of takings, and the day the weather took.
const TAKINGS = [66, 88, 56, 22, 52, 92];

function Week() {
  return (
    <>
      {TAKINGS.map((tall, i) => (
        <g key={i}>
          {tall < 30 && <rect x={38 + i * 30} y={160 - tall + 4} width={20} height={tall} fill={AMBER} />}
          <rect x={34 + i * 30} y={160 - tall} width={20} height={tall} rx={2} {...PEN} />
        </g>
      ))}
      <path d="M22 160h196" {...PEN} />
      {/* The cloud over the short day. */}
      <path d="M118 96a12 12 0 0 1 2-24 18 18 0 0 1 34-3 13 13 0 0 1 10 27Z" {...PEN} />
      <path d="M126 106l-4 12M142 106l-4 12M158 106l-4 12" {...PEN} strokeWidth={2.6} />
    </>
  );
}

const DRAWN = { day: Day, price: Price, paid: Paid, lock: Lock, week: Week };

/** One of the site's hand-drawn pictures. It takes the text colour for its ink. */
export function Sketch({ of, className = "" }: { of: Picture; className?: string }) {
  const Drawn = DRAWN[of];
  const hand = `by-hand-${of}`;
  return (
    <svg role="img" aria-label={PICTURES[of]} viewBox="0 0 240 180" className={className}>
      <defs>
        {/* What makes a ruled line a hand's: it is pushed about, a little, by noise. */}
        <filter id={hand} x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="7" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="5" />
        </filter>
      </defs>
      <g filter={`url(#${hand})`}>
        <Drawn />
      </g>
    </svg>
  );
}
