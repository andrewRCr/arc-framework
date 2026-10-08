/** Direct run-mode policies preserve configured membership, execution, and failure semantics. */
import { expect, it } from "vitest";
import type { TestResult } from "vitest/node";
import { normalizeVitestOptions } from "../../src/lib/vitest-discovery.js";
import { checkVitestCompletion } from "../../src/lib/vitest-completion.js";
import { localVitestTierArguments } from "../../src/lib/local-vitest-runner.js";
import { requirePreparedRuntimeBuild, validateRuntimeBuildEvidence } from "../../src/lib/build-runtime-setup.js";

it("normalizes run-mode exclusions without retaining a CLI-only exclude field", () => {
  expect(normalizeVitestOptions([], { run: true, watch: true, exclude: ["ignored"], maxWorkers: 2 }))
    .toEqual({ run: true, watch: false, cliExclude: ["ignored"], maxWorkers: 2 });
});
it("enables task locations for line filters while preserving an explicit override", () => {
  expect(normalizeVitestOptions(["case.test.ts:4"], {})).toMatchObject({ includeTaskLocation: true });
  expect(normalizeVitestOptions(["case.test.ts:4"], { includeTaskLocation: false }))
    .toMatchObject({ includeTaskLocation: false });
  expect(normalizeVitestOptions(["case.test.ts"], { watch: true })).toEqual({ watch: true });
});

const tiers = [
  ["full", []],
  ["unit", ["--project", "unit", "--project", "unit-mocks"]],
  ["changed", ["--changed=main", "--project", "unit", "--project", "unit-mocks", "--passWithNoTests=false"]],
  ["lane", ["--project", "unit", "--project", "unit-mocks", "--project", "integration"]],
  ["integration", ["--project", "integration"]],
  ["arc-contracts", ["--project", "integration", "framework-sync", "live-transition-records",
    "pr-open-extensions", "review-gate-workflows"]],
  ["e2e", ["--project", "e2e"]],
  ["e2e-focused", ["--project", "e2e"]],
  ["portability-macos", ["anchored-sequence", "git-identity", "locus-errand-roundtrip", "rename"]],
] as const;
it.each(tiers)("selects configured tier %s", (tier, args) => {
  expect(localVitestTierArguments(tier)).toEqual(args);
});
it("retains each native portability boundary on the portability tier", () => {
  expect(localVitestTierArguments("portability")).toEqual([
    "fs.test.ts", "build-context.test.ts", "build-cancellation.test.ts", "build-generation-lifetime.test.ts",
    "build-coordinator.test.ts", "build-publication.test.ts", "build-inventory.test.ts", "build-ownership.test.ts",
    "ci-build-transfer.test.ts", "ci-build-recovery.test.ts", "local-test-admission.test.ts", "worktree-marker.test.ts",
    "commit-message-retry-store.test.ts", "advisory-lock", "user-sync-notes-lock", "ref-tree-cas", "state-ref-race.e2e",
    "git-executor", "delivery-transfer.e2e",
  ]);
});

type Completion = Parameters<typeof checkVitestCompletion>[0];
function caseResult(state: TestResult["state"]): TestResult {
  if (state === "skipped") return { state, errors: undefined, note: undefined };
  if (state === "failed") return { state, errors: [{ name: "Error", message: "completed failure" }] };
  return { state, errors: undefined };
}
function completion(states: TestResult["state"][], fault?: string): Completion {
  return {
    unhandledErrors: fault === "unhandled" ? [{ name: "Error", message: "native worker error" }] : [],
    testModules: [{
      ok: () => fault !== "module",
      errors: () => fault === "collection" ? [{ name: "Error", message: "collection error" }] : [],
      children: { allTests: () => states.map((state) => ({ result: () => caseResult(state) })) },
    }],
  };
}
it.each(["module", "collection", "unhandled"])("retains a %s failure through completion", (fault) => {
  const previous = process.exitCode;
  try {
    process.exitCode = 0;
    checkVitestCompletion(completion(["passed"], fault), { error: () => {} });
    expect(process.exitCode).toBe(1);
  } finally { process.exitCode = previous; }
});
it("refuses a completed run with no executed cases and preserves an existing status", () => {
  const previous = process.exitCode;
  const diagnostics: string[] = [];
  try {
    process.exitCode = 0;
    checkVitestCompletion(completion(["pending", "skipped"]), { error: (...values: unknown[]) => { diagnostics.push(values.map(String).join(" ")); } });
    expect(process.exitCode).toBe(1);
    expect(diagnostics.join("\n")).toContain("No test cases completed");
    process.exitCode = 42;
    checkVitestCompletion(completion([]), { error: () => { throw new Error("Existing status replaced"); } });
    expect(process.exitCode).toBe(42);
  } finally { process.exitCode = previous; }
});
it("accepts completed cases without changing a clean process status", () => {
  const previous = process.exitCode;
  try {
    process.exitCode = 0;
    checkVitestCompletion(completion(["passed"]), { error: () => { throw new Error("Unexpected refusal"); } });
    expect(process.exitCode).toBe(0);
  } finally { process.exitCode = previous; }
});
it("refuses malformed supplied evidence before examining absent output", () => {
  expect(() => validateRuntimeBuildEvidence("absent-runtime-output", {})).toThrow("evidence is malformed");
});
it("refuses a missing controller key before examining absent output", () => {
  expect(() => requirePreparedRuntimeBuild("absent-runtime-output", {})).toThrow("did not provide");
});
