/** Check reuse follows the actual store suite population selected by its environment. */
import { afterEach, expect, it, vi } from "vitest";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { load } from "js-yaml";
import { createDeclaredCheckRepository } from "../fixtures/checks/repository.js";
import { removeGitBackedDirs } from "../helpers/temp-repo.js";
import { CheckDeclarationSchema } from "../../src/lib/checks/declaration.js";
import { runDeclaredRequest, type DeclaredCheckDependencies, type DeclaredCheckResult } from "../../src/handlers/check/run.js";
import { createCheckPassStore } from "../../src/lib/checks/record.js";
import { runCheckProcess } from "../../src/lib/checks/process.js";
import { gitExec, gitExecInput } from "../../src/lib/io-context.js";
import { readReachDeclaration, selectReachCheck } from "../../src/lib/reach-check.js";

const checkoutRoot = resolve(import.meta.dirname, "../../../..");
const declarationPath = "packages/arc-framework/__tests__/reach/store-suites.json";
/** The separate layout's whole-run conformance files: its three item ranges, each split into parts. */
const SEPARATE_CONFORMANCE_PARTS = ["reads-1", "reads-2", "reads-3", "reads-4", "records-1", "records-2", "records-3",
  "records-4", "sync-1", "sync-2", "sync-3"];
const roots: string[] = [];
afterEach(async () => { vi.unstubAllEnvs(); await removeGitBackedDirs(roots.splice(0)); });

async function storeCheckHarness() {
  vi.stubEnv("FORCE_COLOR", undefined);
  const actual = CheckDeclarationSchema.parse(load(await readFile(join(checkoutRoot, ".arc/system/arc-checks.yml"), "utf8")));
  const check = actual.checks["test:store"];
  if (!check) throw new Error("The store check is not declared");
  const definition = { ...actual, checks: { "test:store": check } };
  const root = await createDeclaredCheckRepository(definition.checks, actual);
  roots.push(root);
  await appendFile(join(root, ".gitignore"), "node_modules/\n");
  await mkdir(join(root, "node_modules"));
  await writeFile(join(root, "node_modules/.package-lock.json"), "{}\n");
  const files = new Map<string, string>();
  const passes = createCheckPassStore({ directory: async () => join(root, "check-passes"),
    readFile: async path => {
      const value = files.get(path);
      if (value === undefined) throw Object.assign(new Error("Missing pass"), { code: "ENOENT" });
      return value;
    },
    createFile: async (path, content) => {
      if (files.has(path)) throw Object.assign(new Error("Existing pass"), { code: "EEXIST" });
      files.set(path, content);
    },
  });
  const reach = await readReachDeclaration(join(checkoutRoot, declarationPath));
  const io: DeclaredCheckDependencies = { git: gitExec, gitInput: gitExecInput, platform: process.platform,
    availableParallelism: () => 1, passes, readRunnerConfiguration: async () => undefined,
    readDeclaration: async () => ({ status: "valid", location: ".arc/system/arc-checks.yml", value: definition }),
    runtime: (command, cwd) => runCheckProcess(command, cwd, undefined, { rawStdout: true }),
    execute: async () => {
      const selection = await selectReachCheck(reach, { checkoutRoot, declarationPath, git: gitExec,
        env: { ARC_STORE_CHECK: process.env.ARC_STORE_CHECK, ARC_STORE_BURSTS: process.env.ARC_STORE_BURSTS } });
      return { started: true, exitCode: 0, output: JSON.stringify(selection.suites) };
    },
  };
  return { root, io, run: async (ask: string, bursts: string | undefined): Promise<DeclaredCheckResult> => {
    vi.stubEnv("ARC_STORE_CHECK", ask);
    vi.stubEnv("ARC_STORE_BURSTS", bursts);
    const result = await runDeclaredRequest(root, io, { form: { kind: "run", ids: ["test:store"] } });
    expect(result).toMatchObject({ kind: "result", exitCode: 0 });
    if (result.kind !== "result" || !result.result.checks[0]) throw new Error("No completed store check");
    return result.result.checks[0];
  } };
}

it("reuses identical populations while executing newly enabled timing and burst selections", async () => {
  const harness = await storeCheckHarness();
  const outcomes: DeclaredCheckResult[] = [];
  for (const bursts of [undefined, undefined, "1", "1"]) {
    outcomes.push(await harness.run("full", bursts));
  }
  expect(outcomes.map(result => result.outcome)).toEqual(["passed", "reused", "passed", "reused"]);
  const smaller = JSON.parse(outcomes[0]?.output ?? "[]") as string[];
  const larger = JSON.parse(outcomes[2]?.output ?? "[]") as string[];
  for (const file of ["store-ref-timing.test.ts", "store-ref-bursts.test.ts"]) {
    expect(smaller).not.toContain(`packages/arc-framework/__tests__/integration/${file}`);
    expect(larger).toContain(`packages/arc-framework/__tests__/integration/${file}`);
  }
  expect(outcomes[1]?.output).toBe(outcomes[0]?.output);
  expect(outcomes[3]?.output).toBe(outcomes[2]?.output);
}, 60_000);

it("keys real declared passes to their ask while reusing each unchanged form", async () => {
  const harness = await storeCheckHarness(), outcomes: DeclaredCheckResult[] = [];
  for (const ask of ["", "", "every", "every", "full", "full"]) outcomes.push(await harness.run(ask, undefined));
  expect(outcomes.map(result => result.outcome)).toEqual(["passed", "reused", "passed", "reused", "passed", "reused"]);
  const every = JSON.parse(outcomes[2]?.output ?? "[]") as string[], full = JSON.parse(outcomes[4]?.output ?? "[]") as string[];
  for (const part of SEPARATE_CONFORMANCE_PARTS) {
    const file = `packages/arc-framework/__tests__/integration/store-ref-separate-conformance-${part}.test.ts`;
    expect(every).not.toContain(file);
    expect(full).toContain(file);
  }
}, 60_000);

it("declares routed store selector values and a captured native duration file", async () => {
  const actual = CheckDeclarationSchema.parse(load(await readFile(join(checkoutRoot, ".arc/system/arc-checks.yml"), "utf8")));
  const check = actual.checks["test:store"];
  const reach = await readReachDeclaration(join(checkoutRoot, declarationPath));
  expect(check?.runner).toBe(true);
  expect(check?.environment_inputs).toMatchObject({
    ...Object.fromEntries([reach.ask, ...reach.environment.map(entry => entry.variable)].map(name => [name, "value"])),
    ARC_TEST_DURATION_FILE: "file",
  });
});
