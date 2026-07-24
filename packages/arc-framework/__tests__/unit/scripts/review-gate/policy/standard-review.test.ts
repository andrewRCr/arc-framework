import { describe, expect, it } from "vitest";

import {
  deriveStandardReviewRubricIdentity,
  STANDARD_REVIEW_BASELINE_CONTRACT,
  STANDARD_REVIEW_RUBRIC_IDENTITY,
  validateStandardReviewContractEvolution,
} from "../../../../../src/scripts/review-gate/policy/standard-review.js";

describe("standard-review identity", () => {
  it("pins one domain-separated identity for the complete typed baseline", () => {
    expect(STANDARD_REVIEW_RUBRIC_IDENTITY).toEqual({
      version: "standard-review/v1",
      digest: "sha256:cea850203b3e821cc9f81563b30d01c91a2cc85832fd2edff8b4a1da7dae6295",
    });
    expect(deriveStandardReviewRubricIdentity(STANDARD_REVIEW_BASELINE_CONTRACT))
      .toEqual(STANDARD_REVIEW_RUBRIC_IDENTITY);
  });

  it.each([
    ["coverage", { coverage: { ...STANDARD_REVIEW_BASELINE_CONTRACT.coverage, scope: "partial" } }],
    ["evaluator", {
      evaluatorBoundary: {
        ...STANDARD_REVIEW_BASELINE_CONTRACT.evaluatorBoundary,
        actorSeparation: "author-allowed",
      },
    }],
    ["rubric", {
      rubric: { ...STANDARD_REVIEW_BASELINE_CONTRACT.rubric, version: "implementation-audit/v2" },
    }],
    ["finding floor", { findingFloor: ["stable-locus"] }],
    ["clean rule", {
      cleanRule: {
        ...STANDARD_REVIEW_BASELINE_CONTRACT.cleanRule,
        requiredCoverage: "sampled-change-set",
      },
    }],
  ])("requires a version change when %s semantics change", (_name, override) => {
    const changed = { ...STANDARD_REVIEW_BASELINE_CONTRACT, ...override };
    expect(() => deriveStandardReviewRubricIdentity(changed)).toThrow(/version change/u);
    expect(() => validateStandardReviewContractEvolution(
      STANDARD_REVIEW_BASELINE_CONTRACT,
      changed,
    )).toThrow(/version change/u);
    expect(validateStandardReviewContractEvolution(
      STANDARD_REVIEW_BASELINE_CONTRACT,
      { ...changed, version: "standard-review/v2" },
    ).digest).not.toBe(STANDARD_REVIEW_RUBRIC_IDENTITY.digest);
  });

  it("keeps editorial method prose outside the semantic identity", () => {
    const editorialVariants = [
      "Review every changed surface.",
      "Examine every changed surface carefully and report concise findings.",
    ];
    expect(editorialVariants.map(() =>
      deriveStandardReviewRubricIdentity(STANDARD_REVIEW_BASELINE_CONTRACT)))
      .toEqual([STANDARD_REVIEW_RUBRIC_IDENTITY, STANDARD_REVIEW_RUBRIC_IDENTITY]);
    expect(() => deriveStandardReviewRubricIdentity({
      ...STANDARD_REVIEW_BASELINE_CONTRACT,
      editorialMethodProse: editorialVariants[0],
    })).toThrow(/unrecognized key/iu);
  });

  it("rejects non-normalized identity lists before hashing", () => {
    expect(() => deriveStandardReviewRubricIdentity({
      ...STANDARD_REVIEW_BASELINE_CONTRACT,
      findingFloor: [...STANDARD_REVIEW_BASELINE_CONTRACT.findingFloor].reverse(),
    })).toThrow(/sorted and unique/u);
    expect(() => deriveStandardReviewRubricIdentity({
      ...STANDARD_REVIEW_BASELINE_CONTRACT,
      findingFloor: [
        ...STANDARD_REVIEW_BASELINE_CONTRACT.findingFloor,
        "actionable-materiality",
      ],
    })).toThrow(/sorted and unique/u);
  });
});
