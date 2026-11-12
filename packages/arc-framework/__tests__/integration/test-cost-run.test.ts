/** Public native-controller boundary fixtures for retained timing and failure policy. */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createVitest, parseCLI } from "vitest/node";
import { execa } from "execa";
import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { acquireAdvisoryLock, releaseAdvisoryLock, renewAdvisoryLock } from "../../src/lib/advisory-lock.js";
import { makeFocusedVitestFixture } from "../helpers/focused-vitest-fixture.js";
import { scriptGitExec } from "../helpers/git-exec-fake.js";
import { runTestCostMeasurement } from "../../src/lib/test-cost/run.js";

const mode = { condition: "tier-isolated", projectSet: "unit", workerSizing: "12" } as const;
let previousExitCode: typeof process.exitCode;
beforeEach(() => { previousExitCode = process.exitCode; process.exitCode = undefined; });
afterEach(() => { process.exitCode = previousExitCode; });

function nativeBoundary(failure: "none" | "module" | "unhandled" | "missing-timing" = "none", project = "unit",
  onCreation?: () => Promise<void>) {
  let clock = 1_000;
  const events: string[] = [];
  let retained: string | undefined;
  const advance = (stage: string, elapsed: number) => { events.push(stage); clock += elapsed; };
  const test = { id: "case-a", fullName: "suite > case a", options: { timeout: 5_000 }, meta: () => ({}),
    result: () => ({ state: failure === "module" ? "failed" : "passed" }),
    diagnostic: () => failure === "missing-timing" ? undefined : ({ duration: 30 }) };
  const module = { moduleId: "/tests/cost.test.ts", relativeModuleId: "cost.test.ts", project: { name: project },
    meta: () => ({}), errors: () => [],
    state: () => failure === "module" ? "failed" : "passed", ok: () => failure !== "module",
    diagnostic: () => { advance("capture", 31); return { environmentSetupDuration: 4, prepareDuration: 6,
      collectDuration: 10, setupDuration: 20, duration: 30 }; },
    children: { allTests: function* () { yield test; } } };
  const errors = failure === "unhandled" ? [new Error("worker failure")] : [];
  const specification = { project: { name: project }, testModule: undefined as { task: { mode: string } } | undefined };
  const provided: Record<string, unknown> = {};
  const create: typeof createVitest = async () => {
    await onCreation?.();
    advance("creation", 11);
    return { config: { experimental: { preParse: true } }, projects: [{ config: { exclude: [] } }],
      standalone: async () => { advance("reporting", 13); },
      getRelevantTestSpecifications: async () => { advance("discovery", 17); return [specification]; },
      experimental_parseSpecifications: async () => { advance("pre-parsing", 19);
        specification.testModule = { task: { mode: "run" } }; return [{ errors: () => [] }]; },
      runTestSpecifications: async () => { advance("execution", 23); return { testModules: [module], unhandledErrors: errors }; },
      close: async () => { advance("closing", 29); },
      provide: (key: string, value: unknown) => { provided[key] = value; }, getProvidedContext: () => provided,
      state: { getTestModules: () => [module], getUnhandledErrors: () => errors },
      logger: { error: (...values: unknown[]) => events.push(values.join(" ")), printError() {}, printUnhandledErrors() {} },
    } as unknown as Awaited<ReturnType<typeof createVitest>>;
  };
  return { advance, events, retained: () => retained, dependencies: { create, now: () => clock, parseCli: parseCLI,
    persist: async (_path: string, content: string) => { advance("persistence", 37); retained = content; } } };
}

const input = { cwd: "/repo/packages/arc-framework", env: {}, mode, outputPath: "/out.json" };
describe("runTestCostMeasurement", () => {
  it("excludes CPU queue, releases and persistence while including artifact wait and qualification", async () => {
    const checkout = await makeFocusedVitestFixture();
    const cpuPath = join(checkout.root, ".git/arc/test-suite/.local-heavy-tests.lock");
    const artifactPath = join(checkout.packageRoot, ".arc-build.lock");
    await mkdir(join(cpuPath, ".."), { recursive: true });
    let cpuHolder: Awaited<ReturnType<typeof acquireAdvisoryLock>> | undefined;
    let artifactHolder: Awaited<ReturnType<typeof acquireAdvisoryLock>> | undefined;
    let cpuWait = false;
    let artifactWait = false;
    let preparing = true;
    let controllerCount = 0;
    const fixture = nativeBoundary("none", "integration", async () => {
      if (controllerCount++ === 0) return;
      cpuWait = false;
      artifactWait = false;
      preparing = true;
      cpuHolder = await acquireAdvisoryLock(cpuPath);
      artifactHolder = await acquireAdvisoryLock(artifactPath);
    });
    try {
      await execa(process.execPath, ["--import", "tsx", "src/scripts/run-build.ts", "prepare"],
        { cwd: checkout.packageRoot, env: { ARC_E2E_SKIP_BUILD: "" } });
      cpuHolder = await acquireAdvisoryLock(cpuPath);
      artifactHolder = await acquireAdvisoryLock(artifactPath);
      const run = await runTestCostMeasurement({ ...input, cwd: checkout.packageRoot,
        mode: { ...mode, projectSet: "integration" } }, { ...fixture.dependencies,
        ownership: {
          admission: { now: fixture.dependencies.now, writeLine() {}, git: scriptGitExec([
            { match: ["rev-parse", "--show-toplevel"], responses: [{ stdout: `${checkout.root}\n`, stderr: "" }] },
            { match: ["rev-parse", "--git-common-dir"], responses: [{ stdout: `${join(checkout.root, ".git")}\n`, stderr: "" }] },
            { match: ["branch", "--show-current"], responses: [{ stdout: "feat/fixture\n", stderr: "" }] },
          ]).exec,
          acquireLock: async (path, options) => await acquireAdvisoryLock(path, { ...options, onWait: (contention) => {
            options?.onWait?.(contention);
            if (!cpuWait && cpuHolder !== undefined) { cpuWait = true; fixture.advance("cpu-wait", 43); void releaseAdvisoryLock(cpuHolder); }
          } }),
          releaseLock: async (handle) => { fixture.advance("cpu-release", 59); await releaseAdvisoryLock(handle); } },
          artifacts: { now: fixture.dependencies.now, writeLine() {},
            acquireLock: async (path, options) => await acquireAdvisoryLock(path, { ...options, onWait: (contention) => {
              options?.onWait?.(contention);
              if (!artifactWait && artifactHolder !== undefined) {
                artifactWait = true; fixture.advance("artifact-wait", 47); void releaseAdvisoryLock(artifactHolder);
              }
            } }),
            renewLock: async (handle, duration) => {
              if (preparing) { preparing = false; fixture.advance("qualification", 53); }
              return await renewAdvisoryLock(handle, duration);
            },
            releaseLock: async (handle) => { fixture.advance("artifact-release", 59); await releaseAdvisoryLock(handle); } },
        },
        persist: async (path, content) => {
          expect(existsSync(cpuPath)).toBe(false); expect(existsSync(artifactPath)).toBe(false);
          await fixture.dependencies.persist(path, content);
        },
      });
      expect(run).toMatchObject({ wallClockMs: 243, admissionWaitMs: 43 });
      const lifecycle = ["creation", "reporting", "discovery", "pre-parsing", "cpu-wait", "artifact-wait",
        "qualification", "execution", "closing", "capture", "artifact-release", "cpu-release"];
      expect(fixture.events).toEqual([...lifecycle, ...lifecycle, "persistence"]);
      expect(JSON.parse(fixture.retained() ?? "null")).toEqual(run);
    } finally {
      if (cpuHolder !== undefined) await releaseAdvisoryLock(cpuHolder);
      if (artifactHolder !== undefined) await releaseAdvisoryLock(artifactHolder);
      await rm(checkout.root, { recursive: true, force: true });
    }
  }, 60_000);
});
