import { createHmac, timingSafeEqual } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { z } from "zod";
import { fail, hex } from "@/lib/api/respond";
import { ingest } from "@/lib/ledger/ingest";
import { streamDelivered } from "@/lib/ledger/source";

// The shape produced by quicknode/filter.js. Numbers arrive as hex quantities, as they do over JSON-RPC.
const bodySchema = z.object({
  logs: z.array(
    z.object({
      address: hex,
      topics: z.array(hex),
      data: hex,
      blockNumber: hex,
      transactionHash: hex,
      logIndex: hex,
      timestamp: hex,
    }),
  ),
});

/** QuickNode signs nonce + timestamp + body with the Stream's security token (HMAC-SHA256, hex). */
function signedByQuickNode(request: Request, body: string, token: string) {
  const nonce = request.headers.get("x-qn-nonce");
  const timestamp = request.headers.get("x-qn-timestamp");
  const signature = request.headers.get("x-qn-signature");
  if (!nonce || !timestamp || !signature) return false;

  const expected = createHmac("sha256", token).update(nonce + timestamp + body).digest();
  const given = Buffer.from(signature, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Destination webhook for the QuickNode Stream that feeds the ledger. */
export async function POST(request: Request) {
  const token = process.env.QUICKNODE_STREAMS_TOKEN;
  if (!token) return Response.json({ error: "QUICKNODE_STREAMS_TOKEN is not set" }, { status: 503 });

  // The signature covers the JSON text, so a gzipped delivery has to be inflated before checking it.
  const raw = Buffer.from(await request.arrayBuffer());
  let body: string;
  try {
    body = (request.headers.get("content-encoding") === "gzip" ? gunzipSync(raw) : raw).toString("utf8");
  } catch {
    return Response.json({ error: "body could not be inflated" }, { status: 400 });
  }
  if (!signedByQuickNode(request, body, token)) return Response.json({ error: "bad signature" }, { status: 401 });

  // The signature has been checked, so this is QuickNode's own payload; still, parse defensively.
  const parsed = bodySchema.safeParse(JSON.parse(body));
  if (!parsed.success) return Response.json({ error: z.prettifyError(parsed.error) }, { status: 400 });

  try {
    const { logs } = parsed.data;
    const timestamps = new Map(logs.map((log) => [BigInt(log.blockNumber), Number(BigInt(log.timestamp))]));
    const stored = await ingest(
      logs.map((log) => ({
        address: log.address,
        topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
        data: log.data,
        blockNumber: BigInt(log.blockNumber),
        transactionHash: log.transactionHash,
        logIndex: Number(BigInt(log.logIndex)),
      })),
      timestamps,
    );
    streamDelivered(logs.length);
    return Response.json({ stored });
  } catch (error) {
    return fail(error);
  }
}
