/** Read saved operational history with one narrowly named synchronization retry. */
import type { StoreResult, StoreRefusal } from "../store/refusal.js";
import { createStoreSyncPort, type StoreSyncPort } from "../store/operational-sync.js";
import { consumePull, pullDesignation, writePullNotices } from "../store/pull-consumption.js";

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
 * @param writeNotice - Where the pull's notices are written; standard error by default.
 * @returns Successful operation payload or the retained refusal.
 */
export async function readStateHistory<T>(operation: () => Promise<StoreResult<T>>, sync: StoreSyncPort = createStoreSyncPort(),
  writeNotice?: (line: string) => void): Promise<T> {
  let result = await operation();
  if (result.status === "ok") return result.result;
  const refs = sync.historyRefs(result.refusal);
  if (refs.length > 0 || result.refusal.code === "state-unresolvable") {
    if (refs.length > 0) await requireHistoryPull(sync, refs, result.refusal, writeNotice);
    result = await operation();
  }
  if (result.status === "refused") throw new StateHistoryRefusal(result.refusal);
  return result.result;
}
// A failed read source leaves the state leg's history in place, so only the state remote stops the retry.
async function requireHistoryPull(sync: StoreSyncPort, refs: readonly string[], refusal: StoreRefusal, writeNotice?: (line: string) => void): Promise<void> {
  const pulled = await pullHistory(sync, refs, refusal);
  const consumed = consumePull(pulled);
  writePullNotices(consumed.notices, writeNotice);
  if (consumed.kind === "stop") throw new Error(`${refusal.condition} ${refusal.remedy.text} ${consumed.reason}`);
  const designation = pullDesignation(pulled);
  if (designation) {
    throw new Error(`${refusal.condition} ${refusal.remedy.text} State remote ${designation.remote} needs a role. ${designation.remedy.text}`);
  }
}
async function pullHistory(sync: StoreSyncPort, refs: readonly string[], refusal: StoreRefusal) {
  try { return await sync.pull(refs); }
  catch (error) { throw new Error(`${refusal.condition} ${error instanceof Error ? error.message : String(error)} ${refusal.remedy.text}`, { cause: error }); }
}
