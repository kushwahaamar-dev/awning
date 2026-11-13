const EVERY_MS = 60_000;

/** On a long-running server, do the background pass on a timer. Serverless hosts use /api/cron/tick instead. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.VERCEL) return;
  const { tick } = await import("./lib/tick");
  const origin = process.env.AWNING_DESK_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
  setInterval(() => tick(origin).catch((error) => console.error("tick failed", error)), EVERY_MS);
}
