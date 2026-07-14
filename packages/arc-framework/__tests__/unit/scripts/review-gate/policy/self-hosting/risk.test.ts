import { describe, expect, it } from "vitest";

import { classifyReviewRisk } from "../../../../../../src/scripts/review-gate/policy/self-hosting/risk.js";

describe("self-hosting review risk", () => {
  it.each([
    ["Git control", ".github/workflows/ci.yml", "github-control-surface"],
    ["ARC system", ".arc/system/rules/DEV-RULES.ARC.md", "arc-system-surface"],
    ["strategy", ".arc/reference/strategies/arc/strategy-work-organization.md", "strategy-surface"],
    ["decision record", ".arc/reference/adr/adr-001.md", "adr-surface"],
    ["agent brief", ".arc/reference/briefs/AGENT-BRIEF.ARC.md", "agent-brief-surface"],
    ["project authority", ".arc/reference/PROJECT-PRD.md", "project-prd-surface"],
    ["technical overview", ".arc/reference/TECHNICAL-OVERVIEW.md", "technical-overview-surface"],
    ["root agent contract", "AGENTS.md", "harness-contract-surface"],
    ["root alternate contract", "CLAUDE.md", "harness-contract-surface"],
  ])("marks %s as sensitive", (_name, path, reason) => {
    expect(classifyReviewRisk({ paths: [path], codeSurface: false })).toEqual({
      risk: "sensitive",
      reasons: [reason],
    });
  });

  it("emits every matching stable reason", () => {
    expect(classifyReviewRisk({
      paths: [".github/workflows/ci.yml", ".arc/system/rules/DEV-RULES.ARC.md"],
      codeSurface: true,
    })).toEqual({
      risk: "sensitive",
      reasons: ["code-surface", "github-control-surface", "arc-system-surface"],
    });
  });

  it("keeps routine documentation routine regardless of mutable CI history", () => {
    expect(classifyReviewRisk({ paths: ["README.md", "docs/guide.md"], codeSurface: false })).toEqual({
      risk: "routine",
      reasons: ["routine-doc-surface"],
    });
  });

  it("fails safe for an empty or unresolvable change set", () => {
    expect(classifyReviewRisk({ paths: [], codeSurface: false })).toEqual({
      risk: "sensitive",
      reasons: ["unknown-change-set"],
    });
  });
});
