import { Mark } from "./Logo";

export function Footer() {
  return (
    <footer className="overflow-hidden border-t border-line">
      <div className="wrap flex flex-wrap items-center justify-between gap-x-10 gap-y-3 py-8 text-xs text-faint">
        <span className="flex items-center gap-2 text-muted">
          <Mark className="size-4" />
          Awning
        </span>
        <p>Not insurance. Cover is written against exchange-traded contracts and can pay differently from what you lose.</p>
      </div>
      <p aria-hidden className="wordmark">
        Awning
      </p>
    </footer>
  );
}
