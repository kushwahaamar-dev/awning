// The site's pictures, apart from the one a page opens on: drawn by hand with a marker, in the page's ink, with
// the awning's amber filled in a little off the line, the way a second colour lands when it is printed.
const AMBER = "var(--color-lit)";
const INK = "currentColor";
const PAPER = "var(--color-card)";
// What is drawn on top of the amber stays dark on a dark page too, or it would be pale on pale.
const ON_AMBER = "var(--color-ink)";
// The marker. How heavy it is comes from the drawing as a whole, so a drawing shown small can be given a fatter one.
const PEN = { fill: "none", stroke: INK, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const CLOUD = "M64 118a26 26 0 0 1 4-52 40 40 0 0 1 76-8 28 28 0 0 1 26 60Z";

const PICTURES = {
  say: "A speech bubble",
  price: "A ticket marked $300",
  paid: "A stack of coins, and one more arriving",
  day: "A storm cloud in front of the sun, raining",
  cold: "A cloud with snow coming down",
  hot: "A blazing sun",
  fuel: "A drop of fuel",
  lock: "A padlock, shut",
  awning: "A striped awning",
  week: "A week of sales as bars, with one day far shorter than the rest under a rain cloud",
};

export type Picture = keyof typeof PICTURES;

function Say() {
  return (
    <>
      <rect x={44} y={46} width={168} height={84} rx={18} fill={AMBER} />
      <path d="M52 38h136a16 16 0 0 1 16 16v52a16 16 0 0 1-16 16h-76l-32 28v-28H52a16 16 0 0 1-16-16V54a16 16 0 0 1 16-16Z" {...PEN} fill={PAPER} />
      {[84, 120, 156].map((x) => (
        <circle key={x} cx={x} cy={80} r={6} fill={INK} />
      ))}
    </>
  );
}

function Price() {
  return (
    <g transform="rotate(-5 120 90)">
      <rect x={48} y={52} width={158} height={88} rx={10} fill={AMBER} />
      {/* A ticket's outline, with the half-moons punched out of its two ends. */}
      <path d="M40 54a10 10 0 0 1 10-10h140a10 10 0 0 1 10 10v22a12 12 0 0 0 0 24v22a10 10 0 0 1-10 10H50a10 10 0 0 1-10-10v-22a12 12 0 0 0 0-24Z" {...PEN} />
      <path d="M158 52v72" {...PEN} stroke={ON_AMBER} strokeDasharray="3 9" />
      <text x={52} y={103} fontSize={36} fontWeight={600} letterSpacing={-1.5} fill={ON_AMBER}>
        $300
      </text>
      <path d="M168 82h18M168 96h11" {...PEN} stroke={ON_AMBER} />
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
      <path d="M182 38v24M176 44c8-6 16 2 6 6s-2 12 6 6" {...PEN} stroke={ON_AMBER} />
      <path d="M40 60l10 6M36 82h12M150 22l-4 12" {...PEN} />
    </>
  );
}

function Day() {
  return (
    <>
      <circle cx={176} cy={56} r={30} fill={AMBER} />
      <path d={CLOUD} {...PEN} fill={PAPER} />
      <path d="M176 22v-10M206 34l8-7M218 62h10" {...PEN} />
      <path d="M80 134l-8 22M108 134l-8 22M136 134l-8 22M164 134l-8 22" {...PEN} />
    </>
  );
}

function Cold() {
  return (
    <>
      <path d={CLOUD} fill={AMBER} stroke="none" transform="translate(7 6)" />
      <path d={CLOUD} {...PEN} fill={PAPER} />
      {/* Each flake is three short strokes crossed. */}
      {[78, 116, 154].map((x, i) => (
        <path key={x} d="M0-10v20M-9-5l18 10M9-5l-18 10" transform={`translate(${x} ${i === 1 ? 156 : 146})`} {...PEN} />
      ))}
    </>
  );
}

function Hot() {
  return (
    <>
      <circle cx={126} cy={96} r={40} fill={AMBER} />
      <circle cx={120} cy={90} r={40} {...PEN} />
      {Array.from({ length: 8 }, (_, i) => (
        <path key={i} d="M0-56v-18" transform={`translate(120 90) rotate(${i * 45})`} {...PEN} />
      ))}
    </>
  );
}

function Fuel() {
  const drop = "M120 24c30 38 46 62 46 86a46 46 0 0 1-92 0c0-24 16-48 46-86Z";
  return (
    <>
      <path d={drop} fill={AMBER} stroke="none" transform="translate(7 6)" />
      <path d={drop} {...PEN} />
      <path d="M96 112a24 24 0 0 0 16 22" {...PEN} />
    </>
  );
}

function Lock() {
  return (
    <>
      <rect x={76} y={84} width={100} height={76} rx={12} fill={AMBER} />
      <rect x={70} y={78} width={100} height={76} rx={12} {...PEN} />
      <path d="M90 78V58a30 30 0 0 1 60 0v20" {...PEN} />
      <circle cx={120} cy={110} r={8} {...PEN} stroke={ON_AMBER} />
      <path d="M120 118v16" {...PEN} stroke={ON_AMBER} />
      <path d="M186 62l12-8M192 84h14M52 62l-12-8" {...PEN} />
    </>
  );
}

function Awning() {
  return (
    <>
      {/* Every other stripe is in the awning's colour. */}
      <path d="M70 50h20l-18 62H40ZM110 50h20l6 62h-32ZM150 50h20l30 62h-32Z" fill={AMBER} stroke="none" transform="translate(6 5)" />
      <path d="M70 50h100l30 62H40Z" {...PEN} />
      <path d="M90 50l-18 62M110 50l-6 62M130 50l6 62M150 50l18 62" {...PEN} />
      <path d="M40 112a16 14 0 0 0 32 0a16 14 0 0 0 32 0a16 14 0 0 0 32 0a16 14 0 0 0 32 0a16 14 0 0 0 32 0" {...PEN} />
    </>
  );
}

// A week of takings, and the day the weather took. The days either side of it are kept low, so the cloud over it has clear sky to sit in.
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
      <path d="M118 96a12 12 0 0 1 2-24 18 18 0 0 1 34-3 13 13 0 0 1 10 27Z" {...PEN} />
      <path d="M126 106l-4 12M142 106l-4 12M158 106l-4 12" {...PEN} />
    </>
  );
}

const DRAWN = { say: Say, price: Price, paid: Paid, day: Day, cold: Cold, hot: Hot, fuel: Fuel, lock: Lock, awning: Awning, week: Week };

/**
 * One of the site's hand-drawn pictures. It takes the text colour for its ink.
 * @param small drawn with a fatter marker, for a picture shown the size of a stamp
 */
export function Sketch({ of, small = false, className = "" }: { of: Picture; small?: boolean; className?: string }) {
  const Drawn = DRAWN[of];
  const hand = `by-hand-${of}`;
  return (
    <svg role="img" aria-label={PICTURES[of]} viewBox="0 0 240 180" className={className} strokeWidth={small ? 10 : 3.2}>
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

/** The small picture set beside a section's name. It says nothing the name doesn't, so it is hidden from screen readers. */
export function Stamp({ of }: { of: Picture }) {
  return (
    <span aria-hidden className="stamp">
      <Sketch of={of} small className="w-10" />
    </span>
  );
}
