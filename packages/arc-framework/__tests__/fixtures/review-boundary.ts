/** Published boundary shapes derived from canonical action and reservation producers. */
import { canonicalDigest } from "../../src/lib/kernel/index.js";
import { IntegrationBoundaryLocusSchema, createStandardReviewReservation, createRunConvergenceVerificationAction,
  projectCandidateReviewBoundary, type IntegrationBoundaryLocus } from
  "../../src/scripts/review-gate/policy/integration-boundary-locus.js";

export const boundaryLoci = ["candidate-review-pending", "candidate-fix-pending", "candidate-convergence-verification-pending",
  "candidate-publish-ready", "publication-pending", "hosted-review-pending", "delivery-status-required"] as const;
export const boundaryContinuation = { reviewedHead: "a".repeat(40), nextAction: { kind: "continue-pre-publication-review" as const,
  command: "arc review pre-publication example --resume opaque-token", interactionText: "Resume pre-publication review." },
  projectionDisposition: "keep-staged-until-publication" as const };

export function boundaryV1Fixture(locus: typeof boundaryLoci[number] = "candidate-review-pending"): IntegrationBoundaryLocus {
  const root = projectCandidateReviewBoundary({ workUnit: "example", candidateId: canonicalDigest({ candidate: 1 }),
    candidateSubjectDigest: canonicalDigest({ subject: 1 }) });
  if (locus === "candidate-review-pending") return root;
  const reservation = createStandardReviewReservation({ candidateId: root.candidateId, sourceId: "codex-pr",
    ...(locus === "delivery-status-required" ? { target: { kind: "delivery" as const, repository: "owner/repo", workUnitId: "example",
      planId: "11111111-1111-4111-8111-111111111111" } } : { repository: "owner/repo", headSha: "a".repeat(40) }),
    obligation: { obligation: "required", reasons: ["sensitive-change-set"], rubricVersion: "standard-review/v1",
      rubricDigest: canonicalDigest({ rubric: 1 }), retrigger: "full-final", count: 1 } });
  const nextAction = locus === "candidate-convergence-verification-pending"
    ? createRunConvergenceVerificationAction("example", "full", boundaryContinuation)
    : locus === "candidate-publish-ready" ? { kind: "publish-candidate", command: "arc publish example", interactionText: "Publish." }
    : locus === "publication-pending" ? { kind: "continue-publication", command: "git push origin feat/example", interactionText: "Continue publication." }
    : locus === "delivery-status-required" ? { kind: "resolve-delivery-status", workUnitId: "example",
        command: "arc review status --work-unit example", interactionText: "Resolve delivery status." }
    : boundaryContinuation.nextAction;
  return IntegrationBoundaryLocusSchema.parse({ ...root, locus, nextAction,
    reservation: locus === "candidate-fix-pending" ? null : reservation });
}

export function boundaryV2Fixture(locus: typeof boundaryLoci[number] = "candidate-review-pending"): Record<string, unknown> {
  const original = boundaryV1Fixture(locus);
  const { policy: ignoredPolicy, standardLaneOwnerVersion: ignoredVersion, ...fields } = Object.fromEntries(Object.entries(original));
  void ignoredPolicy; void ignoredVersion;
  const nextAction = original.nextAction.kind === "run-convergence-verification" ? (() => {
    const { projectionDisposition: ignored, ...postAttestContinuation } = original.nextAction.postAttestContinuation;
    void ignored;
    return { ...original.nextAction, verificationKind: "merge", postAttestContinuation };
  })() : original.nextAction;
  return { ...fields, schemaVersion: 2, nextAction,
    ...(locus === "candidate-publish-ready" || locus === "publication-pending" ? { readinessBinding: null } : {}) };
}
