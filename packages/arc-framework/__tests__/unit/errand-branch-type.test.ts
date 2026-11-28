/**
 * Unit tests for the errand branch-type vocabulary — the nature-type set an
 * errand branch may carry (`fix` / `chore` / `refactor` / `hotfix`), its default
 * (`chore`), and the membership guard. The set is the branch-format type set
 * minus `feat`: a feature is spec-worthy, so it is a work unit, never an errand.
 */

import { describe, it, expect } from "vitest";

import {
  ERRAND_BRANCH_TYPES,
  DEFAULT_ERRAND_BRANCH_TYPE,
  isErrandBranchType,
  suffixedErrandBranchSlug,
} from "../../src/lib/errand/branch-type.js";

describe("errand branch-type vocabulary", () => {
  it("admits the branch-format nature types other than feat", () => {
    expect([...ERRAND_BRANCH_TYPES].sort()).toEqual(["chore", "fix", "hotfix", "refactor"]);
  });

  it("excludes feat — a feature is spec-worthy, so it is a work unit, not an errand", () => {
    expect(isErrandBranchType("feat")).toBe(false);
  });

  it("defaults to chore", () => {
    expect(DEFAULT_ERRAND_BRANCH_TYPE).toBe("chore");
    expect(isErrandBranchType(DEFAULT_ERRAND_BRANCH_TYPE)).toBe(true);
  });

  it("accepts every type in the set and rejects an unknown one", () => {
    for (const type of ERRAND_BRANCH_TYPES) expect(isErrandBranchType(type)).toBe(true);
    expect(isErrandBranchType("wibble")).toBe(false);
    expect(isErrandBranchType("")).toBe(false);
  });

  it("reads the slug before a suffixed errand branch's suffix, and nothing from any other branch", () => {
    expect(suffixedErrandBranchSlug("chore/fix-it-0a1b2c3d")).toBe("fix-it");
    expect(suffixedErrandBranchSlug("hotfix/x-ffffffff")).toBe("x");
    for (const branch of ["chore/fix-it", "feat/fix-it-0a1b2c3d", "chore/fix-it-0A1B2C3D", "chore/fix-it-0a1b2c3", "chore/-0a1b2c3d",
      "chore/0a1b2c3d", "fix-it-0a1b2c3d"]) expect(suffixedErrandBranchSlug(branch)).toBeNull();
  });

  it("rejects a nested branch whose suffix follows an invalid errand slug", () => {
    expect(suffixedErrandBranchSlug("fix/team/widget-deadbeef")).toBeNull();
  });
});
