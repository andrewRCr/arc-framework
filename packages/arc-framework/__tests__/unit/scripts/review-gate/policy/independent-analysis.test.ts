import { describe, expect, it } from "vitest";

import {
  deriveIndependentAnalysisRubricIdentity,
  INDEPENDENT_ANALYSIS_BASELINE_CONTRACT,
  INDEPENDENT_ANALYSIS_RUBRIC_IDENTITY,
  validateIndependentAnalysisContractEvolution,
} from "../../../../../src/scripts/review-gate/policy/independent-analysis.js";

describe("independent-analysis identity", () => {
  it("pins one domain-separated identity for the complete typed baseline", () => {
    expect(INDEPENDENT_ANALYSIS_RUBRIC_IDENTITY).toEqual({
      version: "independent-analysis/v1",
      digest: "sha256:c34dfab26c476e8bfa07c60540b7af7f01b06834e6533a5e14d433e88a1d07f8",
    });
    expect(deriveIndependentAnalysisRubricIdentity(INDEPENDENT_ANALYSIS_BASELINE_CONTRACT))
      .toEqual(INDEPENDENT_ANALYSIS_RUBRIC_IDENTITY);
  });

  it.each([
    ["coverage", { coverage: { ...INDEPENDENT_ANALYSIS_BASELINE_CONTRACT.coverage, scope: "partial" } }],
    ["evaluator", {
      evaluatorBoundary: {
        ...INDEPENDENT_ANALYSIS_BASELINE_CONTRACT.evaluatorBoundary,
        actorSeparation: "author-allowed",
      },
    }],
    ["rubric", {
      rubric: { ...INDEPENDENT_ANALYSIS_BASELINE_CONTRACT.rubric, version: "implementation-audit/v2" },
    }],
    ["finding floor", { findingFloor: ["stable-locus"] }],
    ["clean rule", {
      cleanRule: {
        ...INDEPENDENT_ANALYSIS_BASELINE_CONTRACT.cleanRule,
        requiredCoverage: "sampled-change-set",
      },
    }],
  ])("requires a version change when %s semantics change", (_name, override) => {
    const changed = { ...INDEPENDENT_ANALYSIS_BASELINE_CONTRACT, ...override };
    expect(() => deriveIndependentAnalysisRubricIdentity(changed)).toThrow(/version change/u);
    expect(() => validateIndependentAnalysisContractEvolution(
      INDEPENDENT_ANALYSIS_BASELINE_CONTRACT,
      changed,
    )).toThrow(/version change/u);
    expect(validateIndependentAnalysisContractEvolution(
      INDEPENDENT_ANALYSIS_BASELINE_CONTRACT,
      { ...changed, version: "independent-analysis/v2" },
    ).digest).not.toBe(INDEPENDENT_ANALYSIS_RUBRIC_IDENTITY.digest);
  });

  it("keeps editorial method prose outside the semantic identity", () => {
    const editorialVariants = [
      "Review every changed surface.",
      "Examine every changed surface carefully and report concise findings.",
    ];
    expect(editorialVariants.map(() =>
      deriveIndependentAnalysisRubricIdentity(INDEPENDENT_ANALYSIS_BASELINE_CONTRACT)))
      .toEqual([INDEPENDENT_ANALYSIS_RUBRIC_IDENTITY, INDEPENDENT_ANALYSIS_RUBRIC_IDENTITY]);
    expect(() => deriveIndependentAnalysisRubricIdentity({
      ...INDEPENDENT_ANALYSIS_BASELINE_CONTRACT,
      editorialMethodProse: editorialVariants[0],
    })).toThrow(/unrecognized key/iu);
  });

  it("rejects non-normalized identity lists before hashing", () => {
    expect(() => deriveIndependentAnalysisRubricIdentity({
      ...INDEPENDENT_ANALYSIS_BASELINE_CONTRACT,
      findingFloor: [...INDEPENDENT_ANALYSIS_BASELINE_CONTRACT.findingFloor].reverse(),
    })).toThrow(/sorted and unique/u);
    expect(() => deriveIndependentAnalysisRubricIdentity({
      ...INDEPENDENT_ANALYSIS_BASELINE_CONTRACT,
      findingFloor: [
        ...INDEPENDENT_ANALYSIS_BASELINE_CONTRACT.findingFloor,
        "actionable-materiality",
      ],
    })).toThrow(/sorted and unique/u);
  });
});
