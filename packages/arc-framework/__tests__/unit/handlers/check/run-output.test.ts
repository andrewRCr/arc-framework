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
  expect(skipped).toContain("Checks: lint skipped.");
  expect(skipped).not.toContain("passed");
});

it("reports an undeclared request without calling it passed", () => {
  const empty = renderDeclaredChecks({ kind: "result", exitCode: 0, result: { status: "none declared", checks: [] } }, false);
  expect(empty).toBe("none declared\nChecks: none declared.\n");
  expect(empty).not.toContain("passed");
});

it("leads with failed checks before successful checks", () => {
  const result = renderDeclaredChecks({ kind: "result", exitCode: 1, result: {
    status: "completed", checks: [
      { id: "success", kind: "enforcement", outcome: "passed" },
      { id: "failure", kind: "feedback", outcome: "failed", output: "diagnostic" },
    ],
  } }, false);
  expect(result.split("\n")[0]).toContain("failure: failed");
  expect(result.indexOf("failure: failed")).toBeLessThan(result.indexOf("success: passed"));
});

it("shows the failed output tail and full-log path while keeping successful checks to one line", () => {
  const output = Array.from({ length: 40 }, (_, index) => `diagnostic-${index}`).join("\n");
  const result = renderDeclaredChecks({ kind: "result", exitCode: 1, result: {
    status: "completed", checks: [
      { id: "success", kind: "enforcement", outcome: "passed", output: "successful stdout", costMs: 10 },
      { id: "failure", kind: "feedback", outcome: "failed", output, logPath: "/records/failure.log", costMs: 20 },
    ],
  } }, false);
  expect(result).toContain("/records/failure.log");
  expect(result).toContain("diagnostic-39");
  expect(result).not.toContain("diagnostic-0\n");
  expect(result).not.toContain("successful stdout");
  expect(result.split("\n").filter(line => line.startsWith("success:"))).toHaveLength(1);
});

it("shows a forecast's last measured cost without presenting it as a new execution", () => {
  const result = renderDeclaredChecks({ kind: "result", exitCode: 0, result: {
    status: "completed", checks: [{ id: "lint", kind: "enforcement", outcome: "would run", lastCostMs: 10,
      cwd: ".", mode: "project", shell: false, ciOnly: false, fixes: false, batches: [["lint"]] }],
  } }, false);
  expect(result).toContain("lint: would run");
  expect(result).toContain("last run: 10 ms");
});
