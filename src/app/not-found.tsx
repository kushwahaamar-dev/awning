import Link from "next/link";

export default function NotFound() {
  return (
    <section className="grid min-h-[60vh] place-items-center text-center">
      <div>
        <h1 className="display">Nothing here.</h1>
        <p className="mt-5 text-lg text-muted">That page doesn&rsquo;t exist.</p>
        <Link href="/" className="btn btn-lg btn-primary mt-8">
          Back to Awning
        </Link>
      </div>
    </section>
  );
}
