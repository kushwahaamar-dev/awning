/**
 * In production the ledger is fed by a QuickNode Stream posting to /api/streams.
 * Without one (local chain, tests) the app reads the same logs itself.
 */
export const usesStreams = Boolean(process.env.QUICKNODE_STREAMS_TOKEN);
