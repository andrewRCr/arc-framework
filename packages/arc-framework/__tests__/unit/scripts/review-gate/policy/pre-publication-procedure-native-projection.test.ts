/** Native prepublication output derives routing while keeping stored authority portable. */
import { expect, it } from "vitest";
import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import { boundaryContinuation } from "../../../../fixtures/review-boundary.js";
import { PrePublicationReviewRequestSchema, prePublicationBoundary, projectPrePublicationReview } from
  "../../../../../src/scripts/review-gate/policy/pre-publication-procedure.js";

const target = { repository: "owner/repo", pullRequest: null, headSha: "a".repeat(40) };
const standardReview = { obligation: "required", reasons: ["sensitive-change-set"], rubricVersion: "standard-review/v1",
  rubricDigest: canonicalDigest({ rubric: 1 }), retrigger: "full-final", count: 1 };
const policy = { schemaVersion: 1, target, standardReview, completedPasses: 0, maxPasses: 2, attempts: [] };
const request = PrePublicationReviewRequestSchema.parse({ schemaVersion: 1, workUnit: "example",
  candidateId: canonicalDigest({ candidate: 1 }), reservationTarget: { kind: "pinned-head", repository: target.repository, headSha: target.headSha },
  selfReview: "settled", target: null,
  routingFacts: { schemaVersion: 1, changeSetState: "known", contentKind: "code-bearing", reviewRisk: "routine",
    changeDeterminacy: "atomic", ownership: "self", surfaceAuthority: "ordinary",
    assurance: { workContext: "work-unit", workClass: "Light" }, activity: { selfReview: true, frontlineReview: true } },
  frontline: { ...policy, lane: "frontline", frontlineActive: true, sources: ["coderabbit-cli"], invocation: { mode: "skip" } },
  standard: { ...policy, lane: "standard", sources: ["codex-pr"],
    nextPassContext: { completePasses: 0, convergence: "none", responseDue: false, incremental: null } },
  pendingResponse: { frontline: null, standard: null }, candidate: { subjectDigest: canonicalDigest({ subject: 1 }),
    implementationChanged: false, convergenceVerification: "satisfied", convergenceScope: null } });
const authority = { terminus: null, readinessBinding: canonicalDigest({ readiness: 1 }) };

it("projects native self review without transient policy in the stored boundary", () => {
  const envelope = projectPrePublicationReview({ ...request, selfReview: "pending" }, boundaryContinuation, authority);
  expect(envelope).toMatchObject({ schemaVersion: 2, nextAction: { kind: "run-self-review" }, policy: null });
  expect(prePublicationBoundary(envelope)).not.toHaveProperty("policy");
});

it("keeps policy on the native review resume envelope and removes it for storage", () => {
  const envelope = projectPrePublicationReview({ ...request, standard: { ...request.standard, sources: ["delegated-agent"] } },
    boundaryContinuation, authority);
  expect(envelope).toMatchObject({ schemaVersion: 2, locus: "candidate-review-pending", policy: { state: "ready" },
    nextAction: { kind: "continue-pre-publication-review" } });
  expect(prePublicationBoundary(envelope)).not.toHaveProperty("policy");
});

it("projects native readiness with the supplied binding", () => {
  const envelope = projectPrePublicationReview(request, boundaryContinuation, authority);
  expect(envelope).toMatchObject({ schemaVersion: 2, locus: "candidate-publish-ready", readinessBinding: authority.readinessBinding });
  expect(prePublicationBoundary(envelope)).toHaveProperty("readinessBinding", authority.readinessBinding);
});

it("refuses to project native readiness without a binding", () => {
  expect(() => projectPrePublicationReview(request, boundaryContinuation, { ...authority, readinessBinding: null })).toThrow();
});

it.each(["focused", "full"] as const)("projects native %s convergence without projection bookkeeping", (convergenceScope) => {
  const envelope = projectPrePublicationReview({ ...request,
    candidate: { ...request.candidate, convergenceVerification: "pending", convergenceScope } }, boundaryContinuation, authority);
  expect(envelope).toMatchObject({ schemaVersion: 2, locus: "candidate-convergence-verification-pending", policy: null,
    nextAction: { kind: "run-convergence-verification", requiredScope: convergenceScope,
      verificationKind: convergenceScope === "focused" ? "focused" : "merge" } });
  expect(envelope.nextAction).toHaveProperty("postAttestContinuation", {
    reviewedHead: boundaryContinuation.reviewedHead, nextAction: boundaryContinuation.nextAction });
  expect(prePublicationBoundary(envelope)).not.toHaveProperty("policy");
});

it.each([false, true])("keeps native findings resumable with response pending %s", (responsePending) => {
  const envelope = projectPrePublicationReview({ ...request, standard: { ...request.standard, sources: ["delegated-agent"],
    completedPasses: 1, attempts: [{ sourceId: "delegated-agent", outcome: "findings", reviewOperationId: "local/findings" }],
    verifiedTerminalSignal: { reviewOperationId: "local/findings", confirmedFindingCount: 1, maxConfirmedSeverity: "major",
      materialFix: true, effectiveCoverage: "complete", coverageAdequate: true } },
    pendingResponse: { frontline: null, standard: responsePending ? { kind: "attested-local", receiptRef: "review-source" } : null } },
  boundaryContinuation, authority);
  expect(envelope).toMatchObject({ schemaVersion: 2, locus: "candidate-fix-pending", policy: { state: "findings" } });
  if (responsePending) expect(envelope.nextAction).toMatchObject({ command: "arc review respond -", responseOperationId: "local/findings",
    responseSource: { kind: "attested-local", receiptRef: "review-source" } });
  expect(prePublicationBoundary(envelope)).not.toHaveProperty("policy");
});
