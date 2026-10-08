/** Focused root runtime needs, qualified reuse, and native refined selection. */
import { execa } from "execa";
import { access, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { readBuildQualification } from "../../src/lib/build-qualification.js";
import { makeFocusedVitestFixture, runFocusedTestFixture } from "../helpers/focused-vitest-fixture.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(async (root) => await rm(root, { recursive: true, force: true }))); });
const rootOperand = (tier: string): string => `packages/arc-framework/__tests__/${tier}`;
const localEnvironment = { CI: "", ARC_TEST_ALLOW_CONCURRENCY: "", ARC_E2E_SKIP_BUILD: "" };

async function makeFixture(preParse = false) {
  const fixture = await makeFocusedVitestFixture(preParse); roots.push(fixture.root);
  await execa("git", ["init", "-q"], { cwd: fixture.root });
  return fixture;
}

async function expectNoPreparation(fixture: Awaited<ReturnType<typeof makeFixture>>) {
  expect(await readFile(join(fixture.packageRoot, "dist/cli.js"), "utf8")).toContain("previous-live-runtime");
  for (const path of [join(fixture.packageRoot, ".config-loads"), join(fixture.packageRoot, ".arc-build.lock"),
    join(fixture.root, ".git/arc/test-suite/.local-heavy-tests.lock"), join(fixture.packageRoot, "dist/dev-build-stamp.json")]) {
    await expect(access(path)).rejects.toMatchObject({ code: "ENOENT" });
  }
}

it("executes unit-only files without preparation or either lease", async () => {
  const fixture = await makeFixture();
  await writeFile(join(fixture.packageRoot, "__tests__/unit/named.test.mjs"), `
import { it, expect } from "vitest";
import { existsSync } from "node:fs";
it("runs without owned runtime", () => {
  expect(existsSync(${JSON.stringify(join(fixture.packageRoot, ".arc-build.lock"))})).toBe(false);
  expect(existsSync(${JSON.stringify(join(fixture.root, ".git/arc/test-suite/.local-heavy-tests.lock"))})).toBe(false);
});
`);
  const result = await runFocusedTestFixture(fixture.root, [rootOperand("unit/named.test.mjs")], localEnvironment);
  expect(result, result.stderr).toMatchObject({ code: 0 });
  expect(result.stdout).toContain("1 passed");
  await expectNoPreparation(fixture);
}, 30_000);

it.each([["unit/named.test.mjs", "integration", "e2e"]])(
  "shares one owned generation and reuses it for root targets %j", async (...tiers) => {
    const fixture = await makeFixture();
    for (const tier of ["integration", "e2e"]) await writeFile(join(fixture.packageRoot, `__tests__/${tier}/runtime.test.mjs`), `
import { it, expect, inject, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
it("consumes the prepared native generation", async () => {
  expect(readFileSync(${JSON.stringify(join(fixture.packageRoot, "dist/cli.js"))}, "utf8")).toContain("new-native-runtime");
  expect(JSON.parse(readFileSync(${JSON.stringify(join(fixture.packageRoot, "dist/schemas/kernel.json"))}, "utf8"))).toHaveProperty("schemas");
  await vi.waitFor(() => {
    const cpu = JSON.parse(readFileSync(${JSON.stringify(join(fixture.root, ".git/arc/test-suite/.local-heavy-tests.lock"))}, "utf8"));
    expect(cpu.metadata.tier).toBe("focused");
  });
  expect(existsSync(${JSON.stringify(join(fixture.packageRoot, ".arc-build.lock"))})).toBe(true);
  const evidence = JSON.parse(readFileSync(${JSON.stringify(join(fixture.packageRoot, "dist/dev-build-stamp.json"))}, "utf8"));
  expect(inject("arcRuntimeBuild").generation).toBe(evidence.generation);
});
`);
    const args = tiers.map(rootOperand);
    const first = await runFocusedTestFixture(fixture.root, args, localEnvironment);
    expect(first, first.stderr).toMatchObject({ code: 0 });
    const qualification = readBuildQualification(fixture.packageRoot, "runtimeSchema");
    expect(qualification.status).toBe("qualified");
    if (qualification.status !== "qualified") throw new Error(qualification.reason);
    const events = (await readFile(fixture.events, "utf8")).split("\n").filter((line) => line.startsWith("{"))
      .map((line) => JSON.parse(line) as { stage: string; owned: boolean; generation: string });
    expect(events.map(({ stage }) => stage).sort()).toEqual(tiers.filter((tier) => tier !== "unit/named.test.mjs")
      .flatMap((tier) => [`${tier}:setup`, `${tier}:teardown`]).sort());
    for (const event of events) expect(event).toMatchObject({ owned: true, generation: qualification.evidence.generation });
    expect(await readFile(fixture.events, "utf8")).toContain("closing-owned:true:true");
    const counter = await readFile(join(fixture.packageRoot, ".config-loads"), "utf8");
    const second = await runFocusedTestFixture(fixture.root, args, localEnvironment);
    expect(second, second.stderr).toMatchObject({ code: 0 });
    const reused = readBuildQualification(fixture.packageRoot, "runtimeSchema");
    expect(reused.status === "qualified" && reused.evidence.generation).toBe(qualification.evidence.generation);
    expect(await readFile(join(fixture.packageRoot, ".config-loads"), "utf8")).toBe(counter);
    for (const path of [join(fixture.packageRoot, ".arc-build.lock"), join(fixture.root, ".git/arc/test-suite/.local-heavy-tests.lock")]) {
      await expect(access(path)).rejects.toMatchObject({ code: "ENOENT" });
    }
  }, 60_000,
);

it("fails unmatched runtime case names after required preparation despite native empty-run permission", async () => {
  const fixture = await makeFixture();
  const result = await runFocusedTestFixture(fixture.root, [rootOperand("integration"), "-t", "absent case", "--passWithNoTests"], localEnvironment);
  expect(result.code).toBe(1);
  expect(result.stderr).toContain("No test cases completed");
  expect(result.stderr).not.toContain("No configured test specifications");
  expect(readBuildQualification(fixture.packageRoot, "runtimeSchema").status).toBe("qualified");
  expect(await readFile(fixture.events, "utf8")).toContain('"stage":"integration:teardown"');
}, 30_000);

it("rejects a natively refined empty selection before ownership or preparation", async () => {
  const fixture = await makeFixture(true);
  const result = await runFocusedTestFixture(fixture.root, [rootOperand("integration"), "-t", "absent case", "--passWithNoTests"], localEnvironment);
  expect(result.code).toBe(1);
  await expectNoPreparation(fixture);
  expect(result.stderr).toContain("No configured test specifications");
  expect(await readFile(fixture.events, "utf8")).not.toContain("integration:setup");
}, 30_000);

it("retains initial operand eligibility when native cross-file only skips the heavy file", async () => {
  const fixture = await makeFixture(true);
  await writeFile(join(fixture.packageRoot, "__tests__/unit/named.test.mjs"),
    'import { it } from "vitest"; it.only("chosen unit case", () => { console.log("ONLY-UNIT-RAN"); });');
  const result = await runFocusedTestFixture(fixture.root, [rootOperand("unit/named.test.mjs"), rootOperand("integration"), "--allowOnly"], localEnvironment);
  expect(result, result.stderr).toMatchObject({ code: 0 });
  expect(result.stdout).toContain("ONLY-UNIT-RAN");
  expect(await readFile(fixture.events, "utf8")).not.toContain("integration:setup");
  await expectNoPreparation(fixture);
}, 30_000);
