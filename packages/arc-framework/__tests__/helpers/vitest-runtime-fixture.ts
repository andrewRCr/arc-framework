/** Native integration/E2E setup fixtures with observable artifact consumption and teardown. */
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { makeVitestControllerFixture } from "./vitest-controller-fixture.js";

/**
 * Compose the actual global setups with two disposable artifact-consuming projects.
 * @returns Caller-owned checkout and semantic event log
 */
export async function makeVitestRuntimeFixture(): Promise<Awaited<ReturnType<typeof makeVitestControllerFixture>>> {
  const fixture = await makeVitestControllerFixture();
  const sourcePackage = resolve(import.meta.dirname, "../..");
  const configurationPath = join(fixture.packageRoot, "vitest.config.mjs");
  const configuration = await readFile(configurationPath, "utf8");
  await writeFile(configurationPath, configuration.replace(
    'globalSetup: ["tests/integration-setup.mjs"] } }',
    'globalSetup: ["tests/integration-setup.mjs"] } },\n'
      + '      { test: { name: "e2e", root: import.meta.dirname, include: ["tests/e2e*.test.mjs"],\n'
      + '        globalSetup: ["tests/e2e-setup.mjs"] } }'));
  for (const tier of ["integration", "e2e"]) {
    const setupRoot = join(fixture.packageRoot, "__tests__", tier);
    await mkdir(setupRoot, { recursive: true });
    await cp(join(sourcePackage, "__tests__", tier, "global-setup.ts"), join(setupRoot, "global-setup.ts"));
    await writeFile(join(fixture.packageRoot, "tests", `${tier}-setup.mjs`), `
import { setup as runtimeSetup } from "../__tests__/${tier}/global-setup.ts";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
const packageRoot = join(import.meta.dirname, "..");
function observe(stage) {
  const evidence = JSON.parse(readFileSync(join(packageRoot, "dist/dev-build-stamp.json"), "utf8"));
  appendFileSync(${JSON.stringify(fixture.events)}, JSON.stringify({ stage: "${tier}:" + stage,
    generation: evidence.generation, owned: existsSync(join(packageRoot, ".arc-build.lock")) }) + "\\n");
}
export async function setup(project) {
  await runtimeSetup(project);
  observe("setup");
  return () => observe("teardown");
}
`);
    await writeFile(join(fixture.packageRoot, "tests", `${tier}-runtime.test.mjs`), `
import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
it("consumes qualified runtime and schema", () => {
  expect(readFileSync(join(import.meta.dirname, "../dist/cli.js"), "utf8")).toContain("new-native-runtime");
  expect(JSON.parse(readFileSync(join(import.meta.dirname, "../dist/schemas/kernel.json"), "utf8"))).toHaveProperty("schemas");
});
`);
  }
  return fixture;
}
