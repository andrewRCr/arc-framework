/** Retry an ended item's reads and writes once after pulling the history refs their refusal names. */
import type { Store } from "./contract.js";
import type { StoreResult } from "./refusal.js";
import { pullHistoryForRetry } from "./pull-consumption.js";

const retrying = new WeakSet<Store>();

/**
 * Wrap a store so an operation refused for an ended item's missing history pulls those refs by name and runs once
 * more; every other result, and a refusal naming no ref, passes through. A store this already wraps is returned as is.
 * @param store - Store whose reads and writes take the retry.
 * @param writeNotice - Where the pull's notices are written; standard error by default.
 * @returns The same store's operations with the retry.
 */
export function retryEndedItemHistory(store: Store, writeNotice?: (line: string) => void): Store {
  if (retrying.has(store)) return store;
  const retry = async <T>(operation: () => Promise<StoreResult<T>>): Promise<StoreResult<T>> => {
    const result = await operation();
    if (result.status === "ok" || result.refusal.code !== "state-unresolvable" || result.refusal.historyRefs.length === 0) {
      return result;
    }
    return await pullHistoryForRetry(store, result.refusal.historyRefs, writeNotice) ? operation() : result;
  };
  const wrapped: Store = {
    capabilities: store.capabilities,
    read: input => retry(() => store.read(input)),
    list: input => retry(() => store.list(input)),
    write: input => retry(() => store.write(input)),
    batch: input => retry(() => store.batch(input)),
    version: () => retry(() => store.version()),
    history: input => retry(() => store.history(input)),
    changes: input => retry(() => store.changes(input)),
    lookup: input => retry(() => store.lookup(input)),
    push: input => store.push(input),
    pull: input => store.pull(input),
    maintain: () => store.maintain(),
  };
  retrying.add(wrapped);
  return wrapped;
}
