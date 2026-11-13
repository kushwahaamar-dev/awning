/**
 * The wordmark, drawn from one arc and one stroke: arches for the n's, the valance's scallops for the w,
 * and the sun for the dot on the i.
 */
export function Logo({ className, dot = "fill-sun" }: { className?: string; dot?: string }) {
  return (
    <svg aria-hidden viewBox="0 -63 670 195" fill="none" stroke="currentColor" strokeWidth={30} className={className}>
      <circle cx="50" cy="35" r="35" />
      <circle cx="620" cy="35" r="35" />
      <path d="M85-15V85M129-15V35a35 35 0 0 0 70 0V-15M199 35a35 35 0 0 0 70 0V-15M313 85V35a35 35 0 0 1 70 0V85M427-15V85M471 85V35a35 35 0 0 1 70 0V85M655-15V82a35 35 0 0 1-35 35H589" />
      <circle cx="427" cy="-45" r="18" stroke="none" className={dot} />
    </svg>
  );
}
