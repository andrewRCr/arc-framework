/** Package-native line filters, exclusions, and shards retain configured discovery. */
import { execa } from "execa";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { makeFocusedVitestFixture } from "../helpers/focused-vitest-fixture.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(async (root) => await rm(root, { recursive: true, force: true }))); });
async function makeFixture() {
  const fixture = await makeFocusedVitestFixture(); roots.push(fixture.root);
  await writeFile(join(fixture.packageRoot, "__tests__/unit/native-line.test.mjs"),
    'import { it } from "vitest";\n'
    + 'it("first case", () => { console.log("FIRST-CASE-RAN"); });\n'
    + 'it("selected line", () => { console.log("LINE-CASE-RAN"); });\n');
  return fixture;
}
async function executePackage(root: string, args: string[]) {
  return await execa("npm", ["run", "-s", "test:unit", "-w", "packages/arc-framework", "--", ...args],
    { cwd: root, reject: false, timeout: 30_000 });
}

it("selects the requested case through a real package npm file:line filter", async () => {
  const fixture = await makeFixture();
  const result = await executePackage(fixture.root, ["__tests__/unit/native-line.test.mjs:3"]);
  expect(result, result.stderr).toMatchObject({ exitCode: 0 });
  expect(result.stdout).toContain("LINE-CASE-RAN");
  expect(result.stdout).not.toContain("FIRST-CASE-RAN");
  expect(result.stdout).toContain("1 passed");
}, 30_000);

it("preserves native rejection when location support is explicitly disabled", async () => {
  const fixture = await makeFixture();
  const result = await executePackage(fixture.root, ["__tests__/unit/native-line.test.mjs:3", "--includeTaskLocation=false"]);
  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("includeTaskLocation");
  expect(await readFile(fixture.events, "utf8")).not.toContain("unit-setup");
}, 30_000);

it("retains repeated CLI excludes and configured exclusions through native sharding", async () => {
  const fixture = await makeFixture();
  const unit = join(fixture.packageRoot, "__tests__/unit");
  for (const file of ["named.test.mjs", "native-line.test.mjs"]) await writeFile(join(unit, file),
    `import { it } from "vitest"; it("retained file", () => { console.log(${JSON.stringify(`RETAINED:${file}`)}); });`);
  for (const file of ["named.test.mjs-adjacent.test.mjs", "excluded.test.mjs", "dir/included.test.mjs", "dir-adjacent/sibling.test.mjs"]) {
    await writeFile(join(unit, file), 'import { it } from "vitest"; it("excluded file", () => { throw new Error("excluded file executed"); });');
  }
  const outputs: string[] = [];
  for (const shard of ["1/2", "2/2"]) {
    const result = await executePackage(fixture.root, ["--exclude", "**/*-adjacent.test.mjs", "--exclude", "**/dir*/**", "--shard", shard]);
    expect(result, result.stderr).toMatchObject({ exitCode: 0 });
    outputs.push(result.stdout);
  }
  const combined = outputs.join("\n");
  for (const file of ["named.test.mjs", "native-line.test.mjs"]) expect(combined.split(`RETAINED:${file}`)).toHaveLength(2);
}, 60_000);

it("preserves native excessive-shard diagnostics instead of reporting empty completion", async () => {
  const fixture = await makeFixture();
  const result = await executePackage(fixture.root, ["__tests__/unit/native-line.test.mjs", "--shard", "2/2", "--passWithNoTests=false"]);
  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("Resolved 1 test files for --shard=2/2");
  expect(result.stderr).not.toContain("No test cases completed");
}, 30_000);

it("rejects an empty executed native shard despite native empty-success permission", async () => {
  const fixture = await makeFixture();
  const result = await executePackage(fixture.root, ["__tests__/unit/native-line.test.mjs", "--shard", "2/2", "--passWithNoTests"]);
  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("No test cases completed");
  expect(result.stdout).not.toContain("LINE-CASE-RAN");
}, 30_000);
