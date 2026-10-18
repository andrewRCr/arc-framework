/** Complete-pass ceilings retain logical attempt bindings across fix checks. */
import { describe, expect, it } from "vitest";
import { resolveReviewPolicy } from "../../../../../src/scripts/review-gate/policy/review-policy-driver.js";
import { CanonicalDigestSchema } from "../../../../../src/lib/kernel/index.js";

const target = { repository: "arc/example", pullRequest: 42, headSha: "a".repeat(40) };
const base = {
  schemaVersion: 1, target, lane: "standard", sources: ["delegated-agent"],
  standardReview: { obligation: "required", reasons: ["sensitive-change-set"],
    rubricVersion: "standard-review/v1", rubricDigest: CanonicalDigestSchema.parse(`sha256:${"b".repeat(64)}`),
    retrigger: "full-final", count: 1 },
  completedPasses: 5, maxPasses: 3, attempts: [],
  nextPassContext: { completePasses: 2, convergence: "none", responseDue: false, incremental: null },
};

describe("complete-pass ceiling", () => {
  it("admits attempt six after two complete looks and three fix checks below the ceiling", () => {
    expect(resolveReviewPolicy(base)).toMatchObject({ state: "ready", payload: { pass: 6, ceilingOverrideApplied: false } });
    expect(resolveReviewPolicy({ ...base, maxPasses: 2 })).toMatchObject({ state: "approval-required",
      payload: { consequence: { exhaustedPassCount: 5, nextPass: 6 } } });
  });

  it("binds an override by logical attempt while comparing its complete count", () => {
    const ceilingOverride = { target, lane: "standard", exhaustedPassCount: 5, nextPass: 6 };
    expect(resolveReviewPolicy({ ...base, ceilingOverride })).toMatchObject({ state: "invalid-override",
      payload: { reason: "ceiling-not-exhausted" } });
    expect(resolveReviewPolicy({ ...base, maxPasses: 2, ceilingOverride })).toMatchObject({ state: "ready",
      payload: { pass: 6, ceilingOverrideApplied: true } });
    expect(resolveReviewPolicy({ ...base, maxPasses: 2,
      ceilingOverride: { ...ceilingOverride, exhaustedPassCount: 2, nextPass: 3 } })).toMatchObject({
      state: "invalid-override", payload: { reason: "pass-count-mismatch" } });
  });
  it("does not subtract an adequate fix-check terminal from the override's complete base", () => {
    expect(resolveReviewPolicy({ ...base, maxPasses: 2,
      standardReview: { ...base.standardReview, retrigger: "incremental" },
      terminalResponseSettled: true,
      attempts: [{ sourceId: "delegated-agent", outcome: "findings", reviewOperationId: "local/fix-check" }],
      nextPassContext: { ...base.nextPassContext, convergence: "unconverged" },
      verifiedTerminalSignal: { reviewOperationId: "local/fix-check", confirmedFindingCount: 1,
        maxConfirmedSeverity: "major", materialFix: true, effectiveCoverage: "incremental", coverageAdequate: true },
      ceilingOverride: { target, lane: "standard", exhaustedPassCount: 4, nextPass: 5 },
    })).toMatchObject({ state: "ready", payload: { pass: 6, ceilingOverrideApplied: true } });
  });

});
