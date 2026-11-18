import type { ReactNode } from "react";

// The same three pictures (a bad day, its price, the payout) in four ways of drawing, to be chosen between.
// All four keep to the page's paper, its ink and the awning's amber.
const AMBER = "var(--color-lit)";
const INK = "currentColor";
const PAPER = "var(--color-bg)";

export type Picture = "day" | "price" | "paid";
export type Way = "cut" | "sketch" | "stamp" | "type";

const LABEL: Record<Picture, string> = {
  day: "A storm cloud in front of the sun, raining",
  price: "A ticket marked $300",
  paid: "A stack of coins, and one more arriving",
};

function Frame({ picture, children, className = "" }: { picture: Picture; children: ReactNode; className?: string }) {
  return (
    <svg role="img" aria-label={LABEL[picture]} viewBox="0 0 240 180" className={className}>
      {children}
    </svg>
  );
}

/** Cut paper: flat shapes in ink and amber laid over one another, with no line round anything. */
function Cut({ picture }: { picture: Picture }) {
  if (picture === "day") {
    return (
      <>
        <circle cx={170} cy={58} r={36} fill={AMBER} />
        <g fill={INK}>
          <circle cx={82} cy={88} r={30} />
          <circle cx={122} cy={72} r={40} />
          <circle cx={162} cy={94} r={26} />
          <rect x={56} y={88} width={132} height={32} rx={16} />
          {[76, 132].map((x) => (
            <rect key={x} x={x} y={134} width={9} height={26} rx={4.5} transform={`rotate(16 ${x} 134)`} />
          ))}
        </g>
        {[104, 160].map((x) => (
          <rect key={x} x={x} y={140} width={9} height={26} rx={4.5} fill={AMBER} transform={`rotate(16 ${x} 140)`} />
        ))}
      </>
    );
  }
  if (picture === "price") {
    return (
      <g transform="rotate(-6 120 90)">
        <rect x={46} y={54} width={164} height={92} rx={12} fill={INK} />
        <rect x={34} y={42} width={164} height={92} rx={12} fill={AMBER} />
        <circle cx={34} cy={88} r={11} fill={PAPER} />
        <circle cx={198} cy={88} r={11} fill={PAPER} />
        <g fill={INK}>
          {[52, 68, 84, 100, 116].map((y) => (
            <circle key={y} cx={156} cy={y} r={2.2} />
          ))}
          <text x={48} y={102} fontSize={38} fontWeight={700} letterSpacing={-2}>
            $300
          </text>
          <rect x={166} y={80} width={20} height={6} rx={3} />
          <rect x={166} y={93} width={13} height={6} rx={3} />
        </g>
      </g>
    );
  }
  return (
    <>
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <ellipse cx={104} cy={150 - i * 20} rx={50} ry={15} fill={INK} />
          <ellipse cx={104} cy={142 - i * 20} rx={50} ry={15} fill={AMBER} />
        </g>
      ))}
      <circle cx={184} cy={50} r={27} fill={INK} />
      <circle cx={179} cy={45} r={27} fill={AMBER} />
      <text x={179} y={57} fontSize={34} fontWeight={700} textAnchor="middle" fill={INK}>
        $
      </text>
      <g fill={INK}>
        <rect x={146} y={92} width={7} height={20} rx={3.5} />
        <rect x={164} y={100} width={7} height={14} rx={3.5} />
      </g>
    </>
  );
}

/** Sketch: drawn by hand with a marker, the amber filled in a little off the line the way a second colour prints. */
function Sketch({ picture }: { picture: Picture }) {
  const pen = { fill: "none", stroke: INK, strokeWidth: 3.2, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  return (
    <>
      <defs>
        {/* What makes a ruled line a hand's: it is pushed about, a little, by noise. */}
        <filter id="by-hand" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="7" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="5" />
        </filter>
      </defs>
      <g filter="url(#by-hand)">
        {picture === "day" && (
          <>
            <circle cx={176} cy={56} r={30} fill={AMBER} />
            <path d="M64 118a26 26 0 0 1 4-52 40 40 0 0 1 76-8 28 28 0 0 1 26 60Z" fill={PAPER} />
            <path d="M64 118a26 26 0 0 1 4-52 40 40 0 0 1 76-8 28 28 0 0 1 26 60Z" {...pen} />
            <path d="M176 22v-10M206 34l8-7M218 62h10" {...pen} />
            <path d="M80 134l-8 22M108 134l-8 22M136 134l-8 22M164 134l-8 22" {...pen} />
          </>
        )}
        {picture === "price" && (
          <g transform="rotate(-5 120 90)">
            <rect x={48} y={52} width={158} height={88} rx={10} fill={AMBER} />
            <path d="M40 54a10 10 0 0 1 10-10h140a10 10 0 0 1 10 10v22a12 12 0 0 0 0 24v22a10 10 0 0 1-10 10H50a10 10 0 0 1-10-10v-22a12 12 0 0 0 0-24Z" {...pen} />
            <path d="M158 52v72" {...pen} strokeDasharray="3 9" />
            <text x={52} y={103} fontSize={36} fontWeight={600} letterSpacing={-1.5} fill={INK}>
              $300
            </text>
            <path d="M168 82h18M168 96h11" {...pen} />
          </g>
        )}
        {picture === "paid" && (
          <>
            {[0, 1, 2].map((i) => (
              <g key={i}>
                <ellipse cx={110} cy={128 - i * 22} rx={46} ry={14} fill={AMBER} transform="translate(5 4)" />
                <ellipse cx={104} cy={128 - i * 22} rx={46} ry={14} {...pen} />
                <path d={`M58 ${128 - i * 22}v14a46 14 0 0 0 92 0v-14`} {...pen} />
              </g>
            ))}
            <circle cx={186} cy={52} r={24} fill={AMBER} transform="translate(5 4)" />
            <circle cx={182} cy={50} r={24} {...pen} />
            <path d="M182 38v24M176 44c8-6 16 2 6 6s-2 12 6 6" {...pen} strokeWidth={2.6} />
            <path d="M40 60l10 6M36 82h12M150 22l-4 12" {...pen} />
          </>
        )}
      </g>
    </>
  );
}

const STAMP: Record<Picture, { word: string; round: string; turn: number }> = {
  day: { word: "NAMED", round: "YOUR BAD DAY ★ IN YOUR OWN WORDS ★ ", turn: -9 },
  price: { word: "PRICED", round: "BY A MARKET ★ NOT BY AN INSURER ★ ", turn: 6 },
  paid: { word: "PAID", round: "LOCKED FIRST ★ ARRIVES BY ITSELF ★ ", turn: -5 },
};

/** Stamp: what a counter does to a ticket. A rubber stamp for each step, pressed a little off the straight. */
function Stamp({ picture }: { picture: Picture }) {
  const { word, round, turn } = STAMP[picture];
  return (
    <>
      <defs>
        <path id={`round-${picture}`} d="M120 90m-63 0a63 63 0 1 1 126 0a63 63 0 1 1-126 0" />
        {/* Ink from rubber never lands evenly: the edges are worn a little. */}
        <filter id="worn" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4" result="grain" />
          <feDisplacementMap in="SourceGraphic" in2="grain" scale="2.2" />
        </filter>
      </defs>
      <g transform={`rotate(${turn} 120 90)`} filter="url(#worn)">
        <circle cx={120} cy={90} r={80} fill="none" stroke={INK} strokeWidth={3.5} />
        <circle cx={120} cy={90} r={52} fill={AMBER} stroke={INK} strokeWidth={2} />
        <text fontSize={11.5} fontWeight={600} letterSpacing={2.6} fill={INK}>
          <textPath href={`#round-${picture}`} textLength={390}>
            {round}
          </textPath>
        </text>
        <text x={120} y={100} fontSize={word.length > 5 ? 25 : 30} fontWeight={700} letterSpacing={1} textAnchor="middle" fill={INK}>
          {word}
        </text>
        <path d="M84 110h72" stroke={INK} strokeWidth={2} />
        <path d="M84 70h72" stroke={INK} strokeWidth={2} />
      </g>
    </>
  );
}

const TYPE: Record<Picture, string> = { day: "“…”", price: "$35", paid: "+$300" };

/** Type: no picture at all. The figure itself, set as large as it will go, with the awning's colour run under it like a marker. */
function Type({ picture, className = "" }: { picture: Picture; className?: string }) {
  return (
    <p role="img" aria-label={LABEL[picture]} className={`flex items-end ${className}`}>
      <span className="bg-[linear-gradient(transparent_58%,var(--color-lit)_0)] px-2 text-[clamp(4.5rem,8vw,7rem)] leading-[0.95] font-[650] tracking-[-0.06em]">{TYPE[picture]}</span>
    </p>
  );
}

/** One of the three pictures, drawn one of the four ways. */
export function Art({ way, picture, className = "" }: { way: Way; picture: Picture; className?: string }) {
  if (way === "type") return <Type picture={picture} className={className} />;
  const Drawn = { cut: Cut, sketch: Sketch, stamp: Stamp }[way];
  return (
    <Frame picture={picture} className={className}>
      <Drawn picture={picture} />
    </Frame>
  );
}
