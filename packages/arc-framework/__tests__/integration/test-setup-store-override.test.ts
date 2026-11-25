/** The test setups keep the in-repo store override a parent environment sets from every worker and spawned process. */
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { stripVTControlCharacters } from "node:util";
import { expect, it } from "vitest";
import { makeVitestRuntimeFixture } from "../helpers/vitest-runtime-fixture.js";
import { runVitestControllerFixture } from "../helpers/vitest-controller-fixture.js";
import { copyLiveDependencies } from "../helpers/copy-live-dependencies.js";
import { nestedRunLimit } from "../helpers/call-limit.js";
import { IN_REPO_STORE_OVERRIDE } from "../../src/lib/store/selection.js";

const spawnedObservation = `
import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";
it("leaves the override to neither the worker nor a process it spawns", () => {
  expect(process.env.ARC_IN_REPO_STORE).toBeUndefined();
  expect(execFileSync(process.execPath, ["-e", "process.stdout.write(process.env.ARC_IN_REPO_STORE ?? 'unset')"],
    { encoding: "utf8" })).toBe("unset");
});
`;

const workerObservation = `
import { expect, it } from "vitest";
it("leaves the override to no unit worker", () => { expect(process.env.ARC_IN_REPO_STORE).toBeUndefined(); });
`;

it("leaves the override unset in the integration worker", () => {
  expect(process.env[IN_REPO_STORE_OVERRIDE]).toBeUndefined();
});

it.each(["unit", "integration", "e2e"])("clears the inherited override when only %s runs", async (tier) => {
  const fixture = await makeVitestRuntimeFixture();
  try {
    const sourcePackage = join(import.meta.dirname, "../..");
    await copyLiveDependencies(sourcePackage, fixture.packageRoot, ["__tests__/helpers/unit-setup.ts"]);
    const configuration = join(fixture.packageRoot, "vitest.config.mjs");
    await writeFile(configuration, (await readFile(configuration, "utf8")).replace(
      'globalSetup: ["tests/unit-setup.mjs"] } }',
      'globalSetup: ["tests/unit-setup.mjs"], setupFiles: ["__tests__/helpers/unit-setup.ts"] } }'));
    await writeFile(join(fixture.packageRoot, "tests", `${tier}-override.test.mjs`),
      tier === "unit" ? workerObservation : spawnedObservation);
    const result = await runVitestControllerFixture(fixture.packageRoot, ["run", "--project", tier, "override"],
      { ARC_IN_REPO_STORE: "1", ARC_E2E_SKIP_BUILD: undefined, FORCE_COLOR: undefined }, "native");
    expect(result.code, stripVTControlCharacters(result.stdout + result.stderr)).toBe(0);
    expect(stripVTControlCharacters(result.stdout)).toMatch(/Tests\s+1 passed \(1\)/u);
  } finally { await rm(fixture.root, { recursive: true, force: true }); }
}, nestedRunLimit(60_000));
