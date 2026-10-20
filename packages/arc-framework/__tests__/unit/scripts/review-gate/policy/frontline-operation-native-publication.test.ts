/** Frontline execution publishes portable facts before ending clone-local admission state. */
import { expect, it } from "vitest";
import { recordFrontlineAttempt } from "../../../../../src/scripts/review-gate/lane-progress.js";
import { createFrontlineAdmission } from "../../../../../src/scripts/review-gate/core/frontline-admission.js";
import { LocalFrontlineOutcomeStore } from "../../../../../src/scripts/review-gate/hosts/local/frontline-outcome-store.js";
import { executeFrontlineRun } from "../../../../../src/scripts/review-gate/policy/frontline-operation.js";
import { normalizeFrontlineOutcome } from "../../../../../src/scripts/review-gate/policy/frontline-outcome.js";
import { createFrontlineOutcomeRecord } from "../../../../../src/scripts/review-gate/core/advisory-records.js";

import { nativeFrontlineReview as pendingFrontline } from "../../../../fixtures/native-frontline-review.js";

it.each(["clean", "findings", "failed"] as const)("publishes one portable %s result before ending the pending attempt", async result => {
  const h = await pendingFrontline(result === "clean" ? "clean" : "findings");
  try {
    const { fixture, operations, outcomes, publisher } = h;
    const { admission } = fixture;
    const outcome = result === "failed" ? normalizeFrontlineOutcome({ providerResult: { kind: "malformed" },
      source: fixture.outcomeRecord.outcome.source, target: admission.target,
      pass: admission.logicalPass, maxPasses: admission.maxPasses }) : fixture.outcomeRecord.outcome;
    const { outcomeDigest: ignored, ...recordInput } = fixture.outcomeRecord;
    void ignored;
    const original = createFrontlineOutcomeRecord({ ...recordInput, outcome });
    const terminal = await executeFrontlineRun({ operationStore: operations,
      outcomeStore: new LocalFrontlineOutcomeStore(publisher), outcomes,
      withOperationLock: async (_id, _wait, action) => action(),
      execute: async () => ({ outcome, executableIdentity: original.executableIdentity }),
      now: () => "2026-10-20T12:01:00Z" }, { admission,
      responseBinding: original.responseBinding, lockWaitMs: 1 });
    const stored = await outcomes.read(admission.operationId);
    expect(stored?.reference.owner).toEqual(h.primary.reference.owner);
    expect(stored?.value).toMatchObject({ attemptId: admission.operationId, lane: "frontline",
      outcome: result === "failed" ? "malformed" : result, findings: outcome.findings,
      endedAt: "2026-10-20T12:01:00Z", frontline: { outcomeDigest: original.outcomeDigest,
        sourceBindingId: fixture.run.sourceBindingId, executableIdentity: original.executableIdentity,
        responseBinding: original.responseBinding,
        admission: { frontlineReview: { source: { sourceId: "coderabbit-cli", kind: "command", capability: null } } } } });
    expect(JSON.stringify(stored?.value)).not.toContain('"executable":');
    expect(JSON.stringify(stored?.value)).not.toContain('"argv":');
    expect(terminal).toMatchObject({ persistedVersion: 1, outcomeRef: admission.operationId,
      outcomeDigest: original.outcomeDigest, outcome });
    expect(await publisher.snapshot({ root: "review-gate", namespace: "outcomes" })).toEqual([]);
    expect(await operations.readOperation(admission.operationId)).toEqual({ version: 1, state: null });
    const lane = await recordFrontlineAttempt(operations, { admission, outcome, now: "2026-10-20T12:02:00Z" });
    expect(lane?.completedPasses).toBe(result === "failed" ? 0 : 1);
    expect(lane?.attempts).toHaveLength(1);
    expect(lane?.attempts[0]?.outcome).toBe(result === "failed" ? "malformed" : result);
    expect(await outcomes.read(admission.operationId)).toEqual(stored);
    const listing = await outcomes.list();
    expect(listing.status === "complete" && listing.records.length).toBe(1);
  } finally { await h.cleanup(); }
});

async function finishRun(h: Awaited<ReturnType<typeof pendingFrontline>>) {
  const { admission, outcomeRecord } = h.fixture;
  return executeFrontlineRun({ operationStore: h.operations, outcomeStore: new LocalFrontlineOutcomeStore(h.publisher),
    outcomes: h.outcomes, withOperationLock: async (_id, _wait, action) => action(),
    execute: async () => ({ outcome: outcomeRecord.outcome, executableIdentity: outcomeRecord.executableIdentity }),
    now: () => "2026-10-20T12:01:00Z" }, { admission, responseBinding: outcomeRecord.responseBinding, lockWaitMs: 1 });
}

it("refuses a missing publication with a run replay remedy and accepts the published completion", async () => {
  const h = await pendingFrontline();
  try {
    const input = { admission: h.fixture.admission, outcome: h.fixture.outcomeRecord.outcome, now: "2026-10-20T12:02:00Z" };
    await expect(recordFrontlineAttempt(h.operations, input)).rejects.toThrow("replay its run before ending the attempt");
    expect(await h.outcomes.read(input.admission.operationId)).toBeNull();
    await finishRun(h);
    expect((await recordFrontlineAttempt(h.operations, input))?.completedPasses).toBe(1);
  } finally { await h.cleanup(); }
});

it("refuses a completion with changed admission policy and accepts the original admission after repair", async () => {
  const h = await pendingFrontline();
  try {
    await finishRun(h);
    const original = h.fixture.admission;
    const { operationId: ignoredOperation, policyVersion: ignoredPolicy, ...admissionInput } = original;
    void ignoredOperation; void ignoredPolicy;
    const altered = createFrontlineAdmission({ ...admissionInput,
      frontlineReview: { ...original.frontlineReview, promptText: "Review a different concern." } });
    const stored = await h.outcomes.read(original.operationId);
    await expect(recordFrontlineAttempt(h.operations, { admission: altered, outcome: h.fixture.outcomeRecord.outcome,
      now: "2026-10-20T12:02:00Z" })).rejects.toThrow("does not match its admitted completion");
    expect(await h.outcomes.read(original.operationId)).toEqual(stored);
    expect((await recordFrontlineAttempt(h.operations, { admission: original, outcome: h.fixture.outcomeRecord.outcome,
      now: "2026-10-20T12:02:00Z" }))?.completedPasses).toBe(1);
  } finally { await h.cleanup(); }
});
