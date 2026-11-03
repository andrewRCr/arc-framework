/** Native frontline command outputs replay through their produced portable result coordinates. */
import { createFrontlineAdmission } from "../../../../../src/scripts/review-gate/core/frontline-admission.js";
import { parseNativeReviewOperationReference } from "../../../../../src/scripts/review-gate/core/review-operation-reference.js";
import { expect, it, onTestFinished } from "vitest";
import { nativeFrontlineReview } from "../../../../fixtures/native-frontline-review.js";
import { createReviewCheckout } from "../../../../helpers/store/review-checkout.js";
import { resolveFrontlineCommand } from "../../../../../src/scripts/review-gate/policy/frontline-command.js";
import { FrontlineSourceRegistry } from "../../../../../src/scripts/review-gate/policy/frontline-source.js";
import { runFrontlineReviewCommand } from "../../../../../src/scripts/review-gate/runtime/frontline-run-command.js";
import { bindReviewSourceReferenceForInvocation } from "../../../../../src/scripts/review-gate/runtime/source-invocation.js";
import { parseReviewSourceReference } from "../../../../../src/scripts/review-gate/core/review-source-reference.js";
import { RepositoryGitCommonStatePublisher } from "../../../../../src/lib/git-common-state.js";
import { bindNativeReviewPorts } from "../../../../helpers/store/native-review-ports.js";

async function nativeRun() {
  const h = await nativeFrontlineReview();
  onTestFinished(h.cleanup);
  const { admission, outcomeRecord } = h.fixture, source = outcomeRecord.outcome.source;
  if (source.kind !== "command" || admission.lineage.kind !== "delivery-member") throw new Error("Expected command/member fixture");
  const resolution = await resolveFrontlineCommand({ schemaVersion: 1, target: admission.target,
    changeSet: admission.routing.facts, invocation: { mode: "force", sourceId: source.sourceId },
    vehicle: { ...admission.lineage, head: admission.target.headSha } }, {
    operationStore: h.operations,
    preferences: { readDeveloperSourceIds: async () => [], readProjectSourceIds: async () => [] },
    registry: new FrontlineSourceRegistry([{ sourceId: source.sourceId,
      descriptor: { kind: "command", executable: source.executable, argv: source.argv } }]),
    resolveLineage: async () => admission.lineage, resolveSupersessionAncestors: async () => [],
    withLaneOperationLock: async (_id, action) => action(), confirmDispositionSetCurrent: async () => true,
    readSettledFindingsAdvice: async () => ({ action: "stop", reason: "no-approved-material-fix" }),
    readMaxPasses: async () => 2, now: () => "2026-10-20T12:00:00Z" });
  if (resolution.state !== "ready") throw new Error("Expected actual ready resolution");
  const dependencies = { operationStore: h.operations, outcomes: h.outcomes,
    withOperationLock: async <T>(_id: string, _wait: number, action: () => Promise<T>) => action(),
    bindSourceReference: (reference: Parameters<typeof bindReviewSourceReferenceForInvocation>[1]) =>
      bindReviewSourceReferenceForInvocation({ ...h, workItem: h.primary.reference.owner }, reference),
    confirmSource: async () => source,
    prepareExecutionTarget: async () => ({ target: admission.target, reviewRoot: h.cwd, release: async () => undefined }),
    execute: async () => ({ outcome: outcomeRecord.outcome, executableIdentity: outcomeRecord.executableIdentity }),
    now: () => "2026-10-20T12:01:00Z" };
  const request = { schemaVersion: 1, target: admission.target, resolution, responseBinding: outcomeRecord.responseBinding };
  const first = await runFrontlineReviewCommand(request, dependencies);
  return { h, request, dependencies, first };
}

it("emits an owner-bearing outcome key and replays that result from a fresh checkout", async () => {
  const { h, request, dependencies, first } = await nativeRun();
  expect(first.state).toBe("findings");
  if (first.payload.operationRef === undefined) throw new Error("Expected produced native operation reference");
  expect(parseNativeReviewOperationReference(first.payload.operationRef)).toEqual({ repositoryId: request.target.repositoryId,
    workItem: h.primary.reference.owner, operationId: first.payload.operationId });
  const reference = parseReviewSourceReference(first.payload.outcomeRef, "frontline", true);
  expect(reference).toEqual({ kind: "frontline", operationId: first.payload.operationId,
    durableRef: first.payload.operationId, repositoryId: request.target.repositoryId, workItem: h.primary.reference.owner });
  if (!("workItem" in reference)) throw new Error("Expected produced native owner");
  const checkout = await createReviewCheckout(h);
  onTestFinished(checkout.cleanup);
  const publisher = new RepositoryGitCommonStatePublisher(checkout.exec, checkout.cwd);
  const operations = bindNativeReviewPorts({ store: h.store, owner: reference.workItem,
    publisher, projectId: h.projectId }).inFlight;
  const replay = await runFrontlineReviewCommand(request, { ...dependencies, operationStore: operations,
    bindSourceReference: value => bindReviewSourceReferenceForInvocation({ ...checkout, workItem: reference.workItem }, value),
    confirmSource: async () => { throw new Error("Ended replay must not rebind the provider"); },
    prepareExecutionTarget: async () => { throw new Error("Ended replay must not materialize the target"); },
    execute: async () => { throw new Error("Ended replay must not execute the provider"); } });
  expect(replay).toEqual({ ...first, payload: { ...first.payload, persistedVersion: 0 } });
  expect(await publisher.list({ root: "review-gate", namespace: "in-flight" })).toEqual([]);
  expect(await publisher.list({ root: "review-gate", namespace: "outcomes" })).toEqual([]);
});

it("refuses a changed admitted policy and replays after restoring the produced ready resolution", async () => {
  const { request, dependencies, first } = await nativeRun();
  const original = request.resolution.payload.admission;
  if (original === undefined) throw new Error("Expected produced ready admission");
  const { operationId: ignoredId, policyVersion: ignoredPolicy, ...input } = original;
  void ignoredId; void ignoredPolicy;
  const altered = createFrontlineAdmission({ ...input,
    frontlineReview: { ...original.frontlineReview, promptText: "Review another concern." } });
  const replayDependencies = { ...dependencies,
    execute: async () => { throw new Error("Ended replay must not execute the provider"); } };
  await expect(runFrontlineReviewCommand({ ...request, resolution: { ...request.resolution, payload: {
    ...request.resolution.payload, admission: altered, frontlineReview: altered.frontlineReview } } }, replayDependencies))
    .rejects.toMatchObject({ code: "invalid-input", reason: "missing-admission" });
  expect(await runFrontlineReviewCommand(request, replayDependencies)).toEqual(first);
});
