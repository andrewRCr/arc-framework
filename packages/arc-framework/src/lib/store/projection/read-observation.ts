/** Retain failed Store observations without mixing independent preparation rounds. */
import type { Store } from "../contract.js";
import type { WriteCheckInput } from "../write-check.js";
import type { StoreRefusal, StoreResult } from "../refusal.js";

/** Read operations retain their results and the first failed native observation. */
export interface ProjectionReadObservation {
  readonly store: Store;
  nativeFailure(): StoreRefusal | undefined;
}

/** Observe public reads without synthesizing version conflicts or exposing mutation operations. */
export function observeProjectionReads(before: WriteCheckInput["before"]): ProjectionReadObservation {
  let failure: StoreRefusal | undefined;
  const retain = <T>(result: StoreResult<T>): StoreResult<T> => {
    if (result.status === "refused" && result.refusal.code !== "not-found") failure ??= result.refusal;
    return result;
  };
  const unavailable = (): Promise<never> => Promise.reject(new Error("Preparation cannot mutate state or query a live state anchor"));
  return { store: { capabilities: { stateOffBranch: true },
    read: async input => retain(await before.read(input)),
    history: async input => retain(await before.history(input)),
    list: async input => retain(await before.list(input)),
    lookup: async input => retain(await before.lookup(input)),
    write: unavailable, batch: unavailable, version: unavailable, changes: unavailable,
    pull: unavailable, push: unavailable, maintain: unavailable }, nativeFailure: () => failure };
}
