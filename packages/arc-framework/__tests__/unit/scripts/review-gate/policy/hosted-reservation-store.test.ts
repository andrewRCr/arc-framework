/** Native reservation policy preserves repository behavior across a failed request and its next-head restart. */
import { expect, it, onTestFinished } from "vitest";
import { createReviewHarness } from "../../../../helpers/store/review-harness.js";
import { createReviewCheckout } from "../../../../helpers/store/review-checkout.js";
import { createHostedHandleFixture } from "../../../../fixtures/hosted-review.js";
import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import { DeliveryReviewMemberVehicleSchema } from "../../../../../src/lib/delivery/review-vehicle.js";
import { RepositoryGitCommonStatePublisher } from "../../../../../src/lib/git-common-state.js";
import { createReviewCompositionContext } from "../../../../../src/scripts/review-gate/runtime/composition-context.js";
import { LocalReviewOperationStateStore } from "../../../../../src/scripts/review-gate/hosts/local/operation-state-store.js";
import type { ReviewOperationStateStore, ReviewOperationStateSnapshotIndex } from "../../../../../src/scripts/review-gate/core/ports.js";
import { recordHostedRequestAdmission, acknowledgeHostedRequest, recordHostedAwaitAttempt } from "../../../../../src/scripts/review-gate/lane-progress-hosted-request.js";
import { recordHostedRequestConclusion } from "../../../../../src/scripts/review-gate/lane-progress-hosted-settlement.js";
import { HostedRequestResultSchema, hostedAwaitAction } from "../../../../../src/scripts/review-gate/hosted/request.js";
import { awaitHostedReview } from "../../../../../src/scripts/review-gate/hosted/await.js";
import { readLaneProgress, readLaneResponsePerformance } from "../../../../../src/scripts/review-gate/lane-progress.js";
import { createRepositoryReviewResultReader } from "../../../../../src/scripts/review-gate/hosts/local/review-result-reader-composition.js";
import { LocalApprovedDispositionRecordStore } from "../../../../../src/scripts/review-gate/hosts/local/disposition-record-store.js";
import { createStandardReviewReservation } from "../../../../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import { projectHostedReservationPolicyProgress, resolveEvidenceBoundHostedReservationPolicy,
  assertEvidenceBoundHostedReservationPolicyAdmission } from "../../../../../src/scripts/review-gate/policy/hosted-reservation-admission.js";
import { projectHostedReservationDischarge } from "../../../../../src/scripts/review-gate/policy/hosted-reservation-discharge.js";

it("retains a failed request's reservation, keeps its restart pending, and discharges its clean result in the same order", async () => {
  const h = createReviewHarness(), projectId = "123e4567-e89b-42d3-a456-426614174099";
  await h.seedProject(projectId);
  const primary = await h.seedMeta("example");
  const checkout = await createReviewCheckout(h), repository = await createReviewCheckout(h);
  onTestFinished(checkout.cleanup);
  onTestFinished(repository.cleanup);
  const context = createReviewCompositionContext({ ...checkout, workItem: primary.reference.owner });
  if (context.family.mode !== "stored") throw new Error("expected portable family");
  const native = context.family.ports.inFlight;
  const repositoryPublisher = new RepositoryGitCommonStatePublisher(repository.exec, repository.cwd);
  const legacy = new LocalReviewOperationStateStore(repositoryPublisher);
  const member = DeliveryReviewMemberVehicleSchema.parse({ kind: "delivery-member", workUnitId: "example",
    planId: "123e4567-e89b-42d3-a456-426614174000", deliverableId: canonicalDigest({ member: 1 }), head: "c".repeat(40) });
  const failed = createHostedHandleFixture({ repositoryId: projectId, vehicle: member });
  const restarted = createHostedHandleFixture({ repositoryId: projectId, vehicle: { ...member, head: "d".repeat(40) },
    target: { ...failed.target, headSha: "d".repeat(40) }, artifact: { ...failed.artifact, id: "restart-request" } });
  const reservation = createStandardReviewReservation({ candidateId: canonicalDigest({ candidate: 1 }),
    sourceId: failed.provider, sources: [failed.provider], target: { kind: "delivery", repository: failed.target.repository,
      planId: member.planId, workUnitId: member.workUnitId }, obligation: { obligation: failed.admission.requirement.obligation,
      reasons: failed.admission.requirement.reasons, rubricVersion: failed.admission.requirement.rubricVersion,
      rubricDigest: failed.admission.requirement.rubricDigest, retrigger: failed.admission.requirement.retrigger, count: 1 } });
  const admit = async (store: ReviewOperationStateStore, handle: typeof failed, now: string) => {
    const admitted = await recordHostedRequestAdmission(store, { repositoryId: projectId, lineage: handle.admission.lineage,
      request: { schemaVersion: 1, provider: handle.provider, target: handle.target, coverage: "complete" },
      progressVehicle: handle.vehicle, reviewTarget: handle.admission.reviewTarget, requirement: handle.admission.requirement,
      actorIdentity: handle.admission.actorIdentity, authorizeCapacity: async () => undefined, now });
    if (admitted.state !== "admitted") throw new Error(JSON.stringify(admitted));
    expect(admitted.admission).toEqual(handle.admission);
    return admitted.admission;
  };
  const view = async (store: ReviewOperationStateStore & ReviewOperationStateSnapshotIndex, handle: typeof failed, portable = context) => {
    const vehicle = DeliveryReviewMemberVehicleSchema.parse(handle.vehicle);
    const input = { snapshot: await store.readOperationSnapshot(), repositoryId: projectId, target: handle.target, vehicle };
    const progress = projectHostedReservationPolicyProgress(input);
    if (progress.status !== "complete") throw new Error(progress.detail);
    const resultReader = store.stateOffBranch === true ? createRepositoryReviewResultReader(portable.publisher,
      { store: h.store, projectId: h.projectId, workItem: primary.reference.owner }) : createRepositoryReviewResultReader(repositoryPublisher);
    const dispositions = store.stateOffBranch === true ? portable.family.ports.dispositions : new LocalApprovedDispositionRecordStore(repositoryPublisher);
    const policyInput = { ...input, reservation, maxPasses: 4, currentReviewTarget: handle.admission.reviewTarget };
    const evidence = { resultReader, dispositionStore: dispositions,
      confirmTarget: async () => handle.admission.reviewTarget,
      readResponsePerformance: (producer: Parameters<typeof readLaneResponsePerformance>[1]) => readLaneResponsePerformance(store, producer) };
    const resolution = await resolveEvidenceBoundHostedReservationPolicy(policyInput, evidence);
    if (resolution.status !== "resolved") throw new Error(resolution.detail);
    let admission = "accepted";
    try { await assertEvidenceBoundHostedReservationPolicyAdmission({ ...policyInput, provider: handle.provider, coverage: "complete" }, evidence); }
    catch (error) { admission = error instanceof Error ? error.message : "unknown refusal"; }
    const discharge = await projectHostedReservationDischarge({ reservation, span: [failed.target.headSha, restarted.target.headSha],
      target: { ...handle.target, vehicle },
      readLaneProgress: headSha => readLaneProgress(store, { lane: "standard", repositoryId: projectId, headSha,
        lineage: handle.admission.lineage }),
      resolveTerminalPolicy: async () => resolution.policy,
      resolveEarlierTerminalPolicy: async () => { throw new Error("no earlier applicability was admitted"); } });
    return { progress, policy: resolution.policy, discharge, admission };
  };
  for (const store of [native, legacy]) {
    const admission = await admit(store, failed, "2026-10-20T18:00:00Z");
    const result = HostedRequestResultSchema.parse({ schemaVersion: 1, mode: "review-hosted-request", requestedCoverage: "complete",
      attemptedProviders: [failed.provider], provider: failed.provider, state: "terminal-failure", nextAction: "stop",
      reason: "Provider rejected this request." });
    if (result.state !== "terminal-failure") throw new Error("expected failure");
    await recordHostedRequestConclusion(store, { admission, result, now: "2026-10-20T18:01:00Z" });
  }
  const failedView = await view(native, failed);
  expect(failedView).toEqual(await view(legacy, failed));
  expect(failedView.discharge.discharged).toBe(false);
  for (const store of [native, legacy]) {
    const admission = await admit(store, restarted, "2026-10-20T18:02:00Z");
    await acknowledgeHostedRequest(store, { admission, handle: restarted, now: "2026-10-20T18:03:00Z" });
  }
  const pendingView = await view(native, restarted);
  expect(pendingView).toEqual(await view(legacy, restarted));
  expect(pendingView.discharge.discharged).toBe(false);
  const terminal = await awaitHostedReview({ ...hostedAwaitAction(restarted), timeoutMs: 2_000, pollIntervalMs: 100 }, {
    clock: { now: () => Date.parse(restarted.artifact.createdAt), sleep: async () => undefined }, attentionAfterMs: 60_000,
    observers: [{ id: restarted.provider, readHead: async () => restarted.target.headSha,
      observe: async () => ({ kind: "clean", reviewUrl: "https://example.invalid/review-1" }) }],
  });
  for (const store of [native, legacy]) await recordHostedAwaitAttempt(store, { repositoryId: projectId,
    result: terminal, now: "2026-10-20T18:04:00Z" });
  const cleanView = await view(native, restarted);
  expect(cleanView).toEqual(await view(legacy, restarted));
  expect(cleanView.discharge.discharged).toBe(true);
  expect(cleanView.progress).toMatchObject({ completedPasses: 1, completePasses: 1,
    attemptHistory: [{ outcome: "terminal-failure" }, { outcome: "clean" }] });
  expect(cleanView.admission).not.toBe("accepted");
  const fresh = await createReviewCheckout(h);
  onTestFinished(fresh.cleanup);
  const reopened = createReviewCompositionContext({ ...fresh, workItem: primary.reference.owner });
  expect(await view(reopened.family.ports.inFlight, restarted, reopened)).toEqual(cleanView);
  expect(await reopened.publisher.list({ root: "review-gate", namespace: "in-flight" })).toEqual([]);
});
