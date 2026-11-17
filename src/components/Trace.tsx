import type { CSSProperties, ReactNode } from "react";

// How much of the sky is covered, the way a weather chart marks it at a station: an open ring for a clear sky,
// then a quarter more ink at a time until it is overcast.
const COVERED = ["", "M12 12V3a9 9 0 0 1 9 9Z", "M12 3a9 9 0 0 1 0 18Z", "M12 12V3a9 9 0 1 1-9 9Z", "M12 3a9 9 0 0 1 0 18a9 9 0 0 1 0-18Z"];

export type Cover = 0 | 1 | 2 | 3 | 4;

function Sky({ cover }: { cover: Cover }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="block size-6" fill="none" stroke="currentColor">
      <circle cx={12} cy={12} r={9} />
      {cover > 0 && <path d={COVERED[cover]} fill="currentColor" stroke="none" />}
    </svg>
  );
}

/**
 * One part of the landing page, hung off the page's line. The line arrives along column `from`, turns at this
 * part's mark, and runs down column `to` beside it; the sky in the mark is a quarter more covered at each part,
 * so the bad day closes in on the way down the page. `aside` stands on the other side of the line.
 */
export function Leg({ id, from, to, cover, aside, children }: { id: string; from: number; to: number; cover: Cover; aside?: ReactNode; children: ReactNode }) {
  return (
    <section
      id={id}
      data-leg
      className="leg"
      style={{ "--from": from, "--to": to, "--sweep": to < from ? "to left" : "to right" } as CSSProperties}
    >
      <span className="leg-mark">
        <Sky cover={cover} />
      </span>
      {children}
      {aside && <div className="leg-aside">{aside}</div>}
    </section>
  );
}
