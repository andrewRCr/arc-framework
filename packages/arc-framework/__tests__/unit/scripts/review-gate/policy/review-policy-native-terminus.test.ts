/** Native resolved termini preserve recorded provenance without becoming caller-authorized inputs. */
import { expect, it } from "vitest";
import { terminusDecision } from "../../../../fixtures/review-decision.js";
import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import { reviewDecisionKey } from "../../../../../src/lib/store/kinds/review/decision/key.js";
import { ReviewPolicyCommandRequestSchema, ReviewResolveEnvelopeSchema, resolveReviewPolicy }
  from "../../../../../src/scripts/review-gate/policy/review-policy-driver.js";

import { cleanHostedResult } from "../../../../fixtures/review-response-proof.js";
import { bindReviewPolicyEvidence, bindReviewPolicyContinuationEvidence, assertEvidenceBoundReviewExecutionAdmission,
  ReviewTerminalAttemptInputError, type EvidenceBoundReviewPolicyDependencies }
  from "../../../../../src/scripts/review-gate/policy/review-policy-evidence.js";
import { ReviewDriverAdmissionError } from "../../../../../src/scripts/review-gate/policy/review-execution-admission.js";

import { assertSchemaAccepts, assertSchemaRefuses } from "../../../../helpers/schema-assertion.js";
import { OwnerAcceptedReviewTerminusSchema } from "../../../../../src/scripts/review-gate/policy/review-terminus.js";

function terminalFixture() {
  const result = cleanHostedResult();
  if (result.kind !== "hosted") throw new Error("expected hosted fixture");
  const { obligation, reasons, rubricVersion, rubricDigest, retrigger, count } = result.requirement;
  const request = ReviewPolicyCommandRequestSchema.parse({ schemaVersion: 1, target: result.hostedTarget,
    lane: "standard", standardReview: { obligation, reasons, rubricVersion, rubricDigest, retrigger, count },
    completedPasses: result.admission.logicalPass,
    attempts: [{ sourceId: result.sourceIdentity, outcome: result.originalOutcome, reviewOperationId: result.producerId }] });
  const dependencies: EvidenceBoundReviewPolicyDependencies = {
    sources: [result.sourceIdentity], maxPasses: 4, stateOffBranch: true,
    nextPassContext: { completePasses: 1, convergence: "converged", responseDue: false, incremental: null },
    resultReader: { readResult: async () => result }, dispositionStore: { readDispositionRecord: async () => null },
    confirmTarget: async () => result.target,
  };
  return { request, dependencies };
}

function fixture(acceptedBy: string | null) {
  const decision = { ...terminusDecision(), decidedBy: acceptedBy };
  const request = ReviewPolicyCommandRequestSchema.parse({ schemaVersion: 1,
    target: { repository: "owner/repo", pullRequest: 42, headSha: "a".repeat(40) }, lane: "standard",
    completedPasses: 2, attempts: [], standardReview: { obligation: "required", reasons: ["sensitive-change-set"],
      rubricVersion: "standard-review/v1", rubricDigest: canonicalDigest({ rubric: 1 }), retrigger: "full-final", count: 1 } });
  return { request, native: { schemaVersion: 2, semanticsVersion: "review-terminus/v2", kind: "owner-accepted",
    lane: "standard", decisionKey: reviewDecisionKey(decision), acceptedBy, completedPasses: decision.basis!.passCount } };
}

it.each([null, "recorded-owner"])("preserves a native terminus with recorded author %s through policy resolution", acceptedBy => {
  const { request, native } = fixture(acceptedBy);
  const result = resolveReviewPolicy({ ...request, terminus: native, sources: ["delegated-agent"], maxPasses: 4,
    stateOffBranch: true, nextPassContext: { completePasses: 0, convergence: "none", responseDue: false, incremental: null } });
  expect(result).toMatchObject({ state: "owner-accepted", payload: { terminus: native, completedPasses: 2 } });
  expect(ReviewResolveEnvelopeSchema.parse(result)).toEqual(result);
});

it.each(["evidence", "continuation"])("preserves native authority through %s binding", async mode => {
  const { native } = fixture(null);
  const { request, dependencies } = terminalFixture();
  const input = { ...request, terminus: native };
  const bound = mode === "evidence" ? await bindReviewPolicyEvidence(input, dependencies)
    : await bindReviewPolicyContinuationEvidence(input, { terminalResponsePerformed: false }, dependencies);
  expect(bound.terminus).toEqual(native);
  expect(resolveReviewPolicy(bound).state).toBe("pass-complete");
});

it("returns a command-shaped progress correction and accepts the repaired bound retry", async () => {
  const { native } = fixture(null);
  const { request, dependencies } = terminalFixture();
  const error = await bindReviewPolicyEvidence({ ...request, completedPasses: 2, terminus: native }, dependencies)
    .catch((error: unknown) => error);
  expect(error).toBeInstanceOf(ReviewTerminalAttemptInputError);
  if (!(error instanceof ReviewTerminalAttemptInputError)) throw error;
  expect(error.correctedRequest).not.toHaveProperty("terminus");
  expect(ReviewPolicyCommandRequestSchema.parse(error.correctedRequest)).toEqual(error.correctedRequest);
  const repaired = await bindReviewPolicyEvidence({ ...error.correctedRequest, terminus: native }, dependencies);
  expect(repaired.terminus).toEqual(native);
  expect(resolveReviewPolicy(repaired).state).toBe("pass-complete");
});

it("keeps native authority out of a refused execution's command remedy", async () => {
  const { native } = fixture(null);
  const { request, dependencies } = terminalFixture();
  const error = await assertEvidenceBoundReviewExecutionAdmission({ ...request, terminus: native },
    { terminalResponsePerformed: false }, { sourceId: "codex-pr", nextAction: "hosted-request" }, dependencies)
    .catch((error: unknown) => error);
  expect(error).toBeInstanceOf(ReviewDriverAdmissionError);
  if (!(error instanceof ReviewDriverAdmissionError)) throw error;
  expect(error.state).toBe("pass-complete");
  expect(error.request).not.toHaveProperty("terminus");
  expect(ReviewPolicyCommandRequestSchema.parse(error.request)).toEqual(error.request);
});

it("refuses native projections as public command inputs", () => {
  const { request, native } = fixture("recorded-owner");
  assertSchemaRefuses(ReviewPolicyCommandRequestSchema, { ...request, terminus: native }, ["terminus"]);
});

it("requires trusted native context during internal evaluation and accepts a repaired retry", () => {
  const { request, native } = fixture(null);
  const input = { ...request, terminus: native, sources: ["delegated-agent"], maxPasses: 4,
    nextPassContext: { completePasses: 0, convergence: "none", responseDue: false, incremental: null } };
  expect(() => resolveReviewPolicy(input)).toThrow(/native terminus requires trusted/i);
  expect(resolveReviewPolicy({ ...input, stateOffBranch: true })).toMatchObject({ state: "owner-accepted" });
});

it.each(["evidence", "continuation"])("requires trusted native context before %s reads and accepts the repaired retry", async mode => {
  const { native } = fixture(null);
  const { request, dependencies } = terminalFixture();
  const repository = { ...dependencies, stateOffBranch: undefined };
  const bind = (context: EvidenceBoundReviewPolicyDependencies) => mode === "evidence"
    ? bindReviewPolicyEvidence({ ...request, terminus: native }, context)
    : bindReviewPolicyContinuationEvidence({ ...request, terminus: native }, { terminalResponsePerformed: false }, context);
  await expect(bind(repository)).rejects.toThrow(/native terminus requires trusted/i);
  expect((await bind(dependencies)).terminus).toEqual(native);
});

it("retains exact version-one command, record, and result shapes", () => {
  const { request } = fixture("recorded-owner");
  const terminus = { schemaVersion: 1, semanticsVersion: "review-terminus/v1", kind: "owner-accepted",
    lane: "standard", acceptedBy: "recorded-owner", completedPasses: 2 };
  expect(assertSchemaAccepts(OwnerAcceptedReviewTerminusSchema, terminus)).toEqual(terminus);
  expect(assertSchemaAccepts(ReviewPolicyCommandRequestSchema, { ...request, terminus })).toEqual({ ...request, terminus });
  const result = resolveReviewPolicy({ ...request, terminus, sources: ["delegated-agent"], maxPasses: 4,
    nextPassContext: { completePasses: 0, convergence: "none", responseDue: false, incremental: null } });
  expect(result).toMatchObject({ state: "owner-accepted", payload: { terminus } });
  if (result.state !== "owner-accepted") throw new Error("expected accepted terminus");
  expect(result.payload.terminus).toEqual(terminus);
  assertSchemaRefuses(OwnerAcceptedReviewTerminusSchema, { ...terminus, acceptedBy: null });
});
