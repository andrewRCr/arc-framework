/** Cut-created cohorts authenticated independently of their current name holders. */
import type { Store, HistoryEntry } from "../store/contract.js";
import type { StoreRecord } from "../store/read.js";
import type { DecomposeCohortObservation } from "./check-names.js";
import type { StoredCutMap, StoredCutOwnerBirth } from "../store/kinds/cut-map/schema.js";
import type { DecomposeResult } from "./refusal.js";
import { recordReferences, OwnerIdentitySchema, type RecordReference } from "../store/identity.js";
import { acquireDecomposeMapHistory, resolveDecomposeOwnerBirth } from "./owner-birth-history.js";
import { decomposeStoreRefusal } from "./refusal.js";
import { decomposeSelectedCohortPaths } from "./owner-birth-bindings.js";

/** Acquire live cut-owned documents only by their receipt-proved generation. */
export async function acquireDecomposeCutCohorts(store: Pick<Store, "history" | "read">, stored: StoredCutMap,
  storedMap: StoreRecord): Promise<DecomposeResult<readonly DecomposeCohortObservation[]>> {
  const history = await acquireDecomposeMapHistory(store, storedMap.reference);
  if (history.status === "refused") return history;
  const paths = decomposeSelectedCohortPaths(stored.map);
  const cohorts: DecomposeCohortObservation[] = [];
  for (const binding of stored.ownerBirths) {
    if (binding.kind !== "cohort/document") continue;
    const read = await acquireCutCohort(store, storedMap.reference, binding, history.result);
    if (read.status === "refused") return read;
    const selected = paths.find(path => path.split("/").at(-1) === binding.name);
    if (selected !== undefined && read.result !== null) cohorts.push({ path: selected, record: read.result });
  }
  return { status: "ok", result: cohorts };
}

async function acquireCutCohort(store: Pick<Store, "read">, reference: RecordReference, binding: StoredCutOwnerBirth,
  history: readonly HistoryEntry[]): Promise<DecomposeResult<StoreRecord | null>> {
  const birth = resolveDecomposeOwnerBirth(reference, binding, history);
  if (birth.status === "refused") return birth;
  const owner = OwnerIdentitySchema.parse({ type: "cohort", name: binding.name, uid: birth.result });
  const read = await store.read({ reference: recordReferences["cohort/document"](owner) });
  if (read.status === "refused") return read.refusal.code === "not-found" ? { status: "ok", result: null } : decomposeStoreRefusal(read.refusal);
  return { status: "ok", result: read.result.placement?.kind === "completed" ? null : read.result };
}
