import { z } from "zod";
import { fail } from "@/lib/api/respond";
import { ARC_DOMAIN, DESTINATIONS, STANDARD_FINALITY } from "@/lib/chain/cctp";

const IRIS = "https://iris-api-sandbox.circle.com/v2";

const feesSchema = z.array(z.object({ finalityThreshold: z.number(), minimumFee: z.number(), forwardFee: z.object({ high: z.number() }) }));
const messagesSchema = z.object({ messages: z.array(z.object({ status: z.string().optional(), forwardTxHash: z.string().nullish() })).optional() });

/**
 * Circle's attestation service, asked on the browser's behalf.
 * ?to=<domain> returns what delivery to that chain costs right now, in USDC.
 * ?tx=<hash> returns the delivery transaction on the other chain once Circle has sent it.
 */
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  try {
    const tx = query.get("tx");
    if (tx) {
      if (!/^0x[0-9a-f]{64}$/i.test(tx)) return Response.json({ error: "tx must be a transaction hash" }, { status: 400 });
      const res = await fetch(`${IRIS}/messages/${ARC_DOMAIN}?transactionHash=${tx}`, { cache: "no-store" });
      // Circle answers 404 until it has seen the burn.
      const message = res.ok ? messagesSchema.parse(await res.json()).messages?.[0] : undefined;
      return Response.json({ delivered: message?.forwardTxHash ?? null });
    }

    const to = Number(query.get("to"));
    if (!DESTINATIONS.some((d) => d.domain === to)) return Response.json({ error: "unknown destination" }, { status: 400 });
    const res = await fetch(`${IRIS}/burn/USDC/fees/${ARC_DOMAIN}/${to}?forward=true`, { cache: "no-store" });
    if (!res.ok) throw new Error(`Circle’s fee service responded ${res.status}`);
    const tier = feesSchema.parse(await res.json()).find((f) => f.finalityThreshold === STANDARD_FINALITY);
    if (!tier) throw new Error("Circle quoted no fee for a standard transfer");
    // The top of Circle's range, so the transfer isn't sent back to a slower path if gas moves while it is in flight.
    return Response.json({ fee: tier.forwardFee.high / 1e6, protocolBps: tier.minimumFee });
  } catch (error) {
    return fail(error);
  }
}
