import { parseEventLogs, type Hex, type Log } from "viem";
import { awningMandateAbi, awningPoolAbi } from "../chain/abi";
import { BLOCK_REASONS, deployBlock, fromUnits, mandateAddress, poolAddress } from "../chain/config";
import { publicClient } from "../chain/server";
import { getDb, ledger } from "../db";
import { streamIsFeeding } from "./source";
import { desc, sql } from "drizzle-orm";

export type RawLog = Pick<Log<bigint, number, false>, "address" | "topics" | "data" | "blockNumber" | "transactionHash" | "logIndex">;

const ACTIONS = ["DrawFloat", "OpenHedge"] as const;
const OUTCOMES = ["None", "Open", "Paid", "Expired", "Refunded"] as const;
const DOLLAR_FIELDS = new Set(["amount", "premium", "maxPayout", "payout", "refunded", "drawnToday", "floatDailyCap", "premiumPerHedgeCap", "premiumPeriodCap", "approvalThreshold"]);

// The pool is also a share token, so it emits plenty that isn't about cover. These are the events that are.
const POOL_EVENTS = awningPoolAbi.filter((item) => item.type === "event" && ["Offered", "Rejected", "ClaimedUnresolved"].includes(item.name));

/** Turns event arguments into plain JSON: dollars instead of token units, names instead of enum numbers. */
function readable(name: string, args: Record<string, unknown>) {
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(args)) {
    if (key === "owner") continue;
    if (key === "reason") out.reason = BLOCK_REASONS[value as number];
    else if (key === "action") out.action = ACTIONS[value as number];
    else if (key === "outcome") out.outcome = OUTCOMES[value as number];
    else if (typeof value === "bigint") out[key] = DOLLAR_FIELDS.has(key) ? fromUnits(value) : Number(value);
    else out[key] = value as string | boolean;
  }
  return { kind: name, args: out };
}

/**
 * Stores mandate and pool events. Safe to call with logs it has seen before, which matters because
 * QuickNode Streams redelivers on retry and the local poller overlaps on restart.
 */
export async function ingest(logs: RawLog[], timestamps: Map<bigint, number>) {
  // Every event kept here is about one owner; anything else (EIP-712 housekeeping) isn't ledger material.
  const events = parseEventLogs({ abi: [...awningMandateAbi, ...POOL_EVENTS], logs: logs as Log[] }).flatMap((event) => {
    const args = event.args as Record<string, unknown>;
    return typeof args.owner === "string" ? [{ ...event, args }] : [];
  });
  if (events.length === 0) return 0;

  const rows = events.map((event) => ({
    id: `${event.transactionHash}:${event.logIndex}`,
    owner: (event.args.owner as string).toLowerCase(),
    ...readable(event.eventName, event.args),
    blockNumber: Number(event.blockNumber),
    txHash: event.transactionHash as Hex,
    at: new Date((timestamps.get(event.blockNumber!) ?? Date.now() / 1000) * 1000),
  }));

  const db = await getDb();
  await db.insert(ledger).values(rows).onConflictDoNothing();
  return rows.length;
}

const CHUNK = 5_000n;
// Pages refresh every few seconds and each refresh asks for new events. A public RPC endpoint
// stops answering if every one of those becomes a request, so reads are shared and spaced out.
const MIN_GAP_MS = 2_000;

type Scan = { to: bigint | null; at: number; running: Promise<void> | null };
const globals = globalThis as { awningScan?: Scan };
const scan = (globals.awningScan ??= { to: null, at: 0, running: null });

/**
 * Local stand-in for QuickNode Streams: reads the two contracts' logs since the last block read.
 * @param fresh the caller has just sent a transaction and needs it in the ledger before it answers
 */
export async function pollChain({ fresh = false } = {}) {
  if (scan.running) {
    await scan.running.catch(() => {});
    // A read that began before the caller's transaction may have missed it.
    if (!fresh) return;
  }
  if (!fresh && Date.now() - scan.at < MIN_GAP_MS) return;
  scan.running = readNewLogs().finally(() => {
    scan.at = Date.now();
    scan.running = null;
  });
  return scan.running;
}

async function readNewLogs() {
  // Uncached: this runs straight after the agent's own transactions, and viem would otherwise answer
  // from a block number a few seconds old and miss them.
  const latest = await publicClient.getBlockNumber({ cacheTime: 0 });
  let from = scan.to !== null ? scan.to + 1n : await lastStoredBlock();
  // A local chain restarts from block zero while this process, or the database, remembers the old one.
  if (from > latest + 1n) from = 0n;

  for (; from <= latest; from += CHUNK) {
    const to = from + CHUNK - 1n < latest ? from + CHUNK - 1n : latest;
    const logs = await publicClient.getLogs({ address: [mandateAddress, poolAddress], fromBlock: from, toBlock: to });
    const timestamps = new Map<bigint, number>();
    for (const number of new Set(logs.map((l) => l.blockNumber))) {
      timestamps.set(number, Number((await publicClient.getBlock({ blockNumber: number })).timestamp));
    }
    await ingest(logs, timestamps);
    // Remembered as it goes, so a quiet chain isn't read again from the last event every time.
    scan.to = to;
  }
}

/** Where to start after a restart: the newest event already stored, or the block the contracts were deployed at. */
async function lastStoredBlock() {
  const db = await getDb();
  const [last] = await db.select({ block: sql<number>`max(${ledger.blockNumber})` }).from(ledger);
  return last?.block != null ? BigInt(last.block) : deployBlock;
}

/**
 * Brings the ledger up to date when no Stream is doing it. A read that fails is logged, not thrown:
 * the events are still on the chain and the next pass picks them up.
 */
export async function catchUp({ fresh = false } = {}) {
  if (streamIsFeeding()) return;
  await pollChain({ fresh }).catch((error) => console.error("could not read new events from the chain", error));
}

export async function recentActivity(owner: string, limit = 60) {
  const db = await getDb();
  return db.select().from(ledger).where(sql`${ledger.owner} = ${owner.toLowerCase()}`).orderBy(desc(ledger.blockNumber), desc(ledger.id)).limit(limit);
}
