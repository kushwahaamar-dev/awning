// Line icons on a 16-unit grid. They take the text colour and are hidden from screen readers.

const base = { viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

type Props = { className?: string };

export const Lock = ({ className = "size-3.5" }: Props) => (
  <svg {...base} className={className}>
    <rect x="3" y="7" width="10" height="7" rx="2" />
    <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
  </svg>
);

export const Mic = ({ className = "size-4" }: Props) => (
  <svg {...base} className={className}>
    <path d="M8 1.8a2 2 0 0 1 2 2V8a2 2 0 0 1-4 0V3.8a2 2 0 0 1 2-2ZM3.8 7.8a4.2 4.2 0 0 0 8.4 0M8 12v2.2" />
  </svg>
);

export const Chevron = ({ className = "size-4" }: Props) => (
  <svg {...base} className={className}>
    <path d="m6 3.5 4.5 4.5L6 12.5" />
  </svg>
);

// What a risk is about, as a mark for the corner of its ticket. These are drawn on a 24-unit grid, with the awning's colour where the thing itself is warm.
const mark = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

export const Cold = ({ className = "size-6" }: Props) => (
  <svg {...mark} className={className}>
    <path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9M12 6.5 9.8 4.6M12 6.5l2.2-1.9M12 17.5l-2.2 1.9M12 17.5l2.2 1.9" />
  </svg>
);

export const Hot = ({ className = "size-6" }: Props) => (
  <svg {...mark} className={className}>
    <circle cx="12" cy="12" r="4.5" fill="var(--color-lit)" />
    <path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M18.7 5.3l-1.8 1.8M7.1 16.9l-1.8 1.8" />
  </svg>
);

export const Fuel = ({ className = "size-6" }: Props) => (
  <svg {...mark} className={className}>
    <path d="M12 3.5c3.4 4.2 5.5 7.1 5.5 10a5.5 5.5 0 0 1-11 0c0-2.9 2.1-5.8 5.5-10Z" fill="var(--color-lit)" />
  </svg>
);

export const Storm = ({ className = "size-6" }: Props) => (
  <svg {...mark} className={className}>
    <path d="M7 15.5a4 4 0 0 1 .6-7.9 5 5 0 0 1 9.6 1.3 3.4 3.4 0 0 1-.4 6.6" />
    <path d="m12.5 12.5-2.5 4h3.5l-2 4" />
  </svg>
);

export const External = ({ className = "size-3.5" }: Props) => (
  <svg {...base} className={className}>
    <path d="M6.5 3.5H3.5v9h9V9.5M9.5 3.5h3v3M12.5 3.5 7.5 8.5" />
  </svg>
);
