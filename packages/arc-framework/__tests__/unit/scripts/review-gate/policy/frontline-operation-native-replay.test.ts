/** Completed frontline runs replay portable results without requiring their original checkout. */
import { createFrontlineAdmission } from "../../../../../src/scripts/review-gate/core/frontline-admission.js";
import { recordLaneAttempt, recordFrontlineAttempt } from "../../../../../src/scripts/review-gate/lane-progress.js";
import { expect, it, onTestFinished } from "vitest";
import { nativeFrontlineReview } from "../../../../fixtures/native-frontline-review.js";
import { createReviewCheckout } from "../../../../helpers/store/review-checkout.js";
import { RepositoryGitCommonStatePublisher } from "../../../../../src/lib/git-common-state.js";
import { NativeReviewInFlightStateStore } from "../../../../../src/scripts/review-gate/hosts/local/in-flight-state-store.js";
import { LocalFrontlineOutcomeStore } from "../../../../../src/scripts/review-gate/hosts/local/frontline-outcome-store.js";
import { executeFrontlineRun } from "../../../../../src/scripts/review-gate/policy/frontline-operation.js";
import { normalizeFrontlineOutcome } from "../../../../../src/scripts/review-gate/policy/frontline-outcome.js";

async function completedFrontline(result: "clean" | "findings" | "failed" | "unavailable" | "timed-out" | "stale-target" = "findings") {
  const h = await nativeFrontlineReview(result === "clean" ? "clean" : "findings");
  onTestFinished(h.cleanup);
  const { admission, outcomeRecord } = h.fixture;
  const outcome = result === "clean" || result === "findings" ? outcomeRecord.outcome : normalizeFrontlineOutcome({
    source: outcomeRecord.outcome.source, target: admission.target, pass: admission.logicalPass, maxPasses: admission.maxPasses,
    providerResult: result === "unavailable" ? { kind: "rate-limited" } : result === "timed-out" ? { kind: "timed-out" }
      : result === "stale-target" ? { kind: "stale-head", expectedHeadSha: admission.target.headSha, observedHeadSha: "e".repeat(40) }
      : { kind: "malformed" } });
  const dependencies = { operationStore: h.operations, outcomeStore: new LocalFrontlineOutcomeStore(h.publisher),
    outcomes: h.outcomes, withOperationLock: async <T>(_id: string, _wait: number, action: () => Promise<T>) => action(),
    execute: async () => ({ outcome, executableIdentity: outcomeRecord.executableIdentity }),
    now: () => "2026-10-20T12:01:00Z" };
  const input = { admission, responseBinding: outcomeRecord.responseBinding, lockWaitMs: 1 };
  const terminal = await executeFrontlineRun(dependencies, input);
  dependencies.execute = async () => { throw new Error("Completed run must not invoke the provider again"); };
  return { h, input, dependencies, terminal };
}

it.each(["clean", "findings", "failed", "unavailable", "timed-out", "stale-target"] as const)("replays the stored %s result without terminal execution state", async result => {
  const { h, input, dependencies, terminal } = await completedFrontline(result);
  const stored = await h.outcomes.read(input.admission.operationId);
  expect(await h.operations.readOperation(input.admission.operationId)).toEqual({ version: 1, state: null });
  const replay = await executeFrontlineRun(dependencies, input);
  expect(replay).toEqual({ ...terminal, outcome: { ...terminal.outcome,
    source: { sourceId: terminal.outcome.source.sourceId, kind: "command", capability: null } } });
  expect((await recordFrontlineAttempt(h.operations, { admission: input.admission, outcome: replay.outcome,
    now: "2026-10-20T12:02:00Z" }))?.attempts).toHaveLength(1);
  expect(await h.outcomes.read(input.admission.operationId)).toEqual(stored);
  expect(await h.publisher.list({ root: "review-gate", namespace: "outcomes" })).toEqual([]);
});

it("replays an ended frontline run in a fresh checkout without creating execution files", async () => {
  const { h, input, dependencies, terminal } = await completedFrontline();
  const checkout = await createReviewCheckout(h);
  onTestFinished(checkout.cleanup);
  const publisher = new RepositoryGitCommonStatePublisher(checkout.exec, checkout.cwd);
  const operations = new NativeReviewInFlightStateStore({ publisher, workItem: h.primary.reference.owner,
    outcomes: h.outcomes, projectId: h.projectId });
  expect(await executeFrontlineRun({ ...dependencies, operationStore: operations,
    outcomeStore: new LocalFrontlineOutcomeStore(publisher) }, input)).toMatchObject({ operationId: terminal.operationId,
    persistedVersion: 0, outcomeRef: terminal.outcomeRef, outcomeDigest: terminal.outcomeDigest,
    executableIdentity: terminal.executableIdentity, outcome: { outcome: "findings", findings: terminal.outcome.findings } });
  for (const namespace of ["in-flight", "outcomes"] as const) {
    expect(await publisher.list({ root: "review-gate", namespace })).toEqual([]);
  }
});

async function freshRetry(h: Awaited<ReturnType<typeof completedFrontline>>) {
  const { operationId: ignoredId, policyVersion: ignoredPolicy, ...prior } = h.input.admission;
  void ignoredId; void ignoredPolicy;
  const admission = createFrontlineAdmission({ ...prior, retryGeneration: prior.retryGeneration + 1 });
  await recordLaneAttempt(h.h.operations, { lane: "frontline", repositoryId: admission.target.repositoryId,
    changeRequestId: null, headSha: admission.target.headSha, lineage: admission.lineage,
    logicalPass: admission.logicalPass, retryGeneration: admission.retryGeneration, attemptId: admission.operationId,
    sourceId: h.terminal.outcome.source.sourceId, outcome: "pending", consumedPass: false,
    frontline: { admission, effectiveCoverage: null }, now: "2026-10-20T12:02:00Z" });
  return { ...h.input, admission, retryOfOperationId: h.input.admission.operationId };
}

it("admits a fresh retry from an inconclusive stored prior without reviving that prior execution", async () => {
  const h = await completedFrontline("failed"), input = await freshRetry(h);
  h.dependencies.execute = async () => ({ executableIdentity: h.terminal.executableIdentity,
    outcome: normalizeFrontlineOutcome({ providerResult: { kind: "clean" },
      source: h.h.fixture.outcomeRecord.outcome.source, target: input.admission.target,
      pass: input.admission.logicalPass, maxPasses: input.admission.maxPasses }) });
  expect(await executeFrontlineRun(h.dependencies, input)).toMatchObject({ operationId: input.admission.operationId,
    outcome: { outcome: "clean" } });
  expect(await h.h.operations.readOperation(h.input.admission.operationId)).toEqual({ version: 1, state: null });
  const listing = await h.h.outcomes.list();
  expect(listing.status === "complete" && listing.records.map(record => record.value.outcome).sort()).toEqual(["clean", "malformed"]);
});

it("refuses a stored verdict as a retry prior without invoking a provider", async () => {
  const h = await completedFrontline("clean");
  const { operationId: ignoredId, policyVersion: ignoredPolicy, ...prior } = h.input.admission;
  void ignoredId; void ignoredPolicy;
  const admission = createFrontlineAdmission({ ...prior, retryGeneration: prior.retryGeneration + 1 });
  await expect(executeFrontlineRun(h.dependencies, { ...h.input, admission,
    retryOfOperationId: h.input.admission.operationId })).rejects.toMatchObject({ code: "invalid-input",
    message: "retry requires an inconclusive prior operation" });
});

it("requires a fresh admission for an explicit retry of the same stored failure", async () => {
  const h = await completedFrontline("failed");
  await expect(executeFrontlineRun(h.dependencies, { ...h.input,
    retryOfOperationId: h.input.admission.operationId })).rejects.toMatchObject({ code: "invalid-input", reason: "stale-admission" });
});

it("refuses changed response authority on ended replay and succeeds with the original binding", async () => {
  const { h, input, dependencies } = await completedFrontline();
  const stored = await h.outcomes.read(input.admission.operationId);
  await expect(executeFrontlineRun(dependencies, { ...input, responseBinding: undefined }))
    .rejects.toMatchObject({ code: "corrupt-state", message: "frontline outcome does not match its operation binding" });
  expect(await h.outcomes.read(input.admission.operationId)).toEqual(stored);
  expect(await executeFrontlineRun(dependencies, input)).toMatchObject({ outcomeDigest: stored?.value.frontline?.outcomeDigest });
});
