/** Supplied source paths select related configured unit projects without a Git-diff selector. */
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { makeFocusedVitestFixture } from "../helpers/focused-vitest-fixture.js";
import { runVitestControllerFixture } from "../helpers/vitest-controller-fixture.js";
import { gitExec } from "../../src/lib/io-context.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

async function fixture() {
  const result = await makeFocusedVitestFixture();
  roots.push(result.root);
  await writeFile(join(result.packageRoot, "src/related-fixture.mjs"), "export const value = 42;\n");
  await writeFile(join(result.packageRoot, "src/unrelated-fixture.mjs"), "export const other = true;\n");
  await writeFile(join(result.packageRoot, "__tests__/unit/named.test.mjs"),
    'import { it, expect } from "vitest"; import { value } from "../../src/related-fixture.mjs";\n'
    + 'it("related unit", () => { expect(value).toBe(42); console.log("RELATED-UNIT-RAN"); });\n');
  await mkdir(join(result.packageRoot, "__tests__/unit/mocks"), { recursive: true });
  await writeFile(join(result.packageRoot, "__tests__/unit/mocks/related.test.mjs"),
    'import { it, expect } from "vitest"; import { value } from "../../../src/related-fixture.mjs";\n'
    + 'it("related mock", () => { expect(value).toBe(42); console.log("RELATED-MOCK-RAN"); });\n');
  await writeFile(join(result.packageRoot, "__tests__/unit/named.test.mjs-adjacent.test.mjs"),
    'import { it } from "vitest"; it("unrelated unit", () => { throw new Error("UNRELATED-UNIT-RAN"); });\n');
  for (const args of [["init", "-b", "main"], ["add", "-A"],
    ["-c", "user.email=test@example.com", "-c", "user.name=Test", "commit", "-qm", "fixture"]]) {
    await gitExec("git", args, { cwd: result.root });
  }
  return result;
}

it("runs both related unit projects for a supplied source despite a clean Git diff", async () => {
  const setup = await fixture();
  const result = await runVitestControllerFixture(setup.packageRoot, ["changed", "src/related-fixture.mjs"]);
  expect(result.code, result.stdout + result.stderr).toBe(0);
  expect(result.stdout).toContain("RELATED-UNIT-RAN");
  expect(result.stdout).toContain("RELATED-MOCK-RAN");
  expect(result.stdout + result.stderr).not.toContain("UNRELATED-UNIT-RAN");
  expect(result.stdout).toContain("2 passed");
}, 30_000);

it("refuses an empty related selection before executing either configured unit project", async () => {
  const setup = await fixture();
  const result = await runVitestControllerFixture(setup.packageRoot, ["changed", "src/unrelated-fixture.mjs"]);
  expect(result.code).toBe(1);
  expect(result.stderr).toContain("No configured test specifications match the selection");
  expect(result.stdout).not.toContain("RELATED-UNIT-RAN");
  expect(result.stdout).not.toContain("RELATED-MOCK-RAN");
}, 30_000);
