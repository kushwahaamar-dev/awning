// Spot illustrations, drawn in the brand's colours on a 96-unit square.

const INK = "#0d1454";
const CREAM = "#fff6e6";
const SUN = "#ffd23f";
const PERSIMMON = "#ff5a2b";
const COBALT = "#2743f5";
const PINK = "#ffb8d2";

type Props = { className?: string };

/** A cone on a cold day. */
export function IceCream({ className }: Props) {
  return (
    <svg aria-hidden viewBox="0 0 96 96" className={`bg-haze ${className ?? ""}`}>
      <clipPath id="art-cone">
        <path d="M31 47h34L48 88Z" />
      </clipPath>
      <path d="M31 47h34L48 88Z" fill={SUN} />
      <path
        clipPath="url(#art-cone)"
        d="M34 44l22 40M43 44l22 40M52 44l22 40M25 44l22 40M62 44 40 84M53 44 31 84M44 44 22 84M71 44 49 84"
        stroke={INK}
        strokeOpacity={0.3}
        strokeWidth={1.5}
      />
      <path d="M28 46a20 20 0 0 1 40 0 6.67 6.67 0 0 1-13.33 0 6.67 6.67 0 0 1-13.34 0 6.67 6.67 0 0 1-13.33 0Z" fill={PINK} />
      <path d="M35.5 41a13 13 0 0 1 6.5-10" fill="none" stroke={CREAM} strokeWidth={3} strokeLinecap="round" />
      <circle cx="50" cy="23" r="6" fill={PERSIMMON} />
      <path d="M50 17.5c1-5 4-7.5 8-8" fill="none" stroke={INK} strokeWidth={2} strokeLinecap="round" />
      <path d="M76 22v14M70 25.5l12 7M82 25.5l-12 7" stroke={COBALT} strokeWidth={2.5} strokeLinecap="round" />
      <path d="M17 58v10M12.7 60.5l8.6 5M21.3 60.5l-8.6 5" stroke={COBALT} strokeWidth={2} strokeLinecap="round" />
    </svg>
  );
}

/** A delivery van on the road. */
export function Van({ className }: Props) {
  return (
    <svg aria-hidden viewBox="0 0 96 96" className={`bg-sun ${className ?? ""}`}>
      <path d="M8 77h80" stroke={INK} strokeOpacity={0.3} strokeWidth={2} strokeLinecap="round" />
      <path d="M3 44h6M1 52h8M4 60h5" stroke={INK} strokeWidth={2} strokeLinecap="round" />
      <rect x="13" y="31" width="47" height="38" rx="5" fill={CREAM} />
      <path d="M13 49h47v8H13z" fill={PERSIMMON} />
      <path d="M60 40h14a4 4 0 0 1 3.3 1.7L87 55.5V65a4 4 0 0 1-4 4H60Z" fill={COBALT} />
      <path d="M64.5 44.5h8.5l6.5 9.5h-15Z" fill="#d3daff" />
      <circle cx="29" cy="70" r="9" fill={INK} />
      <circle cx="29" cy="70" r="3.5" fill={CREAM} />
      <circle cx="71" cy="70" r="9" fill={INK} />
      <circle cx="71" cy="70" r="3.5" fill={CREAM} />
    </svg>
  );
}

/** A pint under the home team's pennant. */
export function Pint({ className }: Props) {
  return (
    <svg aria-hidden viewBox="0 0 96 96" className={`bg-pink ${className ?? ""}`}>
      <path d="M71 12v46" stroke={INK} strokeWidth={3} strokeLinecap="round" />
      <path d="M71 14l19 9-19 9Z" fill={PERSIMMON} />
      <path d="M27 38h36l-4.2 44.4a4 4 0 0 1-4 3.6H35.2a4 4 0 0 1-4-3.6Z" fill={SUN} />
      <path d="M37.5 50l2 26" stroke={CREAM} strokeWidth={3.5} strokeLinecap="round" />
      <path d="M26 41a8 8 0 0 1 2.5-15.5 10 10 0 0 1 18-4 9 9 0 0 1 14.5 5A7.5 7.5 0 0 1 64 41Z" fill={CREAM} />
      <path d="M55 40v9a3.5 3.5 0 0 0 7 0v-9Z" fill={CREAM} />
    </svg>
  );
}

/** Step one: say it. */
export function Speech({ className }: Props) {
  return (
    <svg aria-hidden viewBox="0 0 96 96" className={className}>
      <path d="M26 18h40a16 16 0 0 1 16 16v14a16 16 0 0 1-16 16H44L24 80l3-17.3A16 16 0 0 1 10 48V34a16 16 0 0 1 16-16Z" fill={COBALT} />
      <path d="M28 36v10M38 30v22M48 34v14M58 28v26M68 37v8" stroke={CREAM} strokeWidth={5} strokeLinecap="round" />
      <circle cx="82" cy="14" r="7" fill={PERSIMMON} />
    </svg>
  );
}

/** Step two: see the price. */
export function Slip({ className }: Props) {
  return (
    <svg aria-hidden viewBox="0 0 96 96" className={className}>
      <path d="M22 8h48v76l-6-5-6 5-6-5-6 5-6-5-6 5-6-5-6 5Z" fill={CREAM} />
      <path d="M30 22h32M30 32h20" stroke={INK} strokeOpacity={0.3} strokeWidth={4} strokeLinecap="round" />
      <path d="M28 41h36v11H28z" fill={SUN} />
      <path d="M31 46.5h17M54 46.5h7M30 63h12M52 63h10" stroke={INK} strokeWidth={4} strokeLinecap="round" />
      <circle cx="74" cy="70" r="13" fill={PERSIMMON} />
      <path d="M68 70.5l4.5 4.5 8-9" fill="none" stroke={INK} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Step three: the agent buys it, inside limits it cannot change. */
export function Padlock({ className }: Props) {
  return (
    <svg aria-hidden viewBox="0 0 96 96" className={className}>
      <path d="M33 46V32a15 15 0 0 1 30 0v14" fill="none" stroke={INK} strokeWidth={8} />
      <rect x="20" y="42" width="56" height="44" rx="10" fill={COBALT} />
      <circle cx="48" cy="60" r="6.5" fill={CREAM} />
      <path d="M48 63v10" stroke={CREAM} strokeWidth={5} strokeLinecap="round" />
    </svg>
  );
}
