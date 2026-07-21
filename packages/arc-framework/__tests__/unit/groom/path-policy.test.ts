/** Fixed-set grooming path policy. */

import { describe, expect, it } from "vitest";

import { classifyGroomChangedPaths } from "../../../src/lib/groom/path-policy.js";

describe("classifyGroomChangedPaths", () => {
  it("allows claimed members, named cohorts, and derived project views", () => {
    expect(classifyGroomChangedPaths([
      ".arc/backlog/planned/alpha/meta-alpha.md",
      ".arc/backlog/provisional/team/beta/draft-beta.md",
      ".arc/backlog/planned/team/cohort-team.md",
      ".arc/backlog/ROADMAP.md",
    ], {
      members: ["alpha", "beta"],
      cohortPaths: [".arc/backlog/planned/team/cohort-team.md"],
    })).toEqual({ kind: "allowed" });
  });

  it("refuses unrelated and active work-unit riders", () => {
    expect(classifyGroomChangedPaths([
      ".arc/backlog/planned/gamma/meta-gamma.md",
      ".arc/active/draft-alpha.md",
      "README.md",
    ], { members: ["alpha"] })).toEqual({
      kind: "refused",
      paths: [
        ".arc/backlog/planned/gamma/meta-gamma.md",
        ".arc/active/draft-alpha.md",
        "README.md",
      ],
    });
  });
});
