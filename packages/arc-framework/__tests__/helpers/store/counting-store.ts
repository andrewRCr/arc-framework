/** Read-operation counts at the public store boundary, outside backend write checks. */
import type { Store } from "../../../src/lib/store/contract.js";
import { sameReference } from "../../../src/lib/store/identity.js";
import { canonicalize } from "../../../src/lib/kernel/canonical/canonical-json.js";

type Operation = "read" | "list" | "lookup" | "history";
export type StoreReadObservation = { [K in Operation]: { operation: K; input: Parameters<Store[K]>[0] } }[Operation];

/** Observe caller queries while retaining the backend's bound write-check view. */
export function createCountingStore(store: Store) {
  const calls: StoreReadObservation[] = [];
  const operations: Pick<Store, Operation> = {
    read: input => { calls.push({ operation: "read", input }); return store.read(input); },
    list: input => { calls.push({ operation: "list", input }); return store.list(input); },
    lookup: input => { calls.push({ operation: "lookup", input }); return store.lookup(input); },
    history: input => { calls.push({ operation: "history", input }); return store.history(input); },
  };
  const counted = new Proxy(store, { get(target, key) {
    if (key === "read" || key === "list" || key === "lookup" || key === "history") return operations[key];
    const value: unknown = Reflect.get(target, key, target);
    return typeof value === "function" ? value.bind(target) : value;
  } });
  return { store: counted, observations: (): readonly StoreReadObservation[] => [...calls],
    count: (request: StoreReadObservation): number => calls.filter(call => sameObservation(call, request)).length,
    reset: () => { calls.length = 0; },
  };
}

function sameObservation(left: StoreReadObservation, right: StoreReadObservation): boolean {
  if (left.operation !== right.operation) return false;
  if (left.operation === "read" && right.operation === "read") return sameReference(left.input.reference, right.input.reference)
    && left.input.asOf === right.input.asOf;
  if (left.operation === "history" && right.operation === "history") return sameReference(left.input.reference, right.input.reference);
  return canonicalize(left.input) === canonicalize(right.input);
}
