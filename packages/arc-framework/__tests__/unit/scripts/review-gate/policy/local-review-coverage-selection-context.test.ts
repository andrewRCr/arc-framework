/** Local coverage choices consume the shared next-look facts. */
import { describe, expect, it } from "vitest";
import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import { createReviewTarget } from "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import { resolveLocalReviewCoverageSelection } from "../../../../../src/scripts/review-gate/policy/local-review-coverage-selection.js";
import { resolveReviewPolicy } from "../../../../../src/scripts/review-gate/policy/review-policy-driver.js";

const target = createReviewTarget({ schemaVersion: 2, semanticsVersion: "review-gate/v2", kind: "change-set",
  repositoryId: "repo-1", baseRef: "main", diffBaseSha: "a".repeat(40), diffBaseTree: "b".repeat(40),
  headSha: "c".repeat(40), headTree: "d".repeat(40) });
const standardReview = { obligation: "required" as const, reasons: ["sensitive-change-set"] as const,
  rubricVersion: "standard-review/v1", rubricDigest: canonicalDigest({ rubric: "standard" }), retrigger: "full-final" as const, count: 1 as const };
const lineage = { kind: "head-bound" as const, vehicleKind: "errand", vehicleIdentity: "claim", headSha: target.headSha };
function input(convergence: "converged" | "unconverged") {
  const nextPassContext = { convergence, responseDue: false, incremental: null };
  return { target, sourceId: "delegated-agent", lineage, standardReview, nextPassContext,
    predecessorOperationId: "earlier-material-producer",
    policy: resolveReviewPolicy({ schemaVersion: 1, target: { repository: "owner/repo", pullRequest: null, headSha: target.headSha },
      lane: "standard", standardReview, sources: ["delegated-agent"], maxPasses: 4, completedPasses: 2, attempts: [], nextPassContext }) };
}

describe("shared local coverage context", () => {
  it("admits complete after a converged fix check despite an earlier-head predecessor hint", () => {
    expect(resolveLocalReviewCoverageSelection(input("converged")))
      .toEqual({ state: "ready", coverageSelected: false });
  });
  it("offers the proven fix check under full-final beside a complete pass", () => {
    const base = input("unconverged");
    const scope = { schemaVersion: 1 as const, predecessorProducerId: "earlier-material-producer",
      predecessorHeadSha: "e".repeat(40), basisHeadSha: "e".repeat(40), headSha: target.headSha,
      requiredFindings: [{ producerId: "earlier-material-producer", findingId: "finding-1", locus: "src/example.ts:1" }] };
    expect(resolveLocalReviewCoverageSelection({ ...base, nextPassContext: { ...base.nextPassContext,
      incremental: { basis: "fix-check" as const, scope } } })).toMatchObject({
      state: "coverage-required", action: { choices: [{ requestedCoverage: "incremental", correctionScope: scope },
        { requestedCoverage: "complete" }] },
    });
  });
  it("keeps the complete-only choice when a material fix has no proven chain", () => {
    expect(resolveLocalReviewCoverageSelection(input("unconverged")))
      .toMatchObject({ state: "coverage-required", action: { choices: [{ requestedCoverage: "complete" }] } });
  });
});
