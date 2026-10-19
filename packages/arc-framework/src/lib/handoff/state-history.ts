/** Read saved operational history with one narrowly named synchronization retry. */
import type { StoreResult, StoreRefusal } from "../store/refusal.js";
import { createStoreSyncPort, type StoreSyncPort } from "../store/operational-sync.js";

/** A refused history operation retains the provider's original condition and repair. */
export class StateHistoryRefusal extends Error {
  constructor(readonly refusal: StoreRefusal) {
    super(`${refusal.condition} ${refusal.remedy.text}`);
    this.name = "StateHistoryRefusal";
  }
}
/** Retry the same operation once after pulling only the missing refs it names.
 * @param operation - Exact saved-state read or change query.
 * @param sync - Operations bound to the same selected store.
 * @returns Successful operation payload or the retained refusal.
 */
export async function readStateHistory<T>(operation: () => Promise<StoreResult<T>>, sync: StoreSyncPort = createStoreSyncPort()): Promise<T> {
  let result = await operation();
  if (result.status === "ok") return result.result;
  const refs = sync.historyRefs(result.refusal);
  if (refs.length > 0 || result.refusal.code === "state-unresolvable") {
    if (refs.length > 0) await requireHistoryPull(sync, refs, result.refusal);
    result = await operation();
  }
  if (result.status === "refused") throw new StateHistoryRefusal(result.refusal);
  return result.result;
}
async function requireHistoryPull(sync: StoreSyncPort, refs: readonly string[], refusal: StoreRefusal): Promise<void> {
  const pulled = await pullHistory(sync, refs, refusal);
  if (pulled.status === "unreachable" || pulled.status === "designation-needed") {
    throw new Error(`${refusal.condition} ${pulled.status === "unreachable" ? pulled.condition : `State remote ${pulled.remote} needs a role.`} ${pulled.remedy.text}`);
  }
}
async function pullHistory(sync: StoreSyncPort, refs: readonly string[], refusal: StoreRefusal) {
  try { return await sync.pull(refs); }
  catch (error) { throw new Error(`${refusal.condition} ${error instanceof Error ? error.message : String(error)} ${refusal.remedy.text}`, { cause: error }); }
}
