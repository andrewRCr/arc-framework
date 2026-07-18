import { describe, expect, it } from "vitest";

import { classifySurface } from "../../../../src/lib/coupling-audit/surface-classifier.js";

describe("classifySurface", () => {
  it.each([
    ["packages/arc-framework/__tests__/unit/example.test.ts", "test"],
    ["packages/arc-framework/arc/system/workflows/arc/process-task-loop.template.md", "workflow"],
    [".arc/system/workflows/arc/process-task-loop.md", "workflow"],
    ["packages/arc-framework/templates/user/SESSION-NOTES.md", "template"],
    ["packages/arc-framework/arc/reference/templates/arc/template-adr.md", "template"],
    ["packages/arc-framework/src/lib/classification.ts", "code"],
    ["packages/arc-framework/arc/system/.internal/githooks/pre-commit", "code"],
    ["scripts/check-package-sync.sh", "code"],
    ["packages/arc-framework/arc/reference/README.md", "prose"],
    ["AGENTS.md", "prose"],
    ["packages/arc-framework/init-recipe.json", "config"],
    ["packages/arc-framework/vitest.config.ts", "config"],
    [".github/CODEOWNERS", "config"],
  ] as const)("classifies %s as %s", (path, expected) => {
    expect(classifySurface(path)).toBe(expected);
  });

  it("normalizes Windows separators before classification", () => {
    expect(classifySurface("packages\\arc-framework\\src\\cli.ts")).toBe("code");
  });

  it("rejects an unknown family", () => {
    expect(() => classifySurface("packages/arc-framework/assets/logo.svg")).toThrow(
      "Unrecognized coupling-audit surface family",
    );
  });
});
