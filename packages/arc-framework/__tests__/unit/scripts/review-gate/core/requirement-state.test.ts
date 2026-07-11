import { describe, expect, it } from "vitest";

import type { ReviewRequirement } from "../../../../../src/scripts/review-gate/core/contracts.js";
import type { Evidence } from "../../../../../src/scripts/review-gate/core/evidence.js";
import { reduceRequirementState } from "../../../../../src/scripts/review-gate/core/requirement-state.js";

const CURRENT_CHANGE = "a".repeat(64);
const CURRENT_HEAD = "b".repeat(40);

function requirement(obligation: "required" | "recommended" = "required"): ReviewRequirement {
  return {
    schemaVersion: 1,
    id: "analysis",
    kind: "independent-analysis",
    obligation,
    acceptableSources: [{ sourceKind: "agent", qualifier: "independent-analysis/v1" }],
    count: 1,
    initialAdmission: "automatic",
    policyVersion: "c".repeat(64),
    rubricVersion: "independent-analysis/v1",
    reasons: ["code-surface"],
    changeSetId: CURRENT_CHANGE,
    headSha: CURRENT_HEAD,
  };
}

function evidence(overrides: Partial<Evidence> = {}): Evidence {
  const req = requirement();
  return {
    schemaVersion: 1,
    requirementId: req.id,
    sourceKind: "agent",
    sourceIdentity: "agent-1",
    result: "clean",
    evidenceUrlOrId: "evidence:1",
    policyVersion: req.policyVersion,
    rubricVersion: req.rubricVersion,
    coverage: "full",
    coverageFromSha: "d".repeat(40),
    coverageThroughSha: CURRENT_HEAD,
    baseRef: "main",
    diffBaseSha: "d".repeat(40),
    changeSetId: CURRENT_CHANGE,
    headSha: CURRENT_HEAD,
    findings: [],
    closures: [],
    observedAt: "2026-07-10T20:00:00.000Z",
    ...overrides,
  };
}

const capacity = {
  schemaVersion: 1 as const,
  sourceIdentity: "agent-1",
  status: "available" as const,
  reason: "provider-reported" as const,
  provenance: "capacity:1",
  observedAt: "2026-07-10T20:00:00.000Z",
};

describe("requirement execution state", () => {
  it("settles clean only when terminal coverage and finding closure pass", () => {
    expect(reduceRequirementState({
      requirement: requirement(),
      evidence: [evidence()],
      receipts: [],
      capacity,
      waived: false,
      coverageSatisfied: true,
      findingsConsistent: true,
      openFindingCount: 0,
    })).toMatchObject({ state: "clean", blocking: false });
    expect(reduceRequirementState({
      requirement: requirement(),
      evidence: [evidence()],
      receipts: [],
      capacity,
      waived: false,
      coverageSatisfied: false,
      findingsConsistent: true,
      openFindingCount: 0,
    })).toMatchObject({ state: "stale", blocking: true });
  });

  it("stales prior evidence on a new head while retaining history eligibility", () => {
    expect(reduceRequirementState({
      requirement: requirement(),
      evidence: [evidence({ changeSetId: "e".repeat(64), headSha: "f".repeat(40) })],
      receipts: [],
      capacity,
      waived: false,
      coverageSatisfied: false,
      findingsConsistent: true,
      openFindingCount: 0,
    })).toMatchObject({ state: "stale", historyEligible: true });
  });

  it("uses proof-qualified carried evidence as the current review state", () => {
    const carried = evidence({ changeSetId: "e".repeat(64), headSha: "f".repeat(40), coverageThroughSha: "f".repeat(40) });
    expect(reduceRequirementState({
      requirement: requirement(),
      evidence: [carried],
      currentEvidence: [carried],
      receipts: [],
      capacity,
      waived: false,
      coverageSatisfied: true,
      findingsConsistent: true,
      openFindingCount: 0,
    })).toMatchObject({ state: "clean", blocking: false });
  });

  it("keeps required unavailable blocking and recommended unavailable visible", () => {
    const unavailable = evidence({ result: "unavailable" });
    expect(reduceRequirementState({
      requirement: requirement(), evidence: [unavailable], receipts: [], capacity, waived: false,
      coverageSatisfied: false, findingsConsistent: true, openFindingCount: 0,
    })).toMatchObject({ state: "unavailable", blocking: true });
    expect(reduceRequirementState({
      requirement: requirement("recommended"), evidence: [unavailable], receipts: [], capacity, waived: false,
      coverageSatisfied: false, findingsConsistent: true, openFindingCount: 0,
    })).toMatchObject({ state: "unavailable", blocking: false });
  });

  it("does not let exhausted capacity block qualifying current evidence", () => {
    expect(reduceRequirementState({
      requirement: requirement(),
      evidence: [evidence()],
      receipts: [],
      capacity: { ...capacity, status: "exhausted", reason: "provider-reported" },
      waived: false,
      coverageSatisfied: true,
      findingsConsistent: true,
      openFindingCount: 0,
    })).toMatchObject({ state: "clean", blocking: false });
  });
});
