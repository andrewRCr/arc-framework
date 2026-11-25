/** Remaining npm run-mode entries enforce the shared native completion contract. */
import { execa } from "execa";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { makeFocusedVitestFixture } from "../helpers/focused-vitest-fixture.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(async (root) => await rm(root, { recursive: true, force: true }))); });
it.each(["test:unit", "test:changed", "test:portability:macos"])(
  "rejects an all-skipped native selection through real root %s", async (command) => {
    const fixture = await makeFocusedVitestFixture(); roots.push(fixture.root);
    const test = join(fixture.packageRoot, "__tests__/unit/rename.test.mjs");
    await writeFile(test, 'import { it } from "vitest"; it.skip("unfinished native case", () => {});');
    if (command === "test:changed") {
      await execa("git", ["init", "-q", "-b", "main"], { cwd: fixture.root });
      await execa("git", ["add", "."], { cwd: fixture.root });
      await execa("git", ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "commit", "-qm", "baseline"],
        { cwd: fixture.root });
      await writeFile(test, 'import { it } from "vitest"; it.skip("changed unfinished native case", () => {});');
    }
    const operand = command === "test:changed" ? "__tests__/unit/rename.test.mjs" : "rename.test.mjs";
    const result = await execa("npm", ["run", "-s", command, "--", operand],
      { cwd: fixture.root, reject: false, timeout: 30_000, maxBuffer: 16 * 1024 * 1024 });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("No test cases completed");
    expect(await readFile(fixture.events, "utf8")).toContain("closed");
  }, 60_000,
);

it.each(["test:unit"])("retains literal native root options for %s", async (command) => {
  const fixture = await makeFocusedVitestFixture(); roots.push(fixture.root);
  await writeFile(join(fixture.packageRoot, "__tests__/unit/named.test.mjs"), `
import { it } from "vitest";
it("selected -- literal value", () => { console.log("NATIVE-TIER-CASE-RAN"); });
it("unselected case", () => { throw new Error("name filter was lost"); });
`);
  const result = await execa("npm", ["run", "-s", command, "--", "__tests__/unit/named.test.mjs", "-t", "selected -- literal value"],
    { cwd: fixture.root, reject: false, timeout: 30_000 });
  expect(result, result.stderr).toMatchObject({ exitCode: 0 });
  expect(result.stdout).toContain("NATIVE-TIER-CASE-RAN");
  expect(result.stdout).toContain("1 passed");
}, 30_000);
