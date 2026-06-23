/**
 * Unit tests for cohort path-value semantics — the two-segment-cap shape
 * validation and the leaf-segment derivation the render surfaces consume.
 */

import { describe, it, expect } from "vitest";

import {
  validateCohortPath,
  cohortLeaf,
  cohortParent,
  COHORT_SEGMENT_CAP,
} from "../../../src/lib/active/cohort-path.js";

describe("validateCohortPath — two-segment cap", () => {
  it("accepts a single-segment cohort", () => {
    expect(validateCohortPath("core")).toBeNull();
  });

  it("accepts a two-segment nested cohort", () => {
    expect(validateCohortPath("core/sub")).toBeNull();
  });

  it("accepts the `[none]` standalone sentinel", () => {
    expect(validateCohortPath("[none]")).toBeNull();
  });

  it("flags a three-segment path as exceeding the cap", () => {
    const error = validateCohortPath("core/sub/leaf");
    expect(error).not.toBeNull();
    expect(error).toContain(String(COHORT_SEGMENT_CAP));
  });

  it("flags an empty segment from a trailing or doubled slash", () => {
    expect(validateCohortPath("core/")).not.toBeNull();
    expect(validateCohortPath("core//sub")).not.toBeNull();
  });
});

describe("cohortLeaf — render derivation", () => {
  it("returns the subcohort for a nested path", () => {
    expect(cohortLeaf("core/sub")).toBe("sub");
  });

  it("returns the cohort itself for a single segment", () => {
    expect(cohortLeaf("core")).toBe("core");
  });

  it("derives the leaf of a deep, real-world nested cohort", () => {
    expect(cohortLeaf("principle-anchored-core/agile-wu-lifecycle")).toBe(
      "agile-wu-lifecycle",
    );
  });
});

describe("cohortParent — nested-parent derivation", () => {
  it("returns the first segment of a nested path", () => {
    expect(cohortParent("core/sub")).toBe("core");
  });

  it("returns null for a single-segment cohort (no parent)", () => {
    expect(cohortParent("core")).toBeNull();
  });

  it("returns null for the `[none]` sentinel and the empty string", () => {
    expect(cohortParent("[none]")).toBeNull();
    expect(cohortParent("  ")).toBeNull();
  });

  it("derives the parent of a real-world nested cohort", () => {
    expect(cohortParent("agile-parallelism/concurrent-work-conventions")).toBe(
      "agile-parallelism",
    );
  });
});
