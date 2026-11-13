import { address, fail } from "@/lib/api/respond";
import { requireOwner } from "@/lib/api/session";
import { chain, chainLabel, explorerTx, mandateAddress, poolAddress, usdcAddress } from "@/lib/chain/config";
import { agentAddress, readAllowance, readPool } from "@/lib/chain/server";
import { listCovers } from "@/lib/covers/service";
import { pollChain, recentActivity } from "@/lib/ledger/ingest";
import { usesStreams } from "@/lib/ledger/source";

/** Everything the app shows about one owner: allowance, covers, what the agent has done onchain, and the pool behind the cover. */
export async function GET(request: Request) {
  const owner = address.safeParse(new URL(request.url).searchParams.get("owner"));
  if (!owner.success) return Response.json({ error: "owner must be an address" }, { status: 400 });

  try {
    await requireOwner(request, owner.data);
    if (!usesStreams) await pollChain();
    const [allowance, covers, activity, pool] = await Promise.all([readAllowance(owner.data), listCovers(owner.data), recentActivity(owner.data), readPool()]);
    return Response.json({
      allowance,
      covers,
      pool,
      activity: activity.map((event) => ({ ...event, explorer: explorerTx(event.txHash) })),
      setup: { chainId: chain.id, chainName: chainLabel, mandate: mandateAddress, usdc: usdcAddress, agent: agentAddress(), venue: poolAddress },
    });
  } catch (error) {
    return fail(error);
  }
}
