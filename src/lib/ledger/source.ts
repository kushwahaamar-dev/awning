/**
 * In production the ledger is fed by a QuickNode Stream posting to /api/streams.
 * Without one (local chain, tests) the app reads the same logs itself.
 */
export const usesStreams = Boolean(process.env.QUICKNODE_STREAMS_TOKEN);

// A Stream that is paused, behind, or pointed somewhere else delivers nothing, and the app must not
// go blind when that happens. Once it has been quiet this long, the app reads the chain itself;
// both write the same rows, so nothing is counted twice.
const QUIET_MS = 90_000;
const feed = globalThis as { awningStreamHeard?: number };

export const streamDelivered = () => void (feed.awningStreamHeard = Date.now());
export const streamIsFeeding = () => usesStreams && Date.now() - (feed.awningStreamHeard ?? 0) < QUIET_MS;
