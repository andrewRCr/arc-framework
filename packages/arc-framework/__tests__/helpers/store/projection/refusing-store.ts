/** Schema-checked store refusals for conditions a memory namespace cannot produce itself. */
import type { Store } from "../../../../src/lib/store/contract.js";
import { StoreRefusalSchema, type StoreRefusal } from "../../../../src/lib/store/refusal.js";

type Operation = Exclude<keyof Store, "capabilities">;

/** A controlled store boundary with explicit repairs and operation counts. */
export interface RefusingStore {
  readonly store: Store;
  refuse(operation: Operation, refusal: StoreRefusal | null): void;
  calls(operation: Operation): number;
}

/** Inject typed refusals at public operations; clearing one restores the underlying store. */
export function createRefusingStore(store: Store): RefusingStore {
  const faults = new Map<PropertyKey, StoreRefusal>();
  const counts = new Map<PropertyKey, number>();
  const wrapped = new Proxy(store, { get(target, key) {
    const value: unknown = Reflect.get(target, key, target);
    if (typeof value !== "function") return value;
    return (...args: unknown[]): unknown => {
      counts.set(key, (counts.get(key) ?? 0) + 1);
      const refusal = faults.get(key);
      return refusal === undefined ? Reflect.apply(value, target, args)
        : Promise.resolve({ status: "refused", refusal });
    };
  } });
  return { store: wrapped,
    refuse(operation, refusal) {
      if (refusal === null) faults.delete(operation);
      else faults.set(operation, StoreRefusalSchema.parse(refusal));
    },
    calls: operation => counts.get(operation) ?? 0,
  };
}
