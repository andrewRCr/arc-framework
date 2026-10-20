/** Contract-level cut-map fixtures capture origin observations before their native batch. */
import type { Store } from "../../../src/lib/store/contract.js";
import type { BatchInput, WriteInput } from "../../../src/lib/store/write.js";
import { sameReference } from "../../../src/lib/store/identity.js";
import { observeRecords } from "../../../src/lib/store/record-observations.js";
import { acquireLifecycleRecords } from "../../../src/lib/work-unit/prepared-lifecycle-write.js";

/** Preserve test-authored mutations while binding every current cut origin record. */
export async function observedDecomposeBatch(store: Store, input: BatchInput) {
  const observations = [...input.observations ?? []];
  for (const write of input.writes) {
    if (write.reference.kind !== "work-item/cut-map") continue;
    const group = await acquireLifecycleRecords(store, write.reference.owner.name);
    if (group.status === "refused") return group;
    for (const observation of observeRecords(group.result)) {
      if (!observations.some(item => sameReference(item.reference, observation.reference))) observations.push(observation);
    }
  }
  return store.batch({ ...input, observations });
}

/** Submit a contract-level singleton fixture through the same observed batch boundary. */
export async function observedDecomposeWrite(store: Store, input: WriteInput) {
  const { provenance, ...write } = input;
  const result = await observedDecomposeBatch(store, { writes: [write], provenance });
  if (result.status === "refused") return result;
  return { status: "ok" as const, result: result.result.writes[0]! };
}
