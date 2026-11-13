import { Mark } from "./Logo";

export function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-[75rem] flex-wrap items-center justify-between gap-x-10 gap-y-3 px-5 py-8 text-xs text-faint sm:px-8">
        <span className="flex items-center gap-2 text-muted">
          <Mark className="size-4" />
          Awning
        </span>
        <p>Not insurance. Cover is written against exchange-traded contracts and can pay differently from what you lose.</p>
      </div>
    </footer>
  );
}
