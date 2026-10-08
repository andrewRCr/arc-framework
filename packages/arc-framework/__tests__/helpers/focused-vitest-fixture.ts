/** Disposable fixed-package projects for root-operand discovery and execution. */
import { execa } from "execa";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { makeVitestRuntimeFixture } from "./vitest-runtime-fixture.js";

/**
 * Create eligible, adjacent, excluded, unconfigured, and empty root operands.
 * @param preParse - Configured native pre-parsing switch
 * @returns Caller-owned configured checkout and observable setup log
 */
export async function makeFocusedVitestFixture(preParse = false): Promise<Awaited<ReturnType<typeof makeVitestRuntimeFixture>>> {
  const fixture = await makeVitestRuntimeFixture(preParse);
  const files = ["unit/named.test.mjs", "unit/named.test.mjs-adjacent.test.mjs", "unit/dir/included.test.mjs",
    "unit/dir-adjacent/sibling.test.mjs", "unit/excluded.test.mjs", "unit/helper.mjs",
    "integration/runtime.test.mjs", "e2e/runtime.test.mjs"];
  for (const file of files) {
    const path = join(fixture.packageRoot, "__tests__", file);
    await mkdir(join(path, ".."), { recursive: true });
    await writeFile(path, 'import { it } from "vitest"; it("configured case", () => {});');
  }
  await mkdir(join(fixture.packageRoot, "__tests__/unit/empty"));
  const old = join(fixture.packageRoot, "vitest.config.mjs");
  const config = (await readFile(old, "utf8"))
    .replace('import { appendFileSync }', 'import { appendFileSync, existsSync }')
    .replace('closeBundle() {', `closeBundle() { appendFileSync(events, "closing-owned:" + existsSync(${JSON.stringify(join(fixture.packageRoot, ".arc-build.lock"))})
      + ":" + existsSync(${JSON.stringify(join(fixture.root, ".git/arc/test-suite/.local-heavy-tests.lock"))}) + "\\n");`)
    .replace('watch: false, maxWorkers: 1,', 'watch: false, maxWorkers: 1, pool: "forks", fileParallelism: false,')
    .replace('["tests/unit*.test.mjs"]', '["__tests__/unit/**/*.test.mjs"], isolate: false, exclude: ["**/excluded.test.mjs", "**/mocks/**"]')
    .replace('{ test: { name: "integration",', '{ test: { name: "unit-mocks", root: import.meta.dirname, include: ["__tests__/unit/mocks/**/*.test.mjs"], isolate: true } },\n'
      + '      { test: { name: "integration",')
    .replace('["tests/integration*.test.mjs"]', '["__tests__/integration/**/*.test.mjs"]')
    .replace('["tests/e2e*.test.mjs"]', '["__tests__/e2e/**/*.test.mjs"]');
  await writeFile(join(fixture.packageRoot, "vitest.config.ts"), config);
  await rm(old);
  await writeFile(join(fixture.packageRoot, "tests/focused-discovery.mjs"), `
import { relative } from "node:path";
import { parseFocusedTestInput } from "../src/lib/focused-test-input.ts";
import { discoverFocusedVitestSelection } from "../src/lib/focused-test-selection.ts";
import { closeVitestController } from "../src/lib/vitest-closing.ts";
try {
  const input = parseFocusedTestInput(${JSON.stringify(fixture.root)}, process.argv.slice(2));
  const selected = await discoverFocusedVitestSelection(input);
  try {
    console.log("SELECTION:" + JSON.stringify(selected.specifications
      .map(spec => relative(input.packageRoot, spec.moduleId).replaceAll("\\\\", "/")).sort()));
    console.log("RUNTIME:" + String(selected.requiresRuntime));
  } finally { await closeVitestController(selected.controller); }
} catch (error) { console.error(error); process.exitCode = 1; }
`);
  return fixture;
}

/**
 * Run discovery through the actual public controller without executing workers or setups.
 * @param packageRoot - Fixed fixture package cwd
 * @param args - Explicit root operands plus native options
 * @returns Native status and process diagnostics
 */
export async function runFocusedDiscoveryFixture(
  packageRoot: string, args: string[],
): Promise<{ code: number; stdout: string; stderr: string }> {
  const result = await execa(process.execPath, ["--import", "tsx", "tests/focused-discovery.mjs", ...args],
    { cwd: packageRoot, reject: false, timeout: 30_000, maxBuffer: 16 * 1024 * 1024 });
  return { code: result.exitCode ?? 1, stdout: result.stdout, stderr: result.stderr };
}

/**
 * Execute the real root npm focused command with its ordinary separator.
 * @param root - Fixture checkout root
 * @param args - Repository-relative operands and native options
 * @param environment - Explicit process environment changes
 * @returns Native status and complete diagnostics
 */
export async function runFocusedTestFixture(
  root: string, args: string[], environment: NodeJS.ProcessEnv = {},
): Promise<{ code: number; stdout: string; stderr: string }> {
  const result = await execa("npm", ["run", "-s", "test:file", "--", ...args],
    { cwd: root, env: { VITEST_MAX_WORKERS: undefined, ...environment }, reject: false, timeout: 30_000, maxBuffer: 16 * 1024 * 1024 });
  return { code: result.exitCode ?? 1, stdout: result.stdout, stderr: result.stderr };
}
