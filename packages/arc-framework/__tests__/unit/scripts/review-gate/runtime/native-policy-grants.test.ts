/** Native stored grants leave incremental passes free while explicit contradictory inputs retain policy refusal. */
import { expect, it } from "vitest";
import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import { ReviewPolicyCommandRequestSchema, resolveReviewPolicy } from "../../../../../src/scripts/review-gate/policy/review-policy-driver.js";
import { projectNativePolicyGrants } from "../../../../../src/scripts/review-gate/runtime/native-policy-grants.js";
import { errandPolicyGrants } from "../../../../../src/scripts/review-gate/runtime/native-errand-grants.js";

const target = { repository: "owner/repo", pullRequest: 42, headSha: "a".repeat(40) };
const request = ReviewPolicyCommandRequestSchema.parse({ schemaVersion: 1, target, lane: "standard", completedPasses: 5,
  attempts: [], standardReview: { obligation: "required", reasons: ["sensitive-change-set"], rubricVersion: "standard-review/v1",
    rubricDigest: canonicalDigest({ rubric: 1 }), retrigger: "full-final", count: 1 } });
const ceiling = { exhaustedPassCount: 5, nextPass: 6, decisionKey: canonicalDigest({ decision: "ceiling" }) };
const full = { ...ceiling, target, lane: "standard" as const };
const context = { sources: ["delegated-agent"], maxPasses: 2, stateOffBranch: true,
  nextPassContext: { completePasses: 2, convergence: "unconverged", responseDue: false,
    incremental: { basis: "fix-check", scope: { schemaVersion: 1, predecessorProducerId: "local/material-five",
      predecessorHeadSha: "b".repeat(40), basisHeadSha: "b".repeat(40), headSha: target.headSha,
      requiredFindings: [{ producerId: "local/material-five", findingId: "material-one", locus: "src/example.ts:7" }] } } } };

it.each(["generic", "errand"] as const)("keeps an automatic %s ceiling grant out of incremental admission", caller => {
  const projected = caller === "generic" ? projectNativePolicyGrants(request, { judgment: { ceilingOverride: ceiling } }, true)
    : { ...request, ...errandPolicyGrants({ ceilingOverride: full, automaticGrants: { ceiling: true, additional: true } }, true) };
  expect(resolveReviewPolicy({ ...projected, ...context, chosenCoverage: "incremental" }))
    .toMatchObject({ state: "ready", payload: { pass: 6, ceilingOverrideApplied: false } });
  const complete = caller === "generic" ? projectNativePolicyGrants(request, { judgment: { ceilingOverride: ceiling } }, false)
    : { ...request, ...errandPolicyGrants({ ceilingOverride: full, automaticGrants: { ceiling: true, additional: true } }, false) };
  expect(resolveReviewPolicy({ ...complete, ...context, chosenCoverage: "complete" }))
    .toMatchObject({ state: "ready", payload: { pass: 6, ceilingOverrideApplied: true } });
});

it.each(["generic", "errand"] as const)("preserves explicit %s grant refusal beside incremental coverage", caller => {
  const explicit = { ...request, ceilingOverride: full };
  const projected = caller === "generic" ? projectNativePolicyGrants(explicit, { judgment: { ceilingOverride: ceiling } }, true)
    : { ...request, ...errandPolicyGrants({ ceilingOverride: full, automaticGrants: { ceiling: false, additional: false } }, true) };
  expect(resolveReviewPolicy({ ...projected, ...context, chosenCoverage: "incremental" }))
    .toMatchObject({ state: "invalid-override", payload: { reason: "incremental-coverage" } });
});
