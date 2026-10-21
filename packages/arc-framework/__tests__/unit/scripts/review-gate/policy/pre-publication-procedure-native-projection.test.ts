/** Native prepublication output derives routing while keeping stored authority portable. */
import { expect, it } from "vitest";
import { createReviewTarget } from "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import { boundaryContinuation } from "../../../../fixtures/review-boundary.js";
import { PrePublicationReviewRequestSchema, prePublicationBoundary, projectPrePublicationReview } from
  "../../../../../src/scripts/review-gate/policy/pre-publication-procedure.js";

import { terminusDecision } from "../../../../fixtures/review-decision.js";
import { reviewDecisionKey } from "../../../../../src/lib/store/kinds/review/decision/key.js";

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

it("relays a native frontline ceiling decision in both resolve forms", () => {
  const decisionKey = canonicalDigest({ ceiling: true });
  const exact = createReviewTarget({ schemaVersion: 2, semanticsVersion: "review-gate/v2", kind: "change-set",
    repositoryId: "repo-1", baseRef: "main", diffBaseSha: "b".repeat(40), diffBaseTree: "c".repeat(40),
    headSha: target.headSha, headTree: "d".repeat(40) });
  const envelope = projectPrePublicationReview({ ...request, target: exact, frontline: { ...request.frontline,
    invocation: undefined, completedPasses: 2, ceilingOverride: {
      target, lane: "frontline", exhaustedPassCount: 2, nextPass: 3, decisionKey } } }, boundaryContinuation, authority);
  expect(envelope.nextAction).toMatchObject({ command: "arc review frontline resolve -",
    request: { policyJudgment: { ceilingOverride: { decisionKey } } },
    authorizationRequest: { policyJudgment: { ceilingOverride: { decisionKey } } } });
});

it.each([null, "recorded-owner"])("stores only the resolved native terminus key for author %s", acceptedBy => {
  const decision = { ...terminusDecision(), decidedBy: acceptedBy };
  const decisionKey = reviewDecisionKey(decision);
  const native = { schemaVersion: 2, semanticsVersion: "review-terminus/v2", kind: "owner-accepted",
    lane: "standard", decisionKey, acceptedBy, completedPasses: decision.basis!.passCount };
  const envelope = projectPrePublicationReview({ ...request, standard: { ...request.standard,
    completedPasses: 2, stateOffBranch: true, terminus: native } }, boundaryContinuation, { ...authority, terminus: decisionKey });
  expect(envelope).toMatchObject({ schemaVersion: 2, locus: "candidate-publish-ready", terminus: decisionKey });
  expect(prePublicationBoundary(envelope)).toHaveProperty("terminus", decisionKey);
});

it.each(["missing", "different"])("refuses a %s native boundary key before self-review, then resumes with the matching key", kind => {
  const decision = terminusDecision();
  const decisionKey = reviewDecisionKey(decision);
  const input = { ...request, selfReview: "pending", standard: { ...request.standard, completedPasses: 2,
    stateOffBranch: true, terminus: { schemaVersion: 2, semanticsVersion: "review-terminus/v2", kind: "owner-accepted",
      lane: "standard", decisionKey, acceptedBy: decision.decidedBy, completedPasses: decision.basis!.passCount } } };
  expect(() => projectPrePublicationReview(input, boundaryContinuation,
    kind === "missing" ? undefined : authority)).toThrow(/native terminus.*boundary/i);
  const repaired = projectPrePublicationReview(input, boundaryContinuation, { ...authority, terminus: decisionKey });
  expect(repaired).toMatchObject({ schemaVersion: 2, nextAction: { kind: "run-self-review" }, terminus: decisionKey });
});
