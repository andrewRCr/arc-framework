/** Preserve authoritative current-read evidence from one native persist invocation. */
import type { Store } from "../../../src/lib/store/contract.js";
import { sameReference, type RecordReference } from "../../../src/lib/store/identity.js";

export function observePersistSave(store: Store, reference: RecordReference, expectedSave: string) {
  let active = false, observedSave = false;
  const observed: Store = { capabilities: store.capabilities,
    write: input => store.write(input), batch: input => store.batch(input),
    list: input => store.list(input), version: () => store.version(), history: input => store.history(input),
    changes: input => store.changes(input), lookup: input => store.lookup(input),
    pull: input => store.pull(input), push: input => store.push(input), maintain: () => store.maintain(),
    read: async input => {
    const result = await store.read(input);
    if (active && input.asOf === undefined && sameReference(input.reference, reference)
      && result.status === "ok" && sameReference(result.result.reference, reference)
      && result.result.content.includes(expectedSave)) observedSave = true;
    return result;
  } };
  return { store: observed, during: async <T>(operation: () => Promise<T>): Promise<{ result: T; observedSave: boolean }> => {
    active = true;
    try {
      const result = await operation();
      return { result, observedSave };
    } finally { active = false; }
  } };
}
