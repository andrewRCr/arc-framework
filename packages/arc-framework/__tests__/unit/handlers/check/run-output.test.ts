/** Human reports expose when a pass ran against different worktree content. */
import { expect, it } from "vitest";
import { renderDeclaredChecks } from "../../../../src/handlers/check/run-output.js";

it("labels a successful divergent run with its differing input paths", () => {
  const result = renderDeclaredChecks({ kind: "result", exitCode: 0, result: {
    status: "completed", checks: [{ id: "lint", kind: "enforcement", outcome: "passed", divergent: ["src/a.ts"] }],
  } }, false);
  expect(result).toContain("lint: passed [enforcement]");
  expect(result).toContain("worktree differs: src/a.ts");
});

it("lists a fixer's rewritten paths in the human report", () => {
  const result = renderDeclaredChecks({ kind: "result", exitCode: 1, result: {
    status: "completed", checks: [{ id: "format", kind: "enforcement", outcome: "failed", rewritten: ["src/a.ts"] }],
  } }, false);
  expect(result).toContain("rewrote: src/a.ts");
});

it("reports skipped checks without calling them passed", () => {
  const skipped = renderDeclaredChecks({ kind: "result", exitCode: 0, result: {
    status: "completed", checks: [{ id: "lint", kind: "enforcement", outcome: "skipped", reason: "operator skip" }],
  } }, false);
  expect(skipped).toContain("lint: skipped");
  expect(skipped).not.toContain("passed");
});

it("reports an undeclared request without calling it passed", () => {
  const empty = renderDeclaredChecks({ kind: "result", exitCode: 0, result: { status: "none declared", checks: [] } }, false);
  expect(empty).toBe("none declared\n");
  expect(empty).not.toContain("passed");
});
