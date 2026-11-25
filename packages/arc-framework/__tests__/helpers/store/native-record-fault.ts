/** Isolated reference-backend failures at one selected native record boundary. */
import type { ListInput } from "../../../src/lib/store/read.js";
import { sameOwner, sameReference } from "../../../src/lib/store/identity.js";
import type { Store } from "../../../src/lib/store/contract.js";
import type { RecordReference } from "../../../src/lib/store/identity.js";
import { LifecycleReferenceBackend } from "./lifecycle-harness.js";

/** Fail one selected record read without corrupting concurrent reads of the healthy store. */
export async function refuseNativeRecordRead(store: Store, reference: RecordReference, occurrence = 1) {
  const damaged = new LifecycleReferenceBackend();
  damaged.state.corrupt = true;
  const refused = await damaged.read({ reference });
  if (refused.status !== "refused") throw new Error("Expected the damaged reference backend to refuse");
  let active = true, matches = 0, injected = 0;
  const trace: string[] = [];
  const selected = Object.create(store) as Store;
  selected.read = async input => {
    trace.push(JSON.stringify(input.reference));
    if (active && sameReference(input.reference, reference) && ++matches === occurrence) {
      injected++;
      return refused;
    }
    return store.read(input);
  };
  return { store: selected, refusal: refused.refusal, trace, injected: () => injected,
    repair: () => { active = false; } };
}

/** Fail one kind-scoped listing with the real damaged backend's refusal, leaving other families readable. */
export async function refuseNativeListing(store: Store, scope: ListInput, occurrence = 1) {
  const damaged = new LifecycleReferenceBackend();
  damaged.state.corrupt = true;
  const refused = await damaged.list(scope);
  if (refused.status !== "refused") throw new Error("Expected the damaged reference backend to refuse");
  let active = true, matches = 0, injected = 0;
  const selected = Object.create(store) as Store;
  const trace: string[] = [];
  selected.list = async input => {
    if (input.family === scope.family && input.kind === scope.kind) trace.push(JSON.stringify(input));
    if (active && input.family === scope.family && input.kind === scope.kind
      && (scope.owner === undefined || (input.owner !== undefined && sameOwner(input.owner, scope.owner))) && ++matches === occurrence) {
      injected++;
      return refused;
    }
    return store.list(input);
  };
  return { store: selected, refusal: refused.refusal, trace, injected: () => injected,
    repair: () => { active = false; } };
}
