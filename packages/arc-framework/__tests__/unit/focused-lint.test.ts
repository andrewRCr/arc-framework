/** Real root ESLint targets retain native package-cwd behavior. */
import { access, rm } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { makeFocusedLintFixture, runFocusedLintFixture } from "../helpers/focused-lint-fixture.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(async (root) => await rm(root, { recursive: true, force: true }))); });
const target = "packages/arc-framework/src/targets/suppressed.ts";
interface NativeLintResult { filePath: string; errorCount: number; suppressedMessages: unknown[] }
function results(stdout: string): NativeLintResult[] { return JSON.parse(stdout) as NativeLintResult[]; }

it("normalizes a root file and retains its native package-relative suppression", async () => {
  const fixture = await makeFocusedLintFixture(); roots.push(fixture.root);
  const result = await runFocusedLintFixture(fixture.root, [target, "--", "--format", "json"]);
  expect(result, result.stderr).toMatchObject({ code: 0 });
  expect(results(result.stdout)).toMatchObject([{ filePath: join(fixture.packageRoot, "src/targets/suppressed.ts"), errorCount: 0,
    suppressedMessages: [{ ruleId: "no-unused-vars" }] }]);
}, 30_000);

it.each(["packages/arc-framework/src/targets", "packages/arc-framework/src/targets/*.ts"])(
  "selects native matches for root directory or glob %s and propagates lint failure", async (operand) => {
    const fixture = await makeFocusedLintFixture(); roots.push(fixture.root);
    const result = await runFocusedLintFixture(fixture.root, [operand, "--", "--format", "json"]);
    expect(result, result.stderr).toMatchObject({ code: 1 });
    expect(results(result.stdout).map(({ filePath }) => filePath).sort()).toEqual([
      join(fixture.packageRoot, "src/targets/failing.ts"), join(fixture.packageRoot, "src/targets/suppressed.ts"),
    ]);
  }, 30_000,
);

it.each([[], ["--", "--format", "json"]])("rejects an empty root-target span %j before loading ESLint", async (...args) => {
  const fixture = await makeFocusedLintFixture(); roots.push(fixture.root);
  const result = await runFocusedLintFixture(fixture.root, args);
  expect(result.code).toBe(1);
  await expect(access(fixture.counter)).rejects.toMatchObject({ code: "ENOENT" });
  expect(result.stderr).toContain("repository-relative lint target");
}, 30_000);

it("retains literal native option values and additional patterns in package cwd", async () => {
  const fixture = await makeFocusedLintFixture(); roots.push(fixture.root);
  const result = await runFocusedLintFixture(fixture.root, ["packages/arc-framework/src/targets/failing.ts", "--",
    "--config", "native values/alternate config.mjs", "--format", "json", "src/extra/*.ts"]);
  expect(result, result.stderr).toMatchObject({ code: 0 });
  expect(results(result.stdout).map(({ filePath, errorCount }) => ({ filePath, errorCount })).sort((a, b) => a.filePath.localeCompare(b.filePath)))
    .toEqual([{ filePath: join(fixture.packageRoot, "src/extra/additional.ts"), errorCount: 0 },
      { filePath: join(fixture.packageRoot, "src/targets/failing.ts"), errorCount: 0 }]);
}, 30_000);

it("retains native unmatched-pattern failure without adding implicit targets", async () => {
  const fixture = await makeFocusedLintFixture(); roots.push(fixture.root);
  const result = await runFocusedLintFixture(fixture.root, ["packages/arc-framework/src/missing/*.ts"]);
  expect(result.code).toBe(2);
  expect(result.stderr).toContain('No files matching');
  expect(result.stderr).toContain('"src/missing/*.ts"');
}, 30_000);
