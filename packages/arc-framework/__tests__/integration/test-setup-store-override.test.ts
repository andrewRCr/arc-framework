/** The test setups keep the in-repo store override a parent environment sets from every worker and spawned process. */
import { execFileSync } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { stripVTControlCharacters } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeVitestRuntimeFixture } from "../helpers/vitest-runtime-fixture.js";
import { runVitestControllerFixture } from "../helpers/vitest-controller-fixture.js";
import { copyLiveDependencies } from "../helpers/copy-live-dependencies.js";
import { nestedRunLimit } from "../helpers/call-limit.js";
import { IN_REPO_STORE_OVERRIDE } from "../../src/lib/store/selection.js";
import { useInRepoStore, useInRepoStoreForEach, withInRepoStore, withoutInRepoStore } from "../helpers/in-repo-store-override.js";
import { syncFixture, syncInbox } from "../helpers/store/sync-fixture.js";

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

function childOverride(): string | null {
  return JSON.parse(execFileSync(process.execPath, [
    "-e", "process.stdout.write(JSON.stringify(process.env.ARC_IN_REPO_STORE ?? null))",
  ], { encoding: "utf8" }));
}

it("leaves the override unset in the integration worker", () => {
  expect(process.env[IN_REPO_STORE_OVERRIDE]).toBeUndefined();
});

it("uses the default store for the sync fixture and leaves the override unset in child processes", async () => {
  const { a, b } = await syncFixture();
  expect(a.store.capabilities.stateOffBranch).toBe(true);
  expect(b.store.capabilities.stateOffBranch).toBe(true);
  const content = "# User Inbox\n\nFixture content.\n";
  await a.inbox(content);
  expect(await a.store.read({ reference: syncInbox })).toMatchObject({ status: "ok", result: { content } });
  expect(process.env[IN_REPO_STORE_OVERRIDE]).toBeUndefined();
  expect(childOverride()).toBeNull();
});

describe.each([undefined, "", "previous"])("nested overrides with a previous value of %j", (previous) => {
  beforeAll(() => {
    if (previous !== undefined) process.env[IN_REPO_STORE_OVERRIDE] = previous;
  });
  afterAll(() => { Reflect.deleteProperty(process.env, IN_REPO_STORE_OVERRIDE); });

  describe("file-style override", () => {
    useInRepoStoreForEach();

    describe("nested suite override", () => {
      useInRepoStoreForEach();

      it("supports test and operation overrides within the suite", async () => {
        useInRepoStore();
        useInRepoStore();
        await withoutInRepoStore(async () => {
          expect(process.env[IN_REPO_STORE_OVERRIDE]).toBeUndefined();
          await withInRepoStore(async () => { expect(process.env[IN_REPO_STORE_OVERRIDE]).toBe("1"); });
          expect(process.env[IN_REPO_STORE_OVERRIDE]).toBeUndefined();
        });
        expect(process.env[IN_REPO_STORE_OVERRIDE]).toBe("1");
      });
    });
  });

  it("keeps a test override started inside a finished operation", async () => {
    await withoutInRepoStore(async () => {
      await withInRepoStore(async () => { useInRepoStore(); });
    });
    expect(process.env[IN_REPO_STORE_OVERRIDE]).toBe("1");
  });

  it("restores the previous value for the next test and its child", () => {
    expect(process.env[IN_REPO_STORE_OVERRIDE]).toBe(previous);
    expect(childOverride()).toBe(previous ?? null);
  });
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
