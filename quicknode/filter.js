// QuickNode Streams filter for the Awning ledger.
//
// Network: Arc testnet. Dataset: block_with_receipts.
// Keeps only logs emitted by the AwningMandate and AwningPool contracts and attaches each block's
// timestamp, so the app never has to call back to the chain to date an event.
//
// The two contracts as deployed on Arc testnet, lowercase.
const MANDATE = "0x708ae0910efaf32b97d0ba9429c4f2bd44988413";
const POOL = "0x0de9149998ee6caa3577007f31a1803bc49c3f6f";

function main(stream) {
  const logs = [];
  for (const { block, receipts } of stream.data) {
    for (const receipt of receipts ?? []) {
      for (const log of receipt.logs ?? []) {
        const from = log.address.toLowerCase();
        if (from !== MANDATE && from !== POOL) continue;
        logs.push({
          address: log.address,
          topics: log.topics,
          data: log.data,
          blockNumber: log.blockNumber,
          transactionHash: log.transactionHash,
          logIndex: log.logIndex,
          timestamp: block.timestamp,
        });
      }
    }
  }
  // Returning null tells Streams to skip delivery for blocks with nothing in them.
  return logs.length > 0 ? { logs } : null;
}
