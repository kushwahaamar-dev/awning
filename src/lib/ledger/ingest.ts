import { parseEventLogs, type Hex, type Log } from "viem";
import { awningMandateAbi, awningPoolAbi } from "../chain/abi";
import { BLOCK_REASONS, deployBlock, fromUnits, mandateAddress, poolAddress } from "../chain/config";
import { publicClient } from "../chain/server";
import { getDb, ledger } from "../db";
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

/** Local stand-in for QuickNode Streams: reads the two contracts' logs since the last block stored. */
export async function pollChain() {
  const db = await getDb();
  const [last] = await db.select({ block: sql<number>`max(${ledger.blockNumber})` }).from(ledger);
  // Uncached: this runs straight after the agent's own transactions, and viem would otherwise answer
  // from a block number a few seconds old and miss them.
  const latest = await publicClient.getBlockNumber({ cacheTime: 0 });
  let from = last?.block != null ? BigInt(last.block) : deployBlock;
  // A local chain restarts from block zero while the database remembers the old one.
  if (from > latest) from = 0n;

  for (; from <= latest; from += CHUNK) {
    const to = from + CHUNK - 1n < latest ? from + CHUNK - 1n : latest;
    const logs = await publicClient.getLogs({ address: [mandateAddress, poolAddress], fromBlock: from, toBlock: to });
    const timestamps = new Map<bigint, number>();
    for (const number of new Set(logs.map((l) => l.blockNumber))) {
      timestamps.set(number, Number((await publicClient.getBlock({ blockNumber: number })).timestamp));
    }
    await ingest(logs, timestamps);
  }
}

export async function recentActivity(owner: string, limit = 60) {
  const db = await getDb();
  return db.select().from(ledger).where(sql`${ledger.owner} = ${owner.toLowerCase()}`).orderBy(desc(ledger.blockNumber), desc(ledger.id)).limit(limit);
}
