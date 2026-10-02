/** Cause real reference backend failures, then apply the remedy to their underlying state. */

import { LookupInputSchema } from "../../../src/lib/store/index.js";
import { canonicalReference, recordKey } from "./model.js";
import { success, seed, update } from "./suite-tools.js";
import type { ConformanceFixture, RecoveryCaseId, RecoveryOperation } from "./fixture-contract.js";
import type { ReferenceBackend } from "./reference-backend.js";

/** Prepared operations and repairs are keyed by the complete refusal case identifier. */
export interface ReferenceRecoveryState { repairs: Map<RecoveryCaseId, () => Promise<void>> }

/** Produce a named scenario by ordinary writes, fixture fault hooks and real operation inputs.
 * @param fixture - Backend-neutral hooks under construction.
 * @param backend - The owned reference namespace to corrupt or repair below validation.
 * @param state - Prepared repair closures for later retry.
 * @param caseId - Exhaustively named refusal scenario.
 * @returns The same public operation called before and after its remedy.
 */
export async function produceReferenceRecovery(fixture: ConformanceFixture, backend: ReferenceBackend, state: ReferenceRecoveryState, caseId: RecoveryCaseId): Promise<RecoveryOperation> {
  if (caseId === "not-found:name") {
    const reference = fixture.reference("work-item/meta", "missing");
    const input = LookupInputSchema.parse({ kind: "slug", slug: reference.owner.name });
    state.repairs.set(caseId, async () => { await seed(fixture, reference); });
    return { run: () => fixture.store.lookup(input) };
  }
  if (caseId === "not-found:identity") {
    const record = await seed(fixture, fixture.reference("personal/document"));
    fixture.identity(undefined);
    state.repairs.set(caseId, async () => { fixture.identity(record.reference.owner.name); });
    return { run: () => fixture.store.read({ reference: record.reference }) };
  }
  if (caseId === "unsupported:held-here") {
    await seed(fixture, fixture.reference("work-item/meta"));
    let heldHere = true;
    state.repairs.set(caseId, async () => { heldHere = false; });
    return { run: () => fixture.store.list({ family: "work-item", filter: { heldHere } }) };
  }
  if (["unreachable", "retries-exhausted", "refused"].includes(caseId)) {
    fixture.remote(true);
    await seed(fixture, fixture.reference("work-item/meta"));
    fixture.remoteState(caseId === "unreachable" ? "down" : caseId === "retries-exhausted" ? "contended" : "refusing", "Change the memory remote's write policy.");
    state.repairs.set(caseId, async () => { fixture.remoteState("available"); });
    return { run: () => fixture.store.sync() };
  }
  if (caseId === "ambiguous-match") return produceAmbiguity(fixture, state);
  const record = await seed(fixture, fixture.reference("work-item/meta"));
  let mutation = update(fixture, record);
  if (caseId === "version-conflict") {
    success(await fixture.store.write(update(fixture, record)));
    state.repairs.set(caseId, async () => { mutation = update(fixture, success(await fixture.store.read({ reference: record.reference }))); });
  } else if (caseId === "record-malformed") {
    mutation = update(fixture, record, fixture.content(record.reference, "invalid"));
    state.repairs.set(caseId, async () => { mutation = update(fixture, record); });
  } else if (caseId === "lock-held") {
    fixture.hold(record.reference, true);
    state.repairs.set(caseId, async () => { fixture.hold(record.reference, false); });
  } else if (caseId === "identity-mismatch") {
    fixture.plant(record.reference, "key-mismatch");
    state.repairs.set(caseId, async () => { backend.state.faults.delete(recordKey(canonicalReference(backend.state, record.reference))); });
    return { run: () => fixture.store.read({ reference: record.reference }) };
  } else if (caseId === "namespace-corrupt") {
    backend.state.corrupt = true;
    state.repairs.set(caseId, async () => { backend.state.records = structuredClone(backend.state.snapshots.get(await fixture.settle())!); backend.state.corrupt = false; });
  } else throw new Error(`The reference fixture cannot produce ${caseId}; declare its reasoned exclusion.`);
  return { run: () => fixture.store.write(mutation) };
}

async function produceAmbiguity(fixture: ConformanceFixture, state: ReferenceRecoveryState): Promise<RecoveryOperation> {
  const branch = { repository: "ambiguous-repository", ref: "shared-branch" };
  await seed(fixture, fixture.reference("work-item/meta"), undefined, { kind: "active" }, { branch });
  const second = await seed(fixture, fixture.reference("work-item/meta", "two"), undefined, { kind: "active" }, { branch });
  state.repairs.set("ambiguous-match", async () => { success(await fixture.store.write({ ...update(fixture, second), links: {} })); });
  return { run: () => fixture.store.lookup({ kind: "ref", ...branch }) };
}
