/**
 * In production the ledger is fed by a QuickNode Stream posting to /api/streams.
 * Without one (local chain, tests) the app reads the same logs itself.
 */
export const usesStreams = Boolean(process.env.QUICKNODE_STREAMS_TOKEN);

// A Stream that is paused, behind, or pointed somewhere else delivers nothing, and the app must not
// go blind when that happens. Once it has been quiet this long, the app reads the chain itself;
// both write the same rows, so nothing is counted twice.
const QUIET_MS = 90_000;
const feed = globalThis as { awningStream?: { heardAt: number; deliveries: number; events: number } };

/** Notes one signed delivery from the Stream and how many of the contracts' events it carried. */
export function streamDelivered(events: number) {
  const so = (feed.awningStream ??= { heardAt: 0, deliveries: 0, events: 0 });
  so.heardAt = Date.now();
  so.deliveries += 1;
  so.events += events;
}
export const streamIsFeeding = () => usesStreams && Date.now() - (feed.awningStream?.heardAt ?? 0) < QUIET_MS;

/** What the Stream has brought since this server started, for showing where the page's events come from. */
export const streamReport = () => ({
  on: usesStreams,
  heardAt: feed.awningStream?.heardAt ? new Date(feed.awningStream.heardAt).toISOString() : null,
  deliveries: feed.awningStream?.deliveries ?? 0,
  events: feed.awningStream?.events ?? 0,
});
