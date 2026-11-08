import { nextPassConsiderations } from "../../../../../src/scripts/review-gate/policy/next-pass-offer-text.js";
/** Local coverage choices consume the shared next-look facts. */
import { nextPassFactsFixture } from "../../../../fixtures/next-pass-facts.js";
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
const fullFinalConsiderations = (facts: Parameters<typeof nextPassConsiderations>[0]) =>
  nextPassConsiderations(facts, "full-final");
function input(convergence: "converged" | "unconverged") {
  const nextPassContext = { completePasses: 1, convergence, responseDue: false, incremental: null };
  const facts = nextPassFactsFixture(); facts.chainProven = false; facts.rangeSize.fix = null;
  return { target, sourceId: "delegated-agent", lineage, standardReview, nextPassContext, facts,
    predecessorOperationId: "earlier-material-producer",
    policy: resolveReviewPolicy({ schemaVersion: 1, target: { repository: "owner/repo", pullRequest: null, headSha: target.headSha },
      lane: "standard", standardReview, sources: ["delegated-agent"], maxPasses: 4, completedPasses: 2, attempts: [], nextPassContext }) };
}

describe("shared local coverage context", () => {
  it("admits complete after a converged fix check despite an earlier-head predecessor hint", () => {
    expect(resolveLocalReviewCoverageSelection(input("converged")))
      .toEqual({ state: "ready", coverageSelected: false, coverageAdmission: { requestedCoverage: "complete" } });
  });
  it("offers the proven fix check under full-final beside a complete pass", () => {
    const base = input("unconverged");
    const scope = { schemaVersion: 1 as const, predecessorProducerId: "earlier-material-producer",
      predecessorHeadSha: "e".repeat(40), basisHeadSha: "e".repeat(40), headSha: target.headSha,
      requiredFindings: [{ producerId: "earlier-material-producer", findingId: "finding-1", locus: "src/example.ts:1" }] };
    expect(resolveLocalReviewCoverageSelection({ ...base, facts: nextPassFactsFixture(), nextPassContext: { ...base.nextPassContext,
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

it.each([false, true])("admits a delta check by default and honors explicit complete=%s", explicitComplete => {
  const base = input("converged");
  const scope = { schemaVersion: 1 as const, predecessorProducerId: "earlier-clean-producer",
    predecessorHeadSha: "e".repeat(40), basisHeadSha: "e".repeat(40), headSha: target.headSha, requiredFindings: [] };
  expect(resolveLocalReviewCoverageSelection({ ...base, facts: nextPassFactsFixture(),
    nextPassContext: { ...base.nextPassContext, incremental: { basis: "delta-check", scope } },
    ...(explicitComplete ? { coverageAdmission: { requestedCoverage: "complete" as const } } : {}),
  })).toEqual({ state: "ready", coverageSelected: false, coverageAdmission: explicitComplete
    ? { requestedCoverage: "complete" } : { requestedCoverage: "incremental", correctionScope: scope } });
});

function materialOffer(facts = nextPassFactsFixture()) {
  const base = input("unconverged");
  const scope = { schemaVersion: 1 as const, predecessorProducerId: "earlier-material-producer",
    predecessorHeadSha: "e".repeat(40), basisHeadSha: "e".repeat(40), headSha: target.headSha,
    requiredFindings: [{ producerId: "earlier-material-producer", findingId: "finding-1", locus: "src/example.ts:1" }] };
  const offered = resolveLocalReviewCoverageSelection({ ...base, facts,
    nextPassContext: { ...base.nextPassContext, incremental: { basis: "fix-check", scope } } });
  if (offered.state !== "coverage-required") throw new Error("expected coverage offer");
  return offered.action;
}

it("offers a local fix check first and states that a complete pass does not replace it", () => {
  const offered = materialOffer();
  expect(offered.interactionText).toContain("local fix check");
  expect(offered.interactionText).toContain("offered first");
  expect(offered.interactionText).toContain("does not replace the fix check");
  expect(offered.interactionText.indexOf("fix check"))
    .toBeLessThan(offered.interactionText.indexOf("complete pass"));
});

it("renders each fact with the decision it informs and asks for an advisory recommendation", () => {
  const text = materialOffer().interactionText;
  expect(text).toContain("Complete passes: 1 of 4");
  expect(text).toMatch(/Complete passes:[^\n]*tight budget favors[^\n]*fix check/u);
  expect(text).toContain("Fix checks since the last complete pass: 1");
  expect(text).toContain("Fix range: 5 changed lines in 1 file; target: 100 changed lines in 10 files");
  expect(text).toContain("Correction chain: proven");
  expect(text).toContain("Critical and major findings: Standard pass 1: 2 → 1.");
  expect(text.indexOf("local fix check")).toBeLessThan(text.indexOf("Complete passes:"));
  expect(text).toContain("Change signals after fixes: after fix check, round 1 since pass 1, the fixes changed paths "
    + "outside the cited loci and added files; no signal fired after 1 other fix round.");
  expect(text).not.toMatch(/Material trend|Round \d,/u);
  expect(text).toContain("a smaller fix range favors a fix check");
  expect(text).toContain("after fix checks converge");
  expect(text).toContain("advisory");
  expect(text).toMatch(/What do you recommend, why, and what would change your recommendation\?$/u);
});

it("names only the complete pass when the chain fails and asks the agent to check why", () => {
  const facts = nextPassFactsFixture();
  facts.chainProven = false; facts.rangeSize.fix = null;
  const offered = resolveLocalReviewCoverageSelection({ ...input("unconverged"), facts });
  if (offered.state !== "coverage-required") throw new Error("expected coverage offer");
  expect(offered.action.choices).toEqual([{ requestedCoverage: "complete" }]);
  expect(offered.action.interactionText).toContain("Only a local complete pass is admitted");
  expect(offered.action.interactionText).toContain("Check why");
  expect(offered.action.interactionText).toContain("Correction chain: unproven");
  expect(offered.action.interactionText).toContain("Fix range: unavailable");
  expect(offered.action.interactionText).toMatch(/What do you recommend, why, and what would change your recommendation\?$/u);
});

it("groups the offered critical and major counts by complete pass, not by look", () => {
  const facts = nextPassFactsFixture();
  const complete = { producerId: "complete-2", logicalPass: 4, coverage: "complete" as const,
    outcome: "findings", materialCount: 1, provisional: false };
  const check = { producerId: "fix-check-3", logicalPass: 5, coverage: "fix-check" as const,
    outcome: "clean", materialCount: 0, provisional: false };
  const text = fullFinalConsiderations({ ...facts, completePasses: 2, fixChecksSinceLastComplete: [check],
    materialTrend: [...facts.materialTrend, { ...facts.materialTrend[1]!, producerId: "fix-check-2", logicalPass: 3 },
      complete, check, { ...check, provisional: true }] }).join("\n");
  expect(text).toContain("Critical and major findings: Standard pass 1: 2 → 1 → 1; Standard pass 2: 1 → 0 "
    + "(this look).");
  expect(text).toContain("Fix checks since the last complete pass: 1 (round 1: clean)");
  expect(text).not.toContain("pass 4");
});

it("keeps another complete pass the default when fix checks converge after a high-yield complete pass", () => {
  const facts = nextPassFactsFixture();
  const [complete, check] = facts.materialTrend;
  const text = fullFinalConsiderations({ ...facts, materialTrend: [{ ...complete!, materialCount: 12 },
    { ...check!, materialCount: 2 }, { ...check!, producerId: "fix-check-2", logicalPass: 3, materialCount: 0,
      provisional: true }] }).join("\n");
  expect(text).toContain("Critical and major findings: Standard pass 1: 12 → 2 → 0 (this look). "
    + "Complete pass 1 found 12.");
  expect(text).toContain("until a complete pass finds no critical or major finding, another complete pass after fix "
    + "checks converge is the default. Recommending a stop before then needs a reason specific to this change. "
    + "An Owner's decision on where review stops ends this default.");
  expect(text).toContain("Prefer a different source for a successor pass.");
  expect(text).not.toMatch(/favou?r stopping/u);
  const met = fullFinalConsiderations({ ...facts, materialTrend: [{ ...complete!, materialCount: 0 }] }).join("\n");
  expect(met).toContain("Complete pass 1 found none, which meets the review's bar. If later repairs make that "
    + "assessment cease to hold, another complete pass is due under the re-inspection test.");
  expect(met).not.toContain("is the default");
});

it("names an incremental lane's closure on converged fix checks instead of a successor default", () => {
  const facts = nextPassFactsFixture();
  const [complete, check] = facts.materialTrend;
  const text = nextPassConsiderations({ ...facts, materialTrend: [{ ...complete!, materialCount: 12 },
    { ...check!, materialCount: 0, provisional: true }] }, "incremental").join("\n");
  expect(text).toContain("Complete pass 1 found 12. Fix checks show whether repairs hold, not what a complete pass "
    + "missed. This lane's policy closes it once the fix-check chain converges; a further complete pass runs only if "
    + "the Owner directs one.");
  expect(text).not.toContain("is the default");
  expect(text).not.toContain("Prefer a different source");
  expect(text).toContain("a broad range supports considering an additional complete pass the Owner directs once fix "
    + "checks converge.");
  expect(text).toContain("either favors an additional complete pass the Owner directs once fix checks converge");
  expect(text).not.toContain("a complete pass after fix checks converge");
  const met = nextPassConsiderations({ ...facts, materialTrend: [{ ...complete!, materialCount: 0 }] }, "incremental")
    .join("\n");
  expect(met).toContain("Complete pass 1 found none, which meets the review's bar.");
  expect(met).not.toContain("re-inspection test");
  const offered = resolveLocalReviewCoverageSelection({ ...input("unconverged"),
    standardReview: { ...standardReview, retrigger: "incremental" as const } });
  if (offered.state !== "coverage-required") throw new Error("expected coverage offer");
  expect(offered.action.interactionText).toContain("This lane's policy closes it once the fix-check chain converges");
});

it("says when no look found a critical or major finding, and when there is no look yet", () => {
  const facts = nextPassFactsFixture();
  const zero = facts.materialTrend.map(look => ({ ...look, materialCount: 0 }));
  expect(fullFinalConsiderations({ ...facts, materialTrend: zero }).join("\n"))
    .toContain("Critical and major findings: none at any look.");
  expect(fullFinalConsiderations({ ...facts, materialTrend: [], fixRounds: [] }).join("\n"))
    .toContain("Critical and major findings: no completed looks.");
  expect(fullFinalConsiderations({ ...facts, fixRounds: [] }).join("\n")).not.toContain("Change signals");
  const quiet = facts.fixRounds.map(round => ({ ...round, outsideCitedLoci: false, addedFiles: false }));
  expect(fullFinalConsiderations({ ...facts, fixRounds: quiet }).join("\n"))
    .toContain("Change signals after fixes: no signal fired after 2 fix rounds.");
  expect(fullFinalConsiderations({ ...facts, fixRounds: quiet.slice(0, 1) }).join("\n"))
    .toContain("Change signals after fixes: no signal fired after 1 fix round.");
});
