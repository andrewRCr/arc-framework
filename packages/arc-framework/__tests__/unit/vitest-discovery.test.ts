/** Discovery decisions use the public controller boundary before native execution. */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { discoverVitestSelection } from "../../src/lib/vitest-discovery.js";
import { makeVitestControllerFake } from "../helpers/vitest-controller-fake.js";

beforeEach(() => {
  for (const key of ["TEST", "VITEST", "NODE_ENV"]) vi.stubEnv(key, process.env[key]);
});
afterEach(() => { vi.unstubAllEnvs(); });

it.each(["empty", "skipped"])("refuses %s discovery and closes before execution", async (fault) => {
  const fake = makeVitestControllerFake(fault === "empty" ? [] : [{ path: "skipped.test.ts", project: "integration", mode: "skip" }],
    { preParse: true });
  await expect(discoverVitestSelection([], {}, undefined, fake.create)).rejects.toThrow("No configured test specifications");
  expect(fake.events).toEqual(["initialized", "closed"]);
});
it("retains parsing diagnostics and closes instead of returning an empty selection", async () => {
  const fake = makeVitestControllerFake([{ path: "broken.test.ts", project: "unit" }], { preParse: true, parseFailure: true });
  await expect(discoverVitestSelection([], {}, undefined, fake.create)).rejects.toThrow("Native test specification parsing failed");
  expect(fake.diagnostics.join("\n")).toContain("parse failure retained");
  expect(fake.events).toEqual(["initialized", "closed"]);
});
it.each([true, false])("derives runtime membership after configured pre-parsing=%s", async (preParse) => {
  const fake = makeVitestControllerFake([{ path: "unit.test.ts", project: "unit" },
    { path: "integration.test.ts", project: "integration", mode: "skip" }], { preParse });
  const selection = await discoverVitestSelection([], {}, undefined, fake.create);
  expect(selection.requiresRuntime).toBe(!preParse);
  expect(selection.specifications.map(({ moduleId }) => moduleId)).toEqual(preParse
    ? ["unit.test.ts"] : ["unit.test.ts", "integration.test.ts"]);
  expect(fake.events).toEqual(["initialized"]);
});
it("applies exact initial selection before determining heavy membership", async () => {
  const fake = makeVitestControllerFake([{ path: "unit.test.ts", project: "unit" }, { path: "heavy.test.ts", project: "e2e" }]);
  const selection = await discoverVitestSelection([], {}, (specs) => specs.filter(({ project }) => project.name === "unit"), fake.create);
  expect(selection.requiresRuntime).toBe(false);
  expect(selection.specifications.map(({ moduleId }) => moduleId)).toEqual(["unit.test.ts"]);
});
