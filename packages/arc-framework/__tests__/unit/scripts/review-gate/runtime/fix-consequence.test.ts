/** Fix consequences follow convergence and the reviewed coverage. */
import { describe, expect, it } from "vitest";
import { SlugSchema } from "../../../../../src/lib/kernel/schema/slug.js";
import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import { proposeDispositionSet } from "../../../../../src/scripts/review-gate/core/dispositions.js";
import { createReviewRequirement, createReviewTarget } from "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import { projectFixConsequence } from "../../../../../src/scripts/review-gate/runtime/fix-consequence.js";
import { approvedRecord, findingsHostedResult } from "../../../../fixtures/review-response-proof.js";

function input(options: {
  retrigger: "incremental" | "full-final"; materialFix?: boolean; local?: boolean;
  delivery?: boolean; coverage?: "complete" | "incremental"; belowCeiling?: boolean; chainAdequate?: boolean;
}) {
  const original = findingsHostedResult([options.materialFix ? "major" : "minor"]);
  if (original.kind !== "hosted") throw new Error("expected hosted result");
  const { targetId: _id, ...coordinates } = original.target; void _id;
  const target = createReviewTarget({ ...coordinates, kind: options.delivery ? "delivery-member" : "change-set" });
  const requirement = createReviewRequirement({ target, projection: { obligation: original.requirement.obligation,
    reasons: original.requirement.reasons, rubricVersion: original.requirement.rubricVersion,
    rubricDigest: original.requirement.rubricDigest, retrigger: options.retrigger, count: original.requirement.count },
    acceptableSources: original.requirement.acceptableSources, initialAdmission: "automatic" });
  if (requirement === null) throw new Error("expected requirement");
  const lineage = options.delivery ? { kind: "delivery-member" as const,
    planId: "123e4567-e89b-12d3-a456-426614174000", deliverableId: canonicalDigest({ member: 1 }),
    workUnitId: SlugSchema.parse("example") } : original.admission.lineage;
  const coverage = options.coverage ?? "complete";
  const result = { ...original, target, requirement, admission: { ...original.admission,
    lineage, logicalPass: coverage === "incremental" ? 2 : 1, policyVersion: requirement.policyVersion, requestedCoverage: coverage, effectiveCoverage: coverage,
    ...(coverage === "incremental" ? { correctionScope: { schemaVersion: 1 as const,
      predecessorProducerId: "prior-producer", predecessorHeadSha: "1".repeat(40), basisHeadSha: "1".repeat(40),
      headSha: target.headSha, requiredFindings: [] } } : {}),
  } };
  const approved = approvedRecord(result, [{ sourceVerification: "verified",
    verifiedSeverity: options.materialFix ? "major" : "minor", disposition: "fix" }]);
  return { result, proposal: proposeDispositionSet(approved.approvedDispositionLineage[0]!.approvedDisposition.dispositionSet),
    materialFix: options.materialFix ?? false, belowCeiling: options.belowCeiling ?? true,
    chainAdequate: options.chainAdequate ?? coverage === "complete", delegatedAgentSelectable: options.local !== false };
}

describe("proposed fix consequences", () => {
  it.each([
    { coverage: "complete", chainAdequate: true, local: true, consequence: { kind: "next-pass", coverage: "incremental-when-proven" } },
    { coverage: "incremental", chainAdequate: false, local: true, consequence: { kind: "ceiling-decision" } },
    { coverage: "complete", chainAdequate: true, local: false, consequence: { kind: "ceiling-decision" } },
  ] as const)("predicts material fixes at the ceiling from chain=$chainAdequate and local=$local", row => {
    const { consequence, ...options } = row;
    expect(projectFixConsequence(input({ ...options, retrigger: "full-final", materialFix: true, belowCeiling: false })))
      .toEqual(consequence);
  });

  it.each([
    { retrigger: "full-final", materialFix: true, local: true, coverage: "incremental-when-proven" },
    { retrigger: "full-final", materialFix: false, local: true, coverage: "complete" },
    { retrigger: "incremental", materialFix: true, local: true, coverage: "incremental-when-proven" },
    { retrigger: "incremental", materialFix: false, local: true, coverage: "incremental-when-proven" },
    { retrigger: "full-final", materialFix: true, local: false, coverage: "complete" },
    { retrigger: "incremental", materialFix: false, local: false, coverage: "complete" },
  ] as const)("predicts Errand coverage for $retrigger, material=$materialFix, local=$local", row => {
    const { coverage, ...options } = row;
    expect(projectFixConsequence(input(options))).toEqual({ kind: "next-pass", coverage });
  });
  it("requires a complete pass after minor fixes on a full-final delivery fix check", () => {
    expect(projectFixConsequence(input({ retrigger: "full-final", delivery: true, coverage: "incremental" })))
      .toEqual({ kind: "next-pass", coverage: "complete" });
  });
  it("requires the ceiling decision for that complete successor when no pass remains", () => {
    expect(projectFixConsequence(input({ retrigger: "full-final", delivery: true, coverage: "incremental", belowCeiling: false })))
      .toEqual({ kind: "ceiling-decision" });
  });
  it.each([
    { retrigger: "full-final", coverage: "complete" },
    { retrigger: "incremental", coverage: "incremental" },
    { retrigger: "incremental", coverage: "complete" },
  ] as const)("keeps delivery's minor-fix closure for $retrigger / $coverage", row => {
    expect(projectFixConsequence(input({ ...row, delivery: true }))).toEqual({ kind: "lane-closes" });
  });
});
