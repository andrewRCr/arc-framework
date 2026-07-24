import { describe, expect, it } from "vitest";

import type { ChangeSet } from "../../../../../../src/lib/change-facts.js";
import {
  resolveSurfaceAuthority,
} from "../../../../../../src/scripts/review-gate/policy/self-hosting/authority.js";

function changes(...paths: string[]): ChangeSet {
  return {
    changeSet: "known",
    changes: paths.map((path) => ({
      status: "modified",
      path,
      oldMode: "100644",
      newMode: "100644",
    })),
  };
}

describe("self-hosting surface authority", () => {
  it.each([
    ".arc/active/tasks-active.md",
    ".arc/active/cohort-active.md",
    ".arc/backlog/planned/cohort/draft-planned.md",
    ".arc/backlog/provisional/new/meta-new.md",
  ])("classifies formative artifact %s as planning grooming", (path) => {
    expect(resolveSurfaceAuthority(changes(path))).toEqual({ authority: "planning-grooming" });
  });

  it.each([
    ".arc/active/spec-active.md",
    ".arc/completed/2026-Q3/01_work/spec-work.md",
    ".arc/reference/strategies/project/strategy-review.md",
    "packages/arc-framework/arc/reference/strategies/arc/strategy-review.md",
    ".arc/reference/adr/adr-001-review.md",
  ])("classifies design artifact %s as design authority", (path) => {
    expect(resolveSurfaceAuthority(changes(path))).toEqual({ authority: "design-authority" });
  });

  it.each([
    ".arc/reference/PROJECT-PRD.md",
    ".arc/system/rules/DEV-RULES.ARC.md",
    "packages/arc-framework/arc/reference/PROJECT-PRD.template.md",
    "packages/arc-framework/arc/system/rules/DEV-RULES.PROJECT.template.md",
    "AGENTS.md",
    "CLAUDE.md",
  ])("classifies constitutional artifact %s as constitutional", (path) => {
    expect(resolveSurfaceAuthority(changes(path))).toEqual({ authority: "constitutional" });
  });

  it("classifies a derived surface as unverifiable until its source relationship is proved", () => {
    const changeSet = changes(".arc/backlog/ROADMAP.md");

    expect(resolveSurfaceAuthority(changeSet)).toEqual({ authority: "unverifiable-derived" });
    expect(resolveSurfaceAuthority(changeSet, {
      verifiesDerivedSurface: (path) => path === ".arc/backlog/ROADMAP.md",
    })).toEqual({ authority: "ordinary" });
  });

  it("uses both rename and copy endpoints and keeps the strongest member", () => {
    const changeSet: ChangeSet = {
      changeSet: "known",
      changes: [
        {
          status: "renamed",
          previousPath: "README.md",
          path: ".arc/reference/strategies/project/strategy-review.md",
          oldMode: "100644",
          newMode: "100644",
        },
        {
          status: "copied",
          previousPath: ".arc/active/tasks-work.md",
          path: "AGENTS.md",
          oldMode: "100644",
          newMode: "100644",
        },
      ],
    };

    expect(resolveSurfaceAuthority(changeSet)).toEqual({ authority: "constitutional" });
  });

  it("applies the closed strongest-member order across a mixed change set", () => {
    expect(resolveSurfaceAuthority(changes(
      "README.md",
      ".arc/active/tasks-work.md",
      ".arc/reference/strategies/project/strategy-review.md",
      "AGENTS.md",
      ".arc/backlog/ROADMAP.md",
    ))).toEqual({ authority: "unverifiable-derived" });
  });

  it.each([
    ["an unknown change set", { changeSet: "unknown", changes: [] } as ChangeSet, undefined],
    ["an unsafe endpoint", changes("../AGENTS.md"), undefined],
    ["missing move provenance", {
      changeSet: "known",
      changes: [{
        status: "renamed",
        path: "AGENTS.md",
        oldMode: "100644",
        newMode: "100644",
      }],
    } as ChangeSet, undefined],
    ["an unsupported status", {
      changeSet: "known",
      changes: [{
        status: "unknown",
        path: "README.md",
        oldMode: "100644",
        newMode: "100644",
      }],
    } as unknown as ChangeSet, undefined],
    ["a failed derived-source predicate", changes(".arc/backlog/ROADMAP.md"), {
      verifiesDerivedSurface: () => { throw new Error("proof unavailable"); },
    }],
  ])("fails closed for %s", (_label, changeSet, options) => {
    expect(resolveSurfaceAuthority(changeSet, options)).toEqual({ authority: "unknown" });
  });

  it("classifies ordinary source and documentation without ownership or work metadata", () => {
    expect(resolveSurfaceAuthority(changes("README.md", "packages/arc-framework/src/cli.ts")))
      .toEqual({ authority: "ordinary" });
  });
});
