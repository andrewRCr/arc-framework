/** Housekeeping pure-routing changed-path policy. */

import { describe, expect, it } from "vitest";

import { classifyHousekeepChangedPaths } from "../../../src/lib/housekeep/path-policy.js";

describe("housekeeping path policy", () => {
  it("accepts planned, provisional, cohort, and readiness routing artifacts", () => {
    expect(classifyHousekeepChangedPaths([
      ".arc/backlog/planned/meta-alpha.md",
      ".arc/backlog/provisional/cohort/meta-beta.md",
      ".arc/backlog/ROADMAP.md",
    ])).toEqual({ kind: "accepted" });
  });

  it("refuses active work-unit and general repository riders", () => {
    expect(classifyHousekeepChangedPaths([
      ".arc/active/meta-started.md",
      "packages/arc-framework/src/cli.ts",
    ])).toEqual({
      kind: "refused",
      paths: [".arc/active/meta-started.md", "packages/arc-framework/src/cli.ts"],
    });
  });
});
