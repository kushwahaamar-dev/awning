// QuickNode Streams filter for the Awning ledger.
//
// Network: Arc testnet. Dataset: block_with_receipts.
// Keeps only logs emitted by the AwningMandate contract and attaches each block's timestamp,
// so the app never has to call back to the chain to date an event.
//
// Set MANDATE to the deployed address (lowercase) before saving the Stream.
const MANDATE = "0x0000000000000000000000000000000000000000";

function main(stream) {
  const logs = [];
  for (const { block, receipts } of stream.data) {
    for (const receipt of receipts ?? []) {
      for (const log of receipt.logs ?? []) {
        if (log.address.toLowerCase() !== MANDATE) continue;
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
