import { createHostedReservationDischargeReader } from "../../../../../src/scripts/review-gate/policy/hosted-reservation-discharge.js";
import { createStandardReviewReservation } from "../../../../../src/scripts/review-gate/policy/integration-boundary-locus.js";
/** Hosted applicability composition retains invocation ownership through actual stored working state. */
import { expect, it, onTestFinished } from "vitest";
import { createReviewHarness } from "../../../../helpers/store/review-harness.js";
import { createReviewCheckout } from "../../../../helpers/store/review-checkout.js";
import { candidateFixture } from "../../../../helpers/store/tracked-write-fixture.js";
import { createHostedHandleFixture, createHostedTerminalAttemptFixture } from "../../../../fixtures/hosted-review.js";
import { DeliveryReviewMemberVehicleSchema } from "../../../../../src/lib/delivery/review-vehicle.js";
import { createReviewCompositionContext } from "../../../../../src/scripts/review-gate/runtime/composition-context.js";
import { recordHostedRequestAdmission, acknowledgeHostedRequest } from "../../../../../src/scripts/review-gate/lane-progress-hosted-request.js";
import { recordLaneAttempt } from "../../../../../src/scripts/review-gate/lane-progress.js";
import { createHostedApplicabilityContext } from "../../../../../src/scripts/review-gate/policy/hosted-applicability-context.js";
import { parseReviewSourceReference } from "../../../../../src/scripts/review-gate/core/review-source-reference.js";

it.each(["repository", "native", "discharge"] as const)("retains the selected source owner through %s applicability", async mode => {
  const native = mode !== "repository";
  const h = createReviewHarness();
  const repositoryId = "123e4567-e89b-42d3-a456-426614174099";
  await h.seedProject(repositoryId);
  const primary = await h.seedMeta("example", { branch: null });
  const candidate = candidateFixture();
  await h.seedCandidate(primary.reference.owner, candidate);
  const checkout = await createReviewCheckout(h, { script: [
    { match: { prefix: ["rev-list"] }, responses: [{ stdout: "c".repeat(40) }] },
    { match: ["check-ref-format", "refs/heads/main"], responses: [{ stdout: "" }] },
    ...["a", "b", "c", "d"].flatMap(char => [
      { match: ["cat-file", "-t", char.repeat(40)], responses: [{ stdout: "commit" }] },
      { match: ["rev-parse", "--verify", char.repeat(40)], responses: [{ stdout: char.repeat(40) }] },
      { match: ["rev-parse", `${char.repeat(40)}^{tree}`], responses: [{ stdout: (char === "a" ? "b" : "d").repeat(40) }] },
    ]),
  ] });
  onTestFinished(checkout.cleanup);
  const context = createReviewCompositionContext({ ...checkout, workItem: primary.reference.owner });
  const vehicle = DeliveryReviewMemberVehicleSchema.parse({ kind: "delivery-member", workUnitId: "example",
    planId: "123e4567-e89b-42d3-a456-426614174002", deliverableId: `sha256:${"7".repeat(64)}`, head: "c".repeat(40) });
  const handle = createHostedHandleFixture({ repositoryId, vehicle });
  const terminal = createHostedTerminalAttemptFixture({ admission: handle.admission, artifact: handle.artifact,
    outcome: "findings", findings: [{ findingId: "finding-prior", origin: "review-thread", commentId: "comment-prior",
      threadId: "thread-prior", settlement: "reply-and-resolve", severity: "major", locus: "src/example.ts:7",
      url: "https://example.invalid/finding-prior", sourceOrdinal: 1 }] });
  const admitted = await recordHostedRequestAdmission(context.family.ports.inFlight, { repositoryId,
    lineage: handle.admission.lineage, request: { schemaVersion: 1, target: handle.target, provider: handle.provider,
      coverage: handle.requestedCoverage }, progressVehicle: vehicle, reviewTarget: handle.admission.reviewTarget,
    requirement: handle.admission.requirement, actorIdentity: handle.admission.actorIdentity,
    authorizeCapacity: async ({ logicalPass }) => { if (logicalPass !== 1) throw new Error("Expected first admitted pass"); },
    now: "2026-10-19T12:00:00Z" });
  if (admitted.state !== "admitted") throw new Error(JSON.stringify(admitted));
  expect(admitted.admission).toEqual(handle.admission);
  await acknowledgeHostedRequest(context.family.ports.inFlight, { admission: admitted.admission, handle,
    now: "2026-10-19T12:01:00Z" });
  const lane = await recordLaneAttempt(context.family.ports.inFlight, { lane: "standard", repositoryId,
    changeRequestId: `pull/${handle.target.pullRequest}`, headSha: handle.target.headSha, lineage: handle.admission.lineage,
    logicalPass: 1, retryGeneration: 0, attemptId: terminal.attemptId, sourceId: handle.provider,
    outcome: "findings", consumedPass: true, advancePendingAttempt: true, hosted: terminal.hosted, now: "2026-10-19T13:00:00Z" });
  const currentHead = "d".repeat(40), base = "b".repeat(40);
  const input = { ...checkout, nativeWorkItem: native ? primary.reference.owner : undefined,
    store: context.family.ports.inFlight, dispositions: context.family.ports.dispositions,
    repositoryId: h.projectId, rawExec: async (): Promise<never> => { throw new Error("Movement precedes Git proof"); },
    args: { baseRevision: base, approvedHead: currentHead, changeRequest: { repository: handle.target.repository,
      pullRequest: handle.target.pullRequest }, vehicle: { ...vehicle, head: currentHead }, candidate },
    delivery: { resolveDischargeTargets: async () => ({ status: "resolved" as const, targets: [{
      planId: vehicle.planId, deliverableId: vehicle.deliverableId, workUnitId: vehicle.workUnitId,
      ref: null, providerId: "github", changeRequestId: String(handle.target.pullRequest), base, head: currentHead,
      position: 1, memberCount: 1, chunkKey: "member-1", title: "Member 1",
    }] }) },
    host: { readRequest: async () => ({ status: "observed" as const, request: {
      binding: { providerId: "github", changeRequestId: String(handle.target.pullRequest) },
      repository: handle.target.repository, headRepository: handle.target.repository, headRef: "topic/example",
      headSha: "e".repeat(40), baseRef: "main", state: "open" as const, draft: false,
    } }) } };
  if (mode === "discharge") {
    const reader = createHostedReservationDischargeReader({ ...checkout, workItem: primary.reference.owner,
      delivery: input.delivery, host: input.host, rawExec: input.rawExec });
    const requirement = handle.admission.requirement;
    const reservation = createStandardReviewReservation({ candidateId: candidate.attestation.candidateId,
      sourceId: handle.provider, sources: [handle.provider], repository: handle.target.repository,
      headSha: handle.target.headSha, obligation: { obligation: requirement.obligation, reasons: requirement.reasons,
        rubricVersion: requirement.rubricVersion, rubricDigest: requirement.rubricDigest,
        retrigger: requirement.retrigger, count: requirement.count } });
    const result = await reader({ reservation,
      baseRevision: handle.admission.reviewTarget.diffBaseSha,
      approvedHead: handle.target.headSha,
      changeRequest: { repository: handle.target.repository, pullRequest: handle.target.pullRequest },
      vehicle, candidate });
    const plan = result.responsePlan;
    if (plan === undefined) throw new Error(JSON.stringify(result));
    expect(parseReviewSourceReference(plan.source.attemptRef, "hosted", true)).toEqual({ kind: "hosted",
      operationId: lane.operationId, durableRef: terminal.attemptId, repositoryId, workItem: primary.reference.owner });
    return;
  }
  const composed = await createHostedApplicabilityContext(input);
  if (composed.readEarlierAttemptApplicability === undefined) throw new Error("Expected earlier applicability reader");
  const result = await composed.readEarlierAttemptApplicability(handle.provider);
  if (result.status !== "complete") throw new Error(JSON.stringify(result));
  const plan = result.attempts[0]?.responsePlan;
  if (plan === undefined) throw new Error(JSON.stringify(result));
  const source = parseReviewSourceReference(plan.source.attemptRef, "hosted", native);
  expect(source).toEqual({ kind: "hosted", operationId: lane.operationId, durableRef: terminal.attemptId,
    ...(native ? { repositoryId, workItem: primary.reference.owner } : {}) });
});
