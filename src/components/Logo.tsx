/** The mark: an awning seen from the street, its stripes the one colour on the page. */
export function Mark({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.25} strokeLinejoin="round">
      <path fill="var(--color-lit)" stroke="none" d="M5 5h4.67L8 13H2Zm9.33 0H19l3 8h-6Z" />
      <path d="M5 5h14l3 8H2ZM9.67 5 8 13m6.33-8L16 13" />
      <path d="M2 13a3 3 0 0 0 6 0a4 4 0 0 0 8 0a3 3 0 0 0 6 0" />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="flex items-center gap-2 text-[1.0625rem] tracking-[-0.03em]">
      <Mark className="size-5 max-[359px]:hidden" />
      awning
    </span>
  );
}
