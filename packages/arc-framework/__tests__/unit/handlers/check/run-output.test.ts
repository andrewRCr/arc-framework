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

it("shows a check's notice beside its outcome", () => {
  const result = renderDeclaredChecks({ kind: "result", exitCode: 0, result: {
    status: "completed", checks: [{ id: "test", kind: "enforcement", outcome: "passed", notice: "ran locally: build-vm unreachable", costMs: 12 }],
  } }, false);
  expect(result).toContain("test: passed [enforcement] (ran locally: build-vm unreachable) (12 ms)");
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
  expect(skipped).toContain("Checks: 1 skipped.");
  expect(skipped).not.toContain("passed");
});

it("reports an undeclared request without calling it passed", () => {
  const empty = renderDeclaredChecks({ kind: "result", exitCode: 0, result: { status: "none declared", checks: [] } }, false);
  expect(empty).toBe("none declared\nChecks: none declared.\n");
  expect(empty).not.toContain("passed");
});

it("keeps a push's verification when no ref selected a check", () => {
  const result = renderDeclaredChecks({ kind: "result", exitCode: 0, result: {
    status: "completed", checks: [], verification: "Checks: no refs selected.",
    pushRefs: [{ ref: "refs/tags/review", outcome: "not selected", reason: "not the checked-out branch" }],
  } }, false);
  expect(result).toBe("refs/tags/review: not selected (not the checked-out branch)\nChecks: no refs selected.\n");
});

it("leads with failed checks before the other listed checks", () => {
  const result = renderDeclaredChecks({ kind: "result", exitCode: 1, result: {
    status: "completed", checks: [
      { id: "skip", kind: "enforcement", outcome: "skipped", reason: "ARC_SKIP" },
      { id: "failure", kind: "feedback", outcome: "failed", output: "diagnostic" },
    ],
  } }, false);
  expect(result.split("\n")[0]).toContain("failure: failed");
  expect(result.indexOf("failure: failed")).toBeLessThan(result.indexOf("skip: skipped"));
});

it("counts quiet checks once, and lists a pass that has more to say and a check the request did not cover", () => {
  const result = renderDeclaredChecks({ kind: "result", exitCode: 1, result: {
    status: "completed", checks: [
      { id: "lint", kind: "enforcement", outcome: "passed", costMs: 5 },
      { id: "types", kind: "enforcement", outcome: "reused" },
      { id: "shell", kind: "enforcement", outcome: "not selected", reason: "inputs unchanged" },
      { id: "e2e", kind: "enforcement", outcome: "not selected", reason: "CI-only check requires --ci" },
      { id: "remote", kind: "enforcement", outcome: "passed", notice: "ran on build-vm", costMs: 9 },
      { id: "format", kind: "enforcement", outcome: "passed", rewritten: ["src/a.ts"] },
      { id: "staged", kind: "enforcement", outcome: "passed", divergent: ["src/b.ts"] },
      { id: "test", kind: "feedback", outcome: "failed", output: "diagnostic" },
    ],
  } }, false);
  const lines = result.trimEnd().split("\n");
  expect(lines.filter(line => /^(lint|types|shell):/u.test(line))).toEqual([]);
  expect(lines.filter(line => /^(remote|format|staged):/u.test(line))).toHaveLength(3);
  expect(lines).toContain("e2e: not selected [enforcement] (CI-only check requires --ci)");
  expect(lines[0]).toContain("test: failed");
  expect(lines.at(-1)).toBe("Checks: 1 failed, 4 passed, 1 reused, 2 not selected.");
  expect(result.match(/\btest\b/gu)).toHaveLength(1);
});

it("shows the failed output tail and full-log path while counting successful checks", () => {
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
  expect(result.split("\n").filter(line => line.startsWith("success:"))).toHaveLength(0);
  expect(result.trimEnd().split("\n").at(-1)).toBe("Checks: 1 failed, 1 passed.");
});

it("shows a forecast's last measured cost without presenting it as a new execution", () => {
  const result = renderDeclaredChecks({ kind: "result", exitCode: 0, result: {
    status: "completed", checks: [{ id: "lint", kind: "enforcement", outcome: "would run", lastCostMs: 10,
      cwd: ".", mode: "project", shell: false, ciOnly: false, fixes: false, batches: [["lint"]] }],
  } }, false);
  expect(result).toContain("lint: would run");
  expect(result).toContain("last run: 10 ms");
});

it("lists every forecast row in a dry run, reused and unchanged ones included, with its last measured cost", () => {
  const forecast = { cwd: ".", mode: "project" as const, shell: false, ciOnly: false, fixes: false, batches: [["lint"]] };
  const result = renderDeclaredChecks({ kind: "result", exitCode: 0, result: {
    status: "completed", checks: [
      { id: "lint", kind: "enforcement", outcome: "would run", lastCostMs: 10, ...forecast },
      { id: "types", kind: "enforcement", outcome: "reused", lastCostMs: 20, ...forecast },
      { id: "shell", kind: "enforcement", outcome: "not selected", reason: "inputs unchanged", lastCostMs: 30, ...forecast },
    ],
  } }, false);
  expect(result).toContain("types: reused [enforcement] (last run: 20 ms)");
  expect(result).toContain("shell: not selected [enforcement] (inputs unchanged) (last run: 30 ms)");
  expect(result.trimEnd().split("\n").at(-1)).toBe("Checks: 1 would run, 1 reused, 1 not selected.");
});

it("warns once per record directory when passes could not be recorded for later gates", () => {
  const unavailable = { status: "unavailable", cause: "read-only-filesystem", directory: "/repo/.git/arc-checks" } as const;
  const result = renderDeclaredChecks({ kind: "result", exitCode: 0, result: {
    status: "completed", checks: [
      { id: "lint", kind: "enforcement", outcome: "passed", record: unavailable },
      { id: "test", kind: "enforcement", outcome: "passed", record: unavailable },
      { id: "types", kind: "enforcement", outcome: "passed", record: { status: "recorded" } },
      { id: "format", kind: "enforcement", outcome: "passed", record: { status: "not-recordable" } },
    ],
  } }, false);
  const lines = result.trimEnd().split("\n");
  expect(lines.filter(line => line.startsWith("warning:"))).toEqual([
    "warning: could not record passes in /repo/.git/arc-checks (read-only filesystem); later gates will run lint, test again",
  ]);
  expect(lines.at(-1)).toBe("Checks: 4 passed.");
});

it("warns without naming a directory when the record directory never resolved", () => {
  const result = renderDeclaredChecks({ kind: "result", exitCode: 0, result: {
    status: "completed", checks: [{ id: "lint", kind: "enforcement", outcome: "passed", record: { status: "unavailable", cause: "other" } }],
  } }, false);
  expect(result).toContain("warning: could not record passes; later gates will run lint again\n");
});

it("leads with a no-evidence check and shows its output tail, but offers no retry", () => {
  const result = renderDeclaredChecks({ kind: "result", exitCode: 1, result: {
    status: "completed", checks: [
      { id: "success", kind: "enforcement", outcome: "passed" },
      { id: "related", kind: "feedback", outcome: "no evidence", output: "No unit tests reach the changed files.",
        logPath: "/records/related.log", costMs: 30 },
    ],
  } }, false);
  expect(result.split("\n")[0]).toBe("related: no evidence [feedback] (30 ms); log: /records/related.log");
  expect(result).toContain("No unit tests reach the changed files.");
  expect(result).not.toContain("Retry:");
  expect(result).toContain("Checks: 1 no evidence, 1 passed.");
});

it("names the checked files a merge brought in unchanged between a failure's output and its retry", () => {
  const result = renderDeclaredChecks({ kind: "result", exitCode: 1, result: {
    status: "completed", checks: [{ id: "prose", kind: "enforcement", outcome: "failed", output: "docs/a.md:3: short line",
      mergedIn: ["docs/a.md", "docs/b.md"], remedy: "arc check run prose --range abc" }],
  } }, false);
  expect(result).toBe("prose: failed [enforcement]\ndocs/a.md:3: short line\n"
    + "Merged in unchanged (2 files): docs/a.md, docs/b.md\nRetry: arc check run prose --range abc\nChecks: 1 failed.\n");
});
