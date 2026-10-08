/** Native completion distinguishes executed cases from collected skipped cases. */
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { makeVitestControllerFixture, runVitestControllerFixture } from "../helpers/vitest-controller-fixture.js";

it.each([
  ["dynamic skip", 'it("dynamic", (context) => context.skip());', []],
] as const)("rejects %s despite native empty-run success", async (_name, body, flags) => {
  const fixture = await makeVitestControllerFixture();
  try {
    await writeFile(join(fixture.packageRoot, "tests/unit-completion.test.mjs"),
      'import { it, describe } from "vitest"; ' + body);
    const result = await runVitestControllerFixture(fixture.packageRoot, ["unit", "--passWithNoTests", ...flags]);
    expect(result.code).toBe(1);
    expect(result.stdout + result.stderr).toContain("No test cases completed");
    expect(await readFile(fixture.events, "utf8")).toContain("closed");
  } finally { await rm(fixture.root, { recursive: true, force: true }); }
}, 30_000);

it.each([
  ["mixed passing", 'describe("outer", () => { it.skip("skipped", () => {}); describe("inner", () => it("passes", () => {})); });', 0, ""],
  ["completed failure", 'it("fails", () => { throw new Error("completed failure retained"); });', 1, "completed failure retained"],
  ["collection failure", 'throw new Error("collection failure retained");', 1, "collection failure retained"],
  ["setup failure", 'it("never starts", () => {});', 1, "setup failure retained"],
] as const)("preserves %s status and diagnostics", async (name, body, code, diagnostic) => {
  const fixture = await makeVitestControllerFixture();
  try {
    await writeFile(join(fixture.packageRoot, "tests/unit-completion.test.mjs"),
      'import { it, describe } from "vitest"; ' + body);
    if (name === "setup failure") await writeFile(join(fixture.packageRoot, "tests/unit-setup.mjs"),
      'export function setup() { throw new Error("setup failure retained"); }');
    const result = await runVitestControllerFixture(fixture.packageRoot, ["unit", "--passWithNoTests"]);
    expect(result.code).toBe(code);
    expect(result.stdout + result.stderr).toContain(diagnostic);
    expect(result.stdout + result.stderr).not.toContain("No test cases completed");
  } finally { await rm(fixture.root, { recursive: true, force: true }); }
}, 30_000);
