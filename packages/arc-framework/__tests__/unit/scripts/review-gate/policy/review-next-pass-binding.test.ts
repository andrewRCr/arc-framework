/** Internal next-look facts survive policy binding without entering stored command requests. */
import { describe, expect, it } from "vitest";
import { cleanHostedResult, findingsHostedResult, approvedRecord, performedFix } from "../../../../fixtures/review-response-proof.js";
import { assertSchemaAccepts, assertSchemaRefuses } from "../../../../helpers/schema-assertion.js";
import { ReviewPolicyCommandRequestSchema, ReviewPolicyRequestSchema, resolveReviewPolicy } from "../../../../../src/scripts/review-gate/policy/review-policy-driver.js";
import { bindReviewPolicyEvidence, bindReviewPolicyContinuationEvidence } from "../../../../../src/scripts/review-gate/policy/review-policy-evidence.js";
import { responsePolicyRequestFixture } from "../../../../fixtures/review-response-policy.js";

function fixture(findings = false) {
  const result = findings ? findingsHostedResult(["major"]) : cleanHostedResult();
  const record = findings ? approvedRecord(result, [{ sourceVerification: "verified", verifiedSeverity: "major", disposition: "fix" }]) : null;
  const request = responsePolicyRequestFixture({ repository: "arc-framework/example", pullRequest: 42,
    headSha: result.target.headSha, sourceId: "codex-pr", reviewOperationId: result.producerId,
    standardReview: { obligation: "required", reasons: ["sensitive-change-set"], rubricVersion: "standard-review/v1",
      rubricDigest: result.kind === "frontline" ? "sha256:unused" : result.requirement.rubricDigest, retrigger: "full-final", count: 1 } });
  const nextPassContext = { convergence: findings ? "unconverged" as const : "converged" as const, responseDue: false, incremental: null };
  return { result, request: { ...request, attempts: [{ sourceId: "codex-pr", outcome: findings ? "findings" as const : "clean" as const, reviewOperationId: result.producerId }] },
    dependencies: { sources: ["codex-pr"], maxPasses: 3, nextPassContext,
      resultReader: { readResult: async () => result },
      dispositionStore: { readDispositionRecord: async () => record,
        appendDispositionRecord: async () => { throw new Error("read-only binding"); } },
      confirmTarget: async () => result.target,
      readResponsePerformance: async () => record === null ? null : performedFix(result, record),
    } };
}

describe("next-pass evidence binding", () => {
  it("refuses a standard internal request without repository-derived next-pass facts", () => {
    const { request, dependencies } = fixture();
    const internal = { ...request, attempts: [], completedPasses: 0, sources: dependencies.sources,
      maxPasses: dependencies.maxPasses };
    assertSchemaRefuses(ReviewPolicyRequestSchema, internal, ["nextPassContext"]);
    assertSchemaAccepts(ReviewPolicyRequestSchema, { ...internal, nextPassContext: dependencies.nextPassContext });
  });

  it("carries context on both binding paths", async () => {
    const { request, dependencies } = fixture();
    expect(await bindReviewPolicyEvidence(request, dependencies)).toMatchObject({ nextPassContext: dependencies.nextPassContext });
    expect(await bindReviewPolicyEvidence({ ...request, attempts: [], completedPasses: 0 }, dependencies))
      .toMatchObject({ nextPassContext: dependencies.nextPassContext });
  });

  it("preserves context when a performed response starts a fresh successor", async () => {
    const { request, dependencies } = fixture(true);
    const bound = await bindReviewPolicyContinuationEvidence(request, { terminalResponsePerformed: true }, dependencies);
    expect(bound).toMatchObject({ nextPassContext: dependencies.nextPassContext, attempts: [] });
    expect(resolveReviewPolicy(bound)).toMatchObject({ state: "ready", payload: { pass: 2 } });
  });

  it("preserves context on an additional-pass successor", async () => {
    const { request, dependencies } = fixture();
    const bound = await bindReviewPolicyContinuationEvidence({ ...request,
      additionalPassAuthorization: { target: request.target, lane: "standard",
        precedingProducerId: request.attempts[0]!.reviewOperationId, completedPasses: 1, nextPass: 2 },
    }, { terminalResponsePerformed: false }, dependencies);
    expect(bound).toMatchObject({ nextPassContext: dependencies.nextPassContext });
    expect(resolveReviewPolicy(bound)).toMatchObject({ state: "ready", payload: { pass: 2 } });
  });

  it("refuses internal context on frontline and command requests", () => {
    const { request, dependencies } = fixture();
    const opening = { ...request, target: { ...request.target, pullRequest: null }, attempts: [], completedPasses: 0 };
    const internal = { ...opening, sources: ["coderabbit-cli"], maxPasses: 2, lane: "frontline" };
    assertSchemaAccepts(ReviewPolicyRequestSchema, internal);
    assertSchemaRefuses(ReviewPolicyRequestSchema, { ...internal, nextPassContext: dependencies.nextPassContext }, ["nextPassContext"]);
    assertSchemaRefuses(ReviewPolicyCommandRequestSchema, { ...opening, nextPassContext: dependencies.nextPassContext });
  });
});
