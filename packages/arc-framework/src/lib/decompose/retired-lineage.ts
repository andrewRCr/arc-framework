/** Decomposition adapter for shared retired-provider lineage reads. */
import type { Store } from "../store/contract.js";
import type { StoreRecord } from "../store/read.js";
import type { WorkItemRef } from "../store/kinds/lineage/index.js";
import { readRetiredLineage } from "../store/retired-lineage.js";
import { decomposeStoreRefusal, type DecomposeResult } from "./refusal.js";

/** Preserve decomposition's refusal envelope around the shared exact lineage read. */
export async function readDecomposeRetiredLineage(store: Store, target: WorkItemRef): Promise<DecomposeResult<StoreRecord | null>> {
  const result = await readRetiredLineage(store, target);
  return result.status === "refused" ? decomposeStoreRefusal(result.refusal) : result;
}
