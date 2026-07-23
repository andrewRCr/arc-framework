import { describe, expect, it } from "vitest";

import {
  resolveWorkUnitReviewAssurance,
  type ReviewRubricBindingPort,
} from "../../../../../src/scripts/review-gate/policy/assurance.js";
import type { ReviewMethodActivityPort } from "../../../../../src/scripts/review-gate/policy/activity.js";

const activity = (value: unknown): ReviewMethodActivityPort => ({
  readReviewMethodActivity: () => value,
});
const rubrics = (available: boolean): ReviewRubricBindingPort => ({
  resolveReviewRubricBinding: (identity) => available ? { identity } : null,
});

describe("work-unit review assurance", () => {
  it("composes activity and class with semantic overlay absence", () => {
    const result = resolveWorkUnitReviewAssurance(
      { Class: "Heavy", "Review Rubric": "[none]" },
      activity({ selfReview: false, frontlineReview: true }),
      { resolveReviewRubricBinding: () => { throw new Error("must not resolve absence"); } },
    );

    expect(result).toEqual({
      activity: { selfReview: false, frontlineReview: true },
      assurance: { workContext: "work-unit", workClass: "Heavy" },
      reviewRubric: { state: "absent" },
    });
  });

  it("distinguishes resolved and unavailable declared overlays", () => {
    const resolved = resolveWorkUnitReviewAssurance(
      { Class: "Novel", "Review Rubric": "security-audit" },
      activity({ selfReview: true, frontlineReview: true }),
      rubrics(true),
    );
    const unavailable = resolveWorkUnitReviewAssurance(
      { Class: "Novel", "Review Rubric": "security-audit" },
      activity({ selfReview: true, frontlineReview: true }),
      rubrics(false),
    );

    expect(resolved.reviewRubric).toEqual({ state: "resolved", identity: "security-audit" });
    expect(unavailable.reviewRubric).toEqual({ state: "unavailable", identity: "security-audit" });
  });

  it("treats availability failure as an unavailable declared overlay", () => {
    const result = resolveWorkUnitReviewAssurance(
      { Class: "Light", "Review Rubric": "security-audit" },
      activity({ selfReview: true, frontlineReview: true }),
      { resolveReviewRubricBinding: () => { throw new Error("registry unavailable"); } },
    );

    expect(result.reviewRubric).toEqual({ state: "unavailable", identity: "security-audit" });
  });

  it.each([
    { Class: "Medium", "Review Rubric": "[none]" },
    { Class: "Heavy", "Review Rubric": "methods/security-audit.md" },
    { Class: "Heavy", "Review Rubric": "security-audit, privacy-audit" },
  ])("refuses malformed WU assurance metadata", (meta) => {
    expect(() => resolveWorkUnitReviewAssurance(
      meta,
      activity({ selfReview: true, frontlineReview: true }),
      rubrics(true),
    )).toThrow();
  });
});
