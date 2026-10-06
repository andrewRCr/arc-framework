/** Real root npm focused execution with configured native worker behavior. */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { makeFocusedVitestFixture, runFocusedTestFixture } from "../helpers/focused-vitest-fixture.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(async (root) => await rm(root, { recursive: true, force: true }))); });
const operand = "packages/arc-framework/__tests__/unit/named.test.mjs";

it("runs only the literal named case through the real root npm separator in package cwd", async () => {
  const fixture = await makeFocusedVitestFixture(); roots.push(fixture.root);
  await writeFile(join(fixture.packageRoot, "__tests__/unit/named.test.mjs"), `
import { it, expect } from "vitest";
it("accepts literal -- hyphen value", () => {
  expect(process.cwd()).toBe(${JSON.stringify(fixture.packageRoot)});
  console.log("ROOT-FOCUSED-CASE-RAN");
});
it("other case", () => { throw new Error("unselected case executed"); });
`);
  await writeFile(join(fixture.packageRoot, "__tests__/unit/named.test.mjs-adjacent.test.mjs"),
    'import { it } from "vitest"; it("accepts literal -- hyphen value", () => { throw new Error("adjacent file executed"); });');
  const result = await runFocusedTestFixture(fixture.root, [operand, "-t", "accepts literal -- hyphen value"]);
  expect(result, result.stderr).toMatchObject({ code: 0 });
  expect(result.stdout).toContain("ROOT-FOCUSED-CASE-RAN");
  expect(result.stdout).toContain("1 passed");
  expect(await readFile(fixture.events, "utf8")).toContain("config:true:true:test");
}, 30_000);

it("keeps configured mock isolation and lets explicit no-isolate override it", async () => {
  const fixture = await makeFocusedVitestFixture(); roots.push(fixture.root);
  const directory = join(fixture.packageRoot, "__tests__/unit/mocks");
  await mkdir(directory);
  for (const file of ["first", "second"]) await writeFile(join(directory, `${file}.test.mjs`), `
import { it, expect } from "vitest";
it("starts with an isolated global", () => {
  expect(globalThis.focusedIsolationMarker).toBeUndefined();
  globalThis.focusedIsolationMarker = "written";
});
`);
  const args = ["packages/arc-framework/__tests__/unit/mocks", "--maxWorkers", "1"];
  const defaults = await runFocusedTestFixture(fixture.root, args);
  expect(defaults, defaults.stderr).toMatchObject({ code: 0 });
  expect(defaults.stdout).toContain("2 passed");
  const overridden = await runFocusedTestFixture(fixture.root, [...args, "--no-isolate"]);
  expect(overridden.code).toBe(1);
  expect(overridden.stderr).toContain("to be undefined");
}, 30_000);

it("uses explicit thread pools, two workers, and parallel files over configured defaults", async () => {
  const fixture = await makeFocusedVitestFixture(); roots.push(fixture.root);
  const directory = join(fixture.packageRoot, "__tests__/unit/parallel");
  await mkdir(directory);
  for (const [file, other] of [["first", "second"], ["second", "first"]]) await writeFile(join(directory, `${file}.test.mjs`), `
import { it, expect } from "vitest";
import { isMainThread } from "node:worker_threads";
import { existsSync, writeFileSync } from "node:fs";
it("runs concurrently in native threads", async () => {
  expect(isMainThread).toBe(false);
  writeFileSync(${JSON.stringify(join(directory, `${file}.ready`))}, "ready");
  const deadline = Date.now() + 2000;
  while (!existsSync(${JSON.stringify(join(directory, `${other}.ready`))}) && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  expect(existsSync(${JSON.stringify(join(directory, `${other}.ready`))})).toBe(true);
});
`);
  const result = await runFocusedTestFixture(fixture.root, ["packages/arc-framework/__tests__/unit/parallel",
    "--pool", "threads", "--maxWorkers", "2", "--fileParallelism"], { VITEST_MAX_WORKERS: undefined });
  expect(result, result.stderr).toMatchObject({ code: 0 });
  expect(result.stdout).toContain("2 passed");
}, 30_000);

it("serializes native files when explicitly disabling file parallelism", async () => {
  const fixture = await makeFocusedVitestFixture(); roots.push(fixture.root);
  const configuration = join(fixture.packageRoot, "vitest.config.ts");
  await writeFile(configuration, (await readFile(configuration, "utf8")).replace('fileParallelism: false', 'fileParallelism: true'));
  const directory = join(fixture.packageRoot, "__tests__/unit/serial");
  await mkdir(directory);
  for (const file of ["first", "second"]) await writeFile(join(directory, `${file}.test.mjs`), `
import { it } from "vitest";
import { writeFileSync, rmSync } from "node:fs";
it("holds exclusive file execution", async () => {
  writeFileSync(${JSON.stringify(join(directory, "active"))}, "active", { flag: "wx" });
  try { await new Promise(resolve => setTimeout(resolve, 300)); }
  finally { rmSync(${JSON.stringify(join(directory, "active"))}); }
});
`);
  const result = await runFocusedTestFixture(fixture.root, ["packages/arc-framework/__tests__/unit/serial",
    "--maxWorkers", "2", "--no-file-parallelism"]);
  expect(result, result.stderr).toMatchObject({ code: 0 });
  expect(result.stdout).toContain("2 passed");
}, 30_000);
