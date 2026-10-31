/** The native configuration preserves empty groups alongside completed cases. */
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { afterEach, expect, it } from "vitest";
import { copyLiveDependencies } from "../helpers/copy-live-dependencies.js";
import { makeVitestControllerFixture, runVitestControllerFixture } from "../helpers/vitest-controller-fixture.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

it("accepts an empty group beside an executed case under the actual native config", async () => {
  const fixture = await makeVitestControllerFixture();
  roots.push(fixture.root);
  await copyLiveDependencies(resolve(import.meta.dirname, "../.."), fixture.packageRoot, [
    "vitest.config.ts",
    "__tests__/helpers/unit-process-runner.ts",
    "__tests__/helpers/unit-setup.ts",
    "__tests__/fixtures/git/global.gitconfig",
  ]);
  await rm(join(fixture.packageRoot, "vitest.config.mjs"));
  await mkdir(join(fixture.packageRoot, "__tests__/unit"), { recursive: true });
  await writeFile(join(fixture.packageRoot, "__tests__/unit/empty-group.test.ts"),
    'import { describe, it } from "vitest";\n'
    + 'describe("partition without cases", () => {});\n'
    + 'it("completed case", () => {});\n');

  const result = await runVitestControllerFixture(fixture.packageRoot, ["unit"], { FORCE_COLOR: undefined });
  expect(result.code, result.stdout + result.stderr).toBe(0);
  expect(result.stdout).toMatch(/Tests\s+1 passed/);
}, 60_000);
