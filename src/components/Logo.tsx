/** The mark: a strip of awning, three scallops along its edge. */
export function Mark({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={className}>
      <path fill="currentColor" d="M3 5.5A2.5 2.5 0 0 1 5.5 3h13A2.5 2.5 0 0 1 21 5.5V12H3Z" />
      <path fill="currentColor" fillOpacity={0.55} d="M3 13.5h6a3 3 0 0 1-6 0Zm6 0h6a3 3 0 0 1-6 0Zm6 0h6a3 3 0 0 1-6 0Z" />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="flex items-center gap-2 text-[1.0625rem] font-[590] tracking-[-0.02em]">
      <Mark className="size-5 text-accent" />
      Awning
    </span>
  );
}
