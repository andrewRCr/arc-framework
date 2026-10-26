/** Index a retained history's store batches once its tip commit is known to be readable. */

import type { StoreCreationReceiptReader } from "../commit-creation-receipt.js";
import { parseStoreCommitProvenance } from "../commit-provenance.js";
import type { RecordReference } from "../identity.js";
import type { StoreResult, StoreRefusal } from "../refusal.js";
import { readHistoricalGraph, unavailableRefHistory } from "./history-graph.js";
import { readBatchObjects } from "./batch-read.js";
import type { RefBackendContext } from "./context.js";

/**
 * Map each batch a history's commits name to the newest commit naming it. An unreadable tip commit returns undefined
 * before Git's history walker can abort, so each caller refuses with its own condition.
 */
export async function readHistoryBatchIndex(context: RefBackendContext, history: string, tip: string, reference: RecordReference,
  evidence?: StoreCreationReceiptReader): Promise<StoreResult<Map<string, string>> | undefined> {
  if ((await readBatchObjects(context, [tip])).get(tip)?.type !== "commit") return undefined;
  return indexHistoryBatches(context, history, tip, reference, evidence);
}

/** Map each batch named from a tip its caller has already read as a commit to the newest commit naming it. */
export async function indexHistoryBatches(context: RefBackendContext, history: string, tip: string, reference: RecordReference,
  evidence?: StoreCreationReceiptReader, unavailable: StoreRefusal = unavailableRefHistory(reference, history)): Promise<StoreResult<Map<string, string>>> {
  const graph = await readHistoricalGraph(context, ["log", "--topo-order", "--format=%H%x00%B%x00", tip], unavailable);
  if (graph.status === "refused") return graph;
  const values = graph.result.split("\0"), batches = new Map<string, string>();
  for (let index = 0; index + 1 < values.length; index += 2) {
    const revision = values[index]?.trim(), message = values[index + 1];
    if (!revision || message === undefined) continue;
    const receipt = evidence?.read(message, reference, `${history}@${revision}`);
    if (receipt?.status === "refused") return receipt;
    const provenance = parseStoreCommitProvenance(message, reference);
    if ("batchId" in provenance && provenance.batchId && !batches.has(provenance.batchId)) batches.set(provenance.batchId, revision);
  }
  return { status: "ok", result: batches };
}
