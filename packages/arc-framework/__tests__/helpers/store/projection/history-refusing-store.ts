/**
 * A store wrapping another that refuses `history` for named records as a clone missing their history refs does, which
 * the reference backend, holding no history refs, cannot; every other call passes through, and each is counted.
 */
import type { Store } from "../../../../src/lib/store/contract.js";
import { sameReference, type RecordReference } from "../../../../src/lib/store/identity.js";
import { HistoryRefSchema, StoreRefusalSchema, type HistoryRef } from "../../../../src/lib/store/refusal.js";

/** The wrapped store, and how many times each operation was called on it. */
export interface HistoryRefusingStore {
  readonly store: Store;
  calls(operation: keyof Store): number;
}

/**
 * Wrap a store so `history` refuses `state-unresolvable` for each named record, naming its missing history ref.
 * @param store - The store every other call reaches.
 * @param refused - The records whose `history` refuses, as stored references carrying their owner's UID.
 * @returns The wrapped store and its call counts.
 */
export function createHistoryRefusingStore(store: Store, refused: readonly RecordReference[]): HistoryRefusingStore {
  const counts = new Map<PropertyKey, number>();
  const history: Store["history"] = async (input) => {
    const named = refused.find((reference) => sameReference(reference, input.reference));
    if (named === undefined) return store.history(input);
    const refusal = StoreRefusalSchema.parse({
      code: "state-unresolvable", class: "recoverable", historyRefs: [historyRefOf(named)], reference: named,
      condition: "This clone has not fetched the record's history.",
      remedy: { text: "Pull the named history ref, then retry." },
    });
    return { status: "refused", refusal };
  };
  const wrapped = new Proxy(store, {
    get(target, key) {
      const value: unknown = Reflect.get(target, key, target);
      if (typeof value !== "function") return value;
      return (...args: unknown[]): unknown => {
        counts.set(key, (counts.get(key) ?? 0) + 1);
        return key === "history" ? history(...(args as Parameters<Store["history"]>)) : Reflect.apply(value, target, args);
      };
    },
  });
  return { store: wrapped, calls: (operation) => counts.get(operation) ?? 0 };
}

/** The history ref a clone fetches for the record's owner: its kind's family and its lowercase stored UID. */
function historyRefOf(reference: RecordReference): HistoryRef {
  const { owner } = reference;
  if ((owner.type !== "work-item" && owner.type !== "cohort") || owner.uid === undefined) {
    throw new Error("A history ref names a work item's or cohort's stored UID; pass the stored reference");
  }
  return HistoryRefSchema.parse(`refs/arc/history/${owner.type === "work-item" ? "work" : "cohort"}/${owner.uid.toLowerCase()}`);
}
