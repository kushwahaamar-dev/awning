import Link from "next/link";

export default function NotFound() {
  return (
    <section className="grid min-h-[60vh] place-items-center text-center">
      <div>
        <h1 className="sign">Nothing here.</h1>
        <p className="lede mt-3">That page doesn&rsquo;t exist.</p>
        <Link href="/" className="btn btn-primary mt-6">
          Back to Awning
        </Link>
      </div>
    </section>
  );
}
