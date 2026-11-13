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

export const External = ({ className = "size-3.5" }: Props) => (
  <svg {...base} className={className}>
    <path d="M6.5 3.5H3.5v9h9V9.5M9.5 3.5h3v3M12.5 3.5 7.5 8.5" />
  </svg>
);
