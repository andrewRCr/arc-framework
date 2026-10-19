/** Approved evidence built from canonical producer-bound disposition constructors. */
import { createFrontlineFixture } from "./frontline-review.js";
import { BoundFrontlineResponseBindingSchema } from "../../src/scripts/review-gate/core/frontline-response-binding.js";
import { canonicalDigest } from "../../src/lib/kernel/index.js";
import { DeliveryReviewMemberVehicleSchema } from "../../src/lib/delivery/review-vehicle.js";
import { createReviewTarget } from "../../src/scripts/review-gate/core/gate-contract-v2.js";
import { HostedSettlementEvidenceSchema } from "../../src/scripts/review-gate/core/operation-state-schema.js";
import { createFixAuthorization, consumeFixAuthorization } from "../../src/scripts/review-gate/core/fix-authorization.js";
import { ReviewEvidenceBindingSchema, ReviewEvidenceSchema, type ReviewEvidence } from "../../src/lib/store/kinds/review/evidence/schema.js";
import { ReviewOutcomeSchema, type ReviewOutcome } from "../../src/lib/store/kinds/review/outcome/schema.js";
import { localOutcome, hostedOutcome, frontlineOutcome } from "./review-outcome.js";
import { outcomeEvidence } from "./review-outcome-evidence.js";
import { responsePolicyRequestFixture } from "./review-response-policy.js";

export function reviewEvidenceFixture(outcome: ReviewOutcome = ReviewOutcomeSchema.parse(localOutcome({
  outcome: "findings", findings: [{ findingId: "finding-1", severity: "major", locus: "src/main.ts:1",
    evidenceUrlOrId: "finding:1", sourceOrdinal: 1 }],
})), disposition: "fix" | "defer" | "reject" = "defer"): ReviewEvidence {
  const approved = outcomeEvidence(outcome, disposition);
  const findingActions = approved.dispositionSet.findings.map(({ findingId, disposition: action }) => ({
    findingId, disposition: action, channelAction: outcome.hosted?.sealedResult?.findings
      .find((finding) => finding.findingId === findingId)?.settlement === "reply-and-resolve"
      ? "reply-and-resolve" as const : "record-only" as const,
  }));
  const settlement = outcome.hosted === undefined ? undefined : { findingActions,
    evidence: findingActions.filter(({ channelAction }) => channelAction === "record-only").map((action) =>
      HostedSettlementEvidenceSchema.parse({ ...action, dispositionSetId: approved.dispositionSet.dispositionSetId,
        performedAt: approved.approval.approvedAt, carriedFromDispositionSetId: null })) };
  return { ...approved, schemaVersion: 1, binding: null, predecessorDispositionSetId: null,
    responsePolicyRequest: responsePolicyRequestFixture({ headSha: outcome.target.headSha, lane: outcome.lane,
      sourceId: outcome.source.sourceId, reviewOperationId: outcome.attemptId, completedPasses: outcome.logicalPass,
      repository: outcome.hosted?.target.repository ?? `local/${outcome.target.repositoryId}`,
      pullRequest: outcome.hosted?.target.pullRequest ?? null,
      ...(outcome.requirement === undefined ? {} : { standardReview: { obligation: outcome.requirement.obligation,
        reasons: outcome.requirement.reasons, rubricVersion: outcome.requirement.rubricVersion,
        rubricDigest: outcome.requirement.rubricDigest, retrigger: outcome.requirement.retrigger,
        count: outcome.requirement.count } }) }), ...(settlement === undefined ? { settlement: undefined } : { settlement }) };
}

export function performedEvidenceFixture(kind: "candidate" | "errand" | "delivery-member" = "candidate", producer?: ReviewOutcome) {
  const member = DeliveryReviewMemberVehicleSchema.parse({ kind: "delivery-member",
    planId: "123e4567-e89b-42d3-a456-426614174000", deliverableId: canonicalDigest({ deliverable: 1 }),
    workUnitId: "example", head: "c".repeat(40) });
  const finding = { findingId: "finding-1", severity: "major" as const, locus: "src/main.ts:1",
    evidenceUrlOrId: "finding:1", sourceOrdinal: 1 };
  const outcome = producer ?? ReviewOutcomeSchema.parse(kind === "delivery-member"
    ? hostedOutcome({ vehicle: member, outcome: "findings", findings: [{ findingId: "finding-1", severity: "major",
        sourceOrdinal: 1, origin: "review-body", reviewId: "review-1", fingerprint: "finding-1", settlement: "not-applicable",
        locus: finding.locus, url: "https://example.invalid/review", body: "A retained finding." }] })
    : localOutcome({ outcome: "findings", findings: [finding], ...(kind === "errand" ? {
        vehicle: { kind: "errand", identity: "example", claimId: "claim-1" },
        lineage: { kind: "head-bound", vehicleKind: "errand", vehicleIdentity: "claim-1", headSha: "c".repeat(40) },
      } : {}) }));
  const value = reviewEvidenceFixture(outcome, "fix");
  const { targetId: ignored, ...coordinates } = outcome.target;
  void ignored;
  const newTarget = createReviewTarget({ ...coordinates, headSha: "e".repeat(40), headTree: "f".repeat(40) });
  const authorization = createFixAuthorization({ dispositionState: { schemaVersion: 2, semanticsVersion: "review-gate/v2",
    state: "approved", dispositionSet: value.dispositionSet, approval: value.approval }, oldTarget: outcome.target });
  const fixConsumption = consumeFixAuthorization({ authorization, oldTarget: outcome.target, newTarget, appliedBy: "andrew",
    consumedAt: "2026-10-19T13:01:00Z", verificationRefs: ["test:passed"], priorConsumptions: [] });
  const performance: NonNullable<ReviewEvidence["performance"]> = { schemaVersion: 1, producerId: outcome.attemptId,
    dispositionSetId: value.dispositionSet.dispositionSetId, originatingHeadSha: outcome.target.headSha,
    producedHeadSha: newTarget.headSha, performedAt: "2026-10-19T13:02:00Z",
    ...(kind === "candidate" ? {} : { fixResponse: { oldTarget: outcome.target, newTarget, applicability: "full" as const,
      fixConsumption, hostedTarget: outcome.hosted?.target ?? null,
      ...(kind === "delivery-member" ? { hostedFixTarget: outcome.hosted === undefined ? null
        : { ...outcome.hosted.target, headSha: newTarget.headSha } } : {}) } }) };
  const binding = ReviewEvidenceBindingSchema.parse(kind === "errand"
    ? { kind, errand: { key: "example", claimId: "claim-1", branch: "fix/example" } }
    : kind === "delivery-member" ? { kind, deliveryMember: member }
    : { kind, candidate: { workUnit: "example", candidateId: outcome.lineage.kind === "candidate"
      ? outcome.lineage.candidateId : canonicalDigest({ candidate: 1 }) } });
  return { outcome, value: { ...value, binding, performance } };
}

export function privateMemberEvidenceFixture(disposition: "fix" | "defer" = "defer") {
  const candidate = { workUnit: "example", candidateId: canonicalDigest({ candidate: 1 }) };
  const member = { kind: "delivery-member", planId: "123e4567-e89b-42d3-a456-426614174000",
    deliverableId: canonicalDigest({ deliverable: 1 }), workUnitId: "example", head: "c".repeat(40) };
  const root = createFrontlineFixture().admission.target;
  const target = createReviewTarget({ schemaVersion: 2, semanticsVersion: "review-gate/v2", kind: "delivery-member",
    repositoryId: root.repositoryId, baseRef: root.baseRef, diffBaseSha: root.diffBaseSha, diffBaseTree: root.diffBaseTree,
    headSha: root.headSha, headTree: root.headTree });
  const responseBinding = BoundFrontlineResponseBindingSchema.parse({ candidate: { ...candidate, target: root },
    deliveryMember: member });
  const outcome = ReviewOutcomeSchema.parse(frontlineOutcome({ target, responseBinding, findings: [{
    findingId: "finding-1", severity: "major", locus: "src/main.ts:1", evidenceUrlOrId: "finding:1", sourceOrdinal: 1,
  }] }));
  const value = { ...reviewEvidenceFixture(outcome, disposition), binding: { kind: "candidate-member", candidate, deliveryMember: member } };
  return { outcome, value: ReviewEvidenceSchema.parse(value) };
}

export function hostedSettlementFixture() {
  const outcome = ReviewOutcomeSchema.parse(hostedOutcome({ outcome: "findings", findings: [1, 2].map((number) => ({
    findingId: `thread-${number}`, sourceOrdinal: number, severity: "major", origin: "review-thread",
    commentId: `comment-${number}`, threadId: `thread-${number}`, settlement: "reply-and-resolve",
    locus: `src/main.ts:${number}`, url: `https://example.invalid/thread-${number}`,
  })) }));
  const prior = reviewEvidenceFixture(outcome);
  const entry = HostedSettlementEvidenceSchema.parse({ findingId: "thread-1", disposition: "defer", channelAction: "reply-and-resolve",
    dispositionSetId: prior.dispositionSet.dispositionSetId, performedAt: "2026-10-19T13:01:00Z", carriedFromDispositionSetId: null,
    actorIdentity: "andrew", target: outcome.hosted!.target, fixTarget: null, commentId: "comment-1", threadId: "thread-1",
    replyDigest: canonicalDigest({ reply: 1 }), replyId: "reply-1" });
  if (entry.channelAction !== "reply-and-resolve") throw new Error("expected a replied settlement receipt");
  const next = ReviewEvidenceSchema.parse({ ...prior, settlement: { ...prior.settlement, evidence: [entry] } });
  return { outcome, prior, next, entry };
}
