/** Completion runs through a public fake selection without runtime preparation. */
import { afterEach, beforeEach, expect, it } from "vitest";
import type { TestResult } from "vitest/node";
import { executeVitestSelection } from "../../src/lib/vitest-execution.js";
import { fakeVitestResult, makeVitestControllerFake } from "../helpers/vitest-controller-fake.js";

let previous: typeof process.exitCode;
beforeEach(() => { previous = process.exitCode; process.exitCode = 0; });
afterEach(() => { process.exitCode = previous; });
const input = { cwd: "absent-checkout", packageRoot: "absent-package", env: {}, tier: "unit" } as const;

it.each(([[], ["skipped"], ["pending"], ["pending", "skipped"]] as TestResult["state"][][]).map((states) => ({ states })))(
  "refuses unexecuted public states $states and closes before capture", async ({ states }) => {
    const fake = makeVitestControllerFake([], { result: fakeVitestResult(states) });
    const result = await executeVitestSelection({ controller: fake.controller, specifications: [], requiresRuntime: false }, input,
      () => { fake.events.push("captured"); return "retained"; });
    expect(result).toEqual({ result: "retained" });
    expect(process.exitCode).toBe(1);
    expect(fake.diagnostics.join("\n")).toContain("No test cases completed");
    expect(fake.events).toEqual(["executed", "closed", "captured"]);
  });
it.each(["module", "collection", "worker"] as const)("retains %s failure through execution and closing", async (fault) => {
  const fake = makeVitestControllerFake([], { result: fakeVitestResult(["passed"], fault) });
  await executeVitestSelection({ controller: fake.controller, specifications: [], requiresRuntime: false }, input);
  expect(process.exitCode).toBe(1);
  expect(fake.diagnostics.join("\n")).not.toContain("No test cases completed");
  expect(fake.events).toEqual(["executed", "closed"]);
});
it("accepts a passing case beside skipped results without acquiring ownership", async () => {
  const fake = makeVitestControllerFake([], { result: fakeVitestResult(["passed", "skipped"]) });
  await executeVitestSelection({ controller: fake.controller, specifications: [], requiresRuntime: false }, input);
  expect(process.exitCode).toBe(0);
  expect(fake.diagnostics).toEqual([]);
  expect(fake.events).toEqual(["executed", "closed"]);
});
