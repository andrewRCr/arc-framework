import { describe, expect, it } from "vitest";

import {
  composeWorkUnitReviewAssurance,
  resolveWorkUnitReviewAssurance,
  type ReviewRubricBindingPort,
} from "../../../../../src/scripts/review-gate/policy/assurance.js";
import type {
  ReviewMethodActivityPort,
  ReviewMethodFilePort,
} from "../../../../../src/scripts/review-gate/policy/activity.js";
import {
  resolveReviewRubricBinding,
  type ReviewRubricMethodLookupPort,
} from "../../../../../src/scripts/review-gate/policy/rubric-binding.js";
import {
  projectStandardReviewGuidance,
  type StandardReviewProjectAugmentation,
} from "../../../../../src/scripts/review-gate/policy/standard-review-guidance.js";

const activity = (value: unknown): ReviewMethodActivityPort => ({
  readReviewMethodActivity: () => value,
});
const augmentation: StandardReviewProjectAugmentation = {
  rubricId: "security-audit/v1",
  dimensions: [{
    id: "authorization",
    title: "Authorization",
    instruction: "Verify explicit authority.",
  }],
};
const rubrics = (available: boolean): ReviewRubricBindingPort => ({
  resolveReviewRubricBinding: (identity) => available
    ? { status: "resolved", binding: { identity, augmentation }, diagnostics: [] }
    : {
      status: "unavailable",
      identity,
      reason: "missing-method",
      diagnostics: [`rubric.${identity}.missing-method`],
    },
});
const method = (name: string, active: unknown): string => [
  "---",
  `name: ${name}`,
  "description: Review method",
  `active: ${String(active)}`,
  "override-active: false",
  "---",
  "",
].join("\n");
const methodFiles = (values: Readonly<Record<string, unknown>>): ReviewMethodFilePort => ({
  readMethodFile: (name) => values[name],
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

    expect(resolved.reviewRubric).toEqual({
      state: "resolved",
      identity: "security-audit",
      augmentation,
    });
    expect(unavailable.reviewRubric).toEqual({
      state: "unavailable",
      identity: "security-audit",
      reason: "missing-method",
    });
  });

  it("treats availability failure as an unavailable declared overlay", () => {
    const result = resolveWorkUnitReviewAssurance(
      { Class: "Light", "Review Rubric": "security-audit" },
      activity({ selfReview: true, frontlineReview: true }),
      { resolveReviewRubricBinding: () => { throw new Error("registry unavailable"); } },
    );

    expect(result.reviewRubric).toEqual({
      state: "unavailable",
      identity: "security-audit",
      reason: "lookup-failed",
    });
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

  it("composes project method activation into the public assurance result", () => {
    const result = composeWorkUnitReviewAssurance(
      { Class: "Heavy", "Review Rubric": "[none]" },
      methodFiles({
        "self-review": method("self-review", false),
        "frontline-review": method("frontline-review", true),
      }),
      rubrics(true),
    );

    expect(result).toMatchObject({
      status: "resolved",
      assurance: {
        activity: { selfReview: false, frontlineReview: true },
        assurance: { workContext: "work-unit", workClass: "Heavy" },
        reviewRubric: { state: "absent" },
      },
      diagnostics: [],
    });
    expect(result.status === "resolved" && result.guidance)
      .toEqual(projectStandardReviewGuidance());
  });

  it("preserves package defaults when project method declarations are absent", () => {
    const result = composeWorkUnitReviewAssurance(
      { Class: "Light", "Review Rubric": "[none]" },
      methodFiles({}),
      rubrics(true),
    );

    expect(result.assurance.activity).toEqual({
      selfReview: true,
      frontlineReview: false,
    });
  });

  it("surfaces malformed project activation without throwing", () => {
    const result = composeWorkUnitReviewAssurance(
      { Class: "Novel", "Review Rubric": "[none]" },
      methodFiles({
        "self-review": "not frontmatter",
        "frontline-review": method("frontline-review", "enabled"),
      }),
      rubrics(true),
    );

    expect(result.assurance.activity).toEqual({
      selfReview: true,
      frontlineReview: false,
    });
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.stringContaining("self-review"),
      expect.stringContaining("frontline-review"),
    ]));
  });

  it("applies a resolved overlay without changing baseline rubric identity", () => {
    const baseline = projectStandardReviewGuidance();
    const result = composeWorkUnitReviewAssurance(
      { Class: "Novel", "Review Rubric": "security-audit" },
      methodFiles({}),
      rubrics(true),
    );

    expect(result.status).toBe("resolved");
    if (result.status !== "resolved") throw new Error("expected resolved assurance");
    expect(result.guidance).toMatchObject({
      rubricVersion: baseline.rubricVersion,
      rubricDigest: baseline.rubricDigest,
      projectAugmentation: augmentation,
    });
    expect(result.guidance.dimensions.slice(0, baseline.dimensions.length))
      .toEqual(baseline.dimensions);
    expect(result.guidance.dimensions.at(-1)).toMatchObject({
      id: "authorization",
      origin: "project",
    });
  });

  it.each([
    ["missing method", []],
    ["ambiguous method", ["one", "two"]],
    ["malformed projection", ["not frontmatter"]],
    ["missing structured field", [[
      "---",
      "name: security-audit",
      "description: Security review",
      "override-active: false",
      "---",
      "",
    ].join("\n")]],
    ["identity mismatch", [[
      "---",
      "name: security-audit",
      "description: Security review",
      "override-active: false",
      "review-augmentation:",
      "  rubricId: privacy-audit/v1",
      "  dimensions:",
      "    - id: authorization",
      "      title: Authorization",
      "      instruction: Verify explicit authority.",
      "---",
      "",
    ].join("\n")]],
  ] as const)("refuses a declared rubric with %s", (_label, files) => {
    const lookup: ReviewRubricMethodLookupPort = { lookupMethodFiles: () => files };
    const result = composeWorkUnitReviewAssurance(
      { Class: "Heavy", "Review Rubric": "security-audit" },
      methodFiles({}),
      {
        resolveReviewRubricBinding: (identity) => resolveReviewRubricBinding(identity, lookup),
      },
    );

    expect(result.status).toBe("refused");
    expect(result.assurance.reviewRubric.state).toBe("unavailable");
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.stringContaining("rubric.security-audit."),
      expect.stringContaining("method.frontline-review.missing"),
      expect.stringContaining("method.self-review.missing"),
    ]));
  });

  it("uses the unchanged baseline and skips rubric lookup when meta has no declaration", () => {
    const result = composeWorkUnitReviewAssurance(
      { Class: "Light", "Review Rubric": "[none]" },
      methodFiles({}),
      { resolveReviewRubricBinding: () => { throw new Error("must not resolve absence"); } },
    );

    expect(result.status).toBe("resolved");
    if (result.status !== "resolved") throw new Error("expected resolved assurance");
    expect(result.assurance.reviewRubric).toEqual({ state: "absent" });
    expect(result.guidance).toEqual(projectStandardReviewGuidance());
  });
});
