import Link from "next/link";

/** The shop sign and the awning under it. The awning's reach follows the --cover custom property. */
export function Storefront() {
  return (
    <header>
      <div className="bg-awning-deep text-paper">
        <div className="mx-auto flex max-w-5xl items-baseline justify-between px-5 py-3 sm:px-8">
          <Link href="/" className="font-display text-2xl font-bold tracking-tight [font-stretch:85%]">
            Awning
          </Link>
          <nav className="flex gap-6 text-base">
            <Link href="/" className="underline-offset-4 hover:underline">
              Cover
            </Link>
            <Link href="/agent" className="underline-offset-4 hover:underline">
              Your agent
            </Link>
          </nav>
        </div>
      </div>
      {/* Fixed height, so rolling the awning in and out never moves the page under the pointer. */}
      <div aria-hidden className="relative h-32">
        <div className="awning-canvas" />
        <div className="awning-valance" />
        <div className="awning-shade pointer-events-none absolute inset-x-0" />
      </div>
    </header>
  );
}
