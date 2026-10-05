/** Real repairable remote conditions and transient expected-basis refusals. */
import { expect } from "vitest";
import { seed, success, testProvenance, update } from "./suite-tools.js";
import type { ConformanceFixture, RecoveryCaseId, RecoveryOperation } from "./fixture-contract.js";

/** Produce refusals on actual identity refs and preserve the original write intent for repair.
 * @param fixture - Public Store and its physical remote hooks.
 * @param repairs - Named continuations retained by the fixture.
 * @param id - Transport, configured identity, or transient write case.
 * @returns The executable refusal and its retry, or undefined for another producer.
 */
export async function produceRemoteRecovery(fixture: ConformanceFixture, repairs: Map<string, () => Promise<void>>, id: RecoveryCaseId): Promise<RecoveryOperation | undefined> {
  if (!id.startsWith("transient-write:") && !["unreachable", "refused", "retries-exhausted"].includes(id)) return undefined;
  const reference = fixture.reference("work-item/record");
  if (id === "transient-write:record-malformed") {
    let content = fixture.content(reference, "invalid");
    repairs.set(id, async () => { content = fixture.content(reference); });
    return { run: () => fixture.store.write({ action: "put", reference, content, expected: null, placement: { kind: "active" }, provenance: testProvenance }) };
  }
  if (id === "transient-write:version-conflict") {
    const remote = fixture.remote(true);
    if (remote === undefined) throw new Error("Transient recovery requires an actual second clone");
    const original = await seed(fixture, reference);
    const remoteRecord = success(await remote.read({ reference }));
    success(await remote.write(update(fixture, remoteRecord)));
    let input = update(fixture, original, fixture.content(reference, "changed-again"));
    repairs.set(id, async () => {
      const reconciled = success(await fixture.store.read({ reference }));
      expect(reconciled.content).toBe(fixture.content(reference, "changed"));
      input = update(fixture, reconciled, input.content);
    });
    return { run: () => fixture.store.write(input) };
  }
  const record = await seed(fixture, reference);
  fixture.remote(true);
  const state = id.endsWith("unreachable") ? "down" : id.endsWith("refused") ? "refusing" : "contended";
  fixture.remoteState(state, "Remote policy requires a permitted writer.");
  let input = update(fixture, record);
  repairs.set(id, async () => {
    fixture.remoteState("available");
    const current = success(await fixture.store.read({ reference }));
    input = update(fixture, current, input.content);
  });
  return { run: () => id.startsWith("transient-write:") ? fixture.store.write(input) : fixture.store.sync() };
}
