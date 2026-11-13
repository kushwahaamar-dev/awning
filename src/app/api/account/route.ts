import { address, fail } from "@/lib/api/respond";
import { requireOwner } from "@/lib/api/session";
import { listStanding } from "@/lib/agent/standing";
import { chain, chainLabel, explorerTx, mandateAddress, poolAddress, usdcAddress } from "@/lib/chain/config";
import { agentAddress, readAllowance, readPool } from "@/lib/chain/server";
import { listCovers } from "@/lib/covers/service";
import { catchUp, recentActivity } from "@/lib/ledger/ingest";

/** Everything the app shows about one owner: allowance, covers, what the agent has done onchain, and the pool behind the cover. */
export async function GET(request: Request) {
  const owner = address.safeParse(new URL(request.url).searchParams.get("owner"));
  if (!owner.success) return Response.json({ error: "owner must be an address" }, { status: 400 });

  try {
    await requireOwner(request, owner.data);
    await catchUp();
    const [allowance, covers, activity, pool, standing] = await Promise.all([
      readAllowance(owner.data),
      listCovers(owner.data),
      recentActivity(owner.data),
      readPool(),
      listStanding(owner.data),
    ]);
    return Response.json({
      allowance,
      covers,
      pool,
      standing,
      activity: activity.map((event) => ({ ...event, explorer: explorerTx(event.txHash) })),
      setup: { chainId: chain.id, chainName: chainLabel, mandate: mandateAddress, usdc: usdcAddress, agent: agentAddress(), venue: poolAddress },
    });
  } catch (error) {
    return fail(error);
  }
}
