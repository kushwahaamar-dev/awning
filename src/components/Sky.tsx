import type { CSSProperties } from "react";

// Left edge in percent, distance from the top in rem, size in rem.
// Kept to the band under the awning and to the right-hand side, clear of where headings and body text sit.
const STARS = [
  [4, 8.5, 0.5],
  [17, 5.5, 0.8],
  [31, 7, 0.45],
  [43, 5.5, 0.6],
  [55, 8, 0.5],
  [63, 6, 0.9],
  [72, 13, 0.55],
  [76, 24, 0.7],
  [93, 23, 0.5],
  [97, 7, 0.75],
  [86, 31, 0.45],
  [69, 19, 0.4],
];

const CLOUD = "M32 76a25 25 0 0 1-3-49.8A37 37 0 0 1 99 18a30 30 0 0 1 55 12 23 23 0 0 1 8 46Z";

/** Sun by day and moon by night, with clouds and stars. Decoration only; it sits behind the page. */
export function Sky() {
  return (
    <div aria-hidden className="sky">
      <svg viewBox="0 0 190 76" className="cloud top-[13rem] right-[24%] w-56">
        <path d={CLOUD} />
      </svg>
      <svg viewBox="0 0 190 76" className="cloud top-[27rem] -left-10 w-72 [animation-delay:-20s]">
        <path d={CLOUD} />
      </svg>
      <svg viewBox="0 0 190 76" className="cloud top-[40rem] right-[6%] w-80 [animation-delay:-9s]">
        <path d={CLOUD} />
      </svg>
      {STARS.map(([left, top, size], i) => (
        <i key={i} className={top > 9 ? "star max-sm:hidden" : "star"} style={{ left: `${left}%`, top: `${top}rem`, "--s": `${size}rem`, "--i": i } as CSSProperties} />
      ))}
      <div className="sun" />
    </div>
  );
}
