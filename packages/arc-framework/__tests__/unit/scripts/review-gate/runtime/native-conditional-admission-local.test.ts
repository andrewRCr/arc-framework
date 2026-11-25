/** Local conditional retries recover actors and policy from ended facts after execution is pruned. */
import { expect, it, onTestFinished } from "vitest";
import { createNativeConditionalAdmissionFixture } from "../../../../fixtures/native-conditional-pass.js";
import { localOutcome } from "../../../../fixtures/review-outcome.js";
import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import { ReviewOutcomeSchema } from "../../../../../src/lib/store/kinds/review/outcome/schema.js";
import { createLocalReviewAdmission } from "../../../../../src/scripts/review-gate/core/local-operation.js";
import { createLocalReviewSource } from "../../../../../src/scripts/review-gate/core/local-review-source.js";
import { publishLocalReviewPreparation } from "../../../../../src/scripts/review-gate/core/local-prepare.js";
import { projectLocalReviewGuidance } from "../../../../../src/scripts/review-gate/policy/local-review-guidance.js";
import { RepositoryLocalReviewSourceStore } from "../../../../../src/scripts/review-gate/hosts/local/source-store.js";
import { recordLocalPendingAttempt, recordLaneAttempt, laneProgressOperationId } from "../../../../../src/scripts/review-gate/lane-progress.js";

type NativeLocal = Awaited<ReturnType<typeof createNativeConditionalAdmissionFixture>>;

async function prepareLocal(h: NativeLocal, generation: number, changed?: "author" | "policy") {
  const candidate = ReviewOutcomeSchema.parse(localOutcome({ target: h.target, logicalPass: h.f.input.capture.nextPass,
    retryGeneration: generation, lineage: h.f.outcome.lineage, vehicle: { kind: "work-unit", identity: "example" } }));
  const local = candidate.local, requirement = candidate.requirement;
  if (local === undefined || requirement === undefined) throw new Error("Expected local producer inputs");
  if (local.vehicle.kind !== "work-unit" || local.attestation.mechanism !== "local-attestation") {
    throw new Error("Expected a work-unit local attestation");
  }
  const admission = createLocalReviewAdmission({ target: candidate.target, requirement, lineage: candidate.lineage,
    logicalPass: candidate.logicalPass, retryGeneration: generation, scopeMode: local.scopeMode,
    authority: { vehicle: local.vehicle, authorIdentity: changed === "author" ? "another-author" : local.request.authorIdentity,
      evaluatorIdentity: local.request.evaluatorIdentity, attestationRuntimeKind: local.attestationRuntimeKind,
      runtimeIdentity: "arc-cli/1.0.0", attestationMechanism: local.attestation.mechanism },
    laneSourceId: candidate.source.sourceId, policyBindingDigest: changed === "policy" ? canonicalDigest({ policy: "another" }) : local.policyBindingDigest,
    requestMechanism: local.request.requestMechanism, coverageAdmission: { requestedCoverage: "complete" } });
  const source = createLocalReviewSource({ schemaVersion: 1, semanticsVersion: "git-object-range/v1",
    repositoryId: h.target.repositoryId, targetId: h.target.targetId, objectFormat: "sha1",
    diffBaseSha: h.target.diffBaseSha, diffBaseTree: h.target.diffBaseTree, headSha: h.target.headSha, headTree: h.target.headTree,
    reachabilityRef: `refs/arc/review/local/${admission.operationId}`, materializationRef: h.cwd });
  const prepared = await publishLocalReviewPreparation(admission, source, {
    sourceStore: new RepositoryLocalReviewSourceStore(h.publisher), operationStore: h.operations,
    materialize: async () => ({ reviewRoot: h.cwd }), now: () => "2026-10-20T14:00:00Z",
    cleanupTtlMs: 60_000, guidance: projectLocalReviewGuidance() });
  return prepared;
}

async function admitLocal(h: NativeLocal, prepared: Awaited<ReturnType<typeof prepareLocal>>) {
  const state = prepared.state;
  const { version } = await h.operations.readOperation(laneProgressOperationId({ lane: "standard",
    repositoryId: h.target.repositoryId, headSha: h.target.headSha, lineage: state.lineage }));
  return recordLocalPendingAttempt(h.operations, { state, ownerVersion: version, now: "2026-10-20T14:00:00Z",
    conditionalPendingAdmission: { authorizationId: h.authorizationId, repositoryId: h.target.repositoryId, lane: "standard",
      lineage: state.lineage, producedHeadSha: h.target.headSha, nextPass: state.logicalPass, admissionId: state.operationId,
      now: "2026-10-20T14:00:00Z", confirmDispositionSetCurrent: async (producer, id) => {
        const evidence = await h.f.input.evidence.read(id);
        return evidence?.value.dispositionSet.producerId === producer && evidence.value.successorDispositionSetId === null;
      } } });
}

it.each(["author", "policy"] as const)("refuses a local retry with a changed %s and admits its recorded contract after repair", async changed => {
  const h = await createNativeConditionalAdmissionFixture("local");
  onTestFinished(h.cleanup);
  const prepared = await prepareLocal(h, 0), { state } = prepared;
  const pending = await admitLocal(h, prepared), attempt = pending.attempts.find(value => value.attemptId === state.operationId);
  if (attempt?.local === undefined) throw new Error("Expected an actual admitted local attempt");
  await recordLaneAttempt(h.operations, { lane: "standard", repositoryId: state.repositoryId, changeRequestId: null,
    headSha: state.target.headSha, lineage: state.lineage, logicalPass: state.logicalPass, retryGeneration: state.retryGeneration,
    attemptId: state.operationId, sourceId: state.laneSourceId, outcome: "terminal-failure", consumedPass: false,
    local: attempt.local, localOutcome: { state }, now: "2026-10-20T14:01:00Z", advancePendingAttempt: true });
  expect((await h.f.input.outcomes.read(state.operationId))?.value.admittedBy).toBe(h.authorizationId);
  expect((await h.operations.readOperation(state.operationId)).state).toBeNull();
  const altered = await prepareLocal(h, 1, changed);
  await expect(admitLocal(h, altered)).rejects.toThrow("actors and policy");
  const repaired = await prepareLocal(h, 1);
  const retried = await admitLocal(h, repaired);
  expect(retried.attempts.find(value => value.attemptId === repaired.state.operationId)).toMatchObject({
    retryGeneration: 1, admittedBy: h.authorizationId, outcome: "pending" });
});
