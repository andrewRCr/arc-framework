/** Public module metadata proves the shrinking native-launch exception policy. */
import { afterEach, beforeEach, expect, it } from "vitest";
import type { TestResult } from "vitest/node";
import { checkVitestUnitLaunchFloor } from "../../src/lib/vitest-completion.js";
import { UNIT_PROCESS_ALLOWLISTED_META, UNIT_PROCESS_LAUNCH_COUNT_META } from "../../src/lib/unit-process-metadata.js";

let previous: typeof process.exitCode;
beforeEach(() => { previous = process.exitCode; process.exitCode = 0; });
afterEach(() => { process.exitCode = previous; });

function moduleWith(states: TestResult["state"][], counts: number[], finalCount?: number,
  file = "/tests/legacy.test.ts", allowlisted = true): Parameters<typeof checkVitestUnitLaunchFloor>[0]["testModules"][number] {
  const metadata = (count: number | undefined): Record<string, unknown> => count === undefined ? {} : {
    [UNIT_PROCESS_ALLOWLISTED_META]: allowlisted, [UNIT_PROCESS_LAUNCH_COUNT_META]: count,
  };
  return { moduleId: file, project: { name: "unit" }, meta: () => metadata(finalCount),
    children: { allTests: () => states.map((state, index) => ({ meta: () => metadata(counts[index]),
      result: (): TestResult => state === "skipped" ? { state, errors: undefined, note: undefined }
        : state === "failed" ? { state, errors: [] } : { state, errors: undefined },
    })) },
  };
}

function check(modules: Parameters<typeof checkVitestUnitLaunchFloor>[0]["testModules"]): string[] {
  const diagnostics: string[] = [];
  checkVitestUnitLaunchFloor({ testModules: modules }, { error: (message: unknown) => { diagnostics.push(String(message)); } });
  return diagnostics;
}

it("names an allowlisted file whose whole selection completed without a launch", () => {
  const diagnostics: string[] = [];
  const metadata = { [UNIT_PROCESS_ALLOWLISTED_META]: true, [UNIT_PROCESS_LAUNCH_COUNT_META]: 0 };
  checkVitestUnitLaunchFloor({ testModules: [{ moduleId: "/tests/idle.test.ts", project: { name: "unit" },
    meta: () => metadata,
    children: { allTests: () => [{ meta: () => metadata, result: () => ({ state: "passed", errors: undefined }) }] },
  }] }, { error: (message: unknown) => { diagnostics.push(String(message)); } });
  expect(process.exitCode).toBe(1);
  expect(diagnostics.join("\n")).toContain("Unit launch allowlist idle: /tests/idle.test.ts (unit)");
});

it("accepts a file that launched, using cumulative counts rather than adding them", () => {
  expect(check([moduleWith(["passed", "passed"], [1, 1], 1)])).toEqual([]);
  expect(process.exitCode).toBe(0);
});

it.each(["skipped", "pending"] as const)("exempts a partial file with a %s case, including name filters", (state) => {
  expect(check([moduleWith(["passed", state], [0])])).toEqual([]);
  expect(process.exitCode).toBe(0);
});

it("exempts fs.test.ts when its Windows process case is skipped", () => {
  expect(check([moduleWith(["passed", "skipped"], [0], 0, "/tests/fs.test.ts")])).toEqual([]);
  expect(process.exitCode).toBe(0);
});

it("includes a final suite-hook launch after the last case metadata", () => {
  expect(check([moduleWith(["passed"], [0], 1)])).toEqual([]);
  expect(process.exitCode).toBe(0);
});

it("ignores files without guarded launch evidence and files off the allowlist", () => {
  expect(check([moduleWith(["passed"], []), moduleWith(["passed"], [0], 0, "/tests/ordinary.test.ts", false)])).toEqual([]);
  expect(process.exitCode).toBe(0);
});

it("names every idle file even after another failure set the run status", () => {
  process.exitCode = 2;
  const diagnostics = check([moduleWith(["failed"], [0], 0, "/tests/first.test.ts"),
    moduleWith(["passed"], [0], 0, "/tests/second.test.ts")]);
  expect(diagnostics).toHaveLength(2);
  expect(diagnostics.join("\n")).toContain("/tests/first.test.ts");
  expect(diagnostics.join("\n")).toContain("/tests/second.test.ts");
  expect(process.exitCode).toBe(2);
});
