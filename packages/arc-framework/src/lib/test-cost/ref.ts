/** Measure a named ref by running that commit's own capture entry in a temporary detached checkout. */

import { access, mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

import { execa } from "execa";

import type { MeasurementMode } from "./mode.js";

type Environment = Readonly<Record<string, string | undefined>>;

export interface TestCostRefDependencies {
  readonly git: (args: readonly string[], cwd: string) => Promise<string>;
  readonly readText: (path: string) => Promise<string>;
  readonly exists: (path: string) => Promise<boolean>;
  readonly makeTemporaryDirectory: () => Promise<string>;
  readonly link: (target: string, path: string) => Promise<void>;
  readonly remove: (path: string) => Promise<void>;
  readonly runCapture: (
    cwd: string, args: readonly string[], env: Environment,
  ) => Promise<{ exitCode: number; stdout: string }>;
}

export interface TestCostRefInput {
  readonly packageRoot: string;
  readonly ref: string;
  readonly mode: MeasurementMode;
  readonly outputPath: string;
  readonly env: Environment;
}

export interface TestCostRefMeasurement {
  readonly ref: { readonly name: string; readonly commit: string };
  readonly summary: Readonly<Record<string, unknown>>;
}

export const DEFAULT_TEST_COST_REF_DEPENDENCIES: TestCostRefDependencies = {
  git: async (args, cwd) => (await execa("git", [...args], { cwd })).stdout.trim(),
  readText: async (path) => await readFile(path, "utf8"),
  exists: async (path) => await access(path).then(() => true, () => false),
  makeTemporaryDirectory: async () => await mkdtemp(join(tmpdir(), "arc-test-cost-ref-")),
  link: async (target, path) => { await symlink(target, path, "junction"); },
  remove: async (path) => { await rm(path, { recursive: true, force: true }); },
  runCapture: async (cwd, args, env) => {
    const result = await execa(process.execPath, ["--import", "tsx", "src/scripts/measure-test-cost.ts", ...args], {
      cwd, env, extendEnv: false, reject: false, stdin: "ignore", stdout: "pipe", stderr: "inherit",
    });
    return { exitCode: result.exitCode ?? 1, stdout: result.stdout };
  },
};

/**
 * Run the commit's own schema-v5 capture entry with this checkout's dependencies, then remove its checkout.
 * @param input - This checkout's package root, the ref, the explicit mode axes, and the retained output path
 * @param dependencies - Git, filesystem, and capture-process boundaries
 * @returns The resolved commit and the capture entry's JSON summary
 */
export async function measureTestCostAtRef(
  input: TestCostRefInput,
  dependencies: TestCostRefDependencies = DEFAULT_TEST_COST_REF_DEPENDENCIES,
): Promise<TestCostRefMeasurement> {
  const top = await dependencies.git(["rev-parse", "--show-toplevel"], input.packageRoot);
  const commit = await resolveCommit(input.ref, top, dependencies);
  const lockAtRef = await dependencies.git(["show", `${commit}:package-lock.json`], top);
  if (lockAtRef.trim() !== (await dependencies.readText(join(top, "package-lock.json"))).trim()) {
    throw new Error(`package-lock.json differs between ${input.ref} and this checkout, so its dependencies cannot be `
      + "shared. Install that commit's dependencies in a checkout of it and run benchmark:test-cost there.");
  }
  const temporary = await dependencies.makeTemporaryDirectory();
  const checkout = join(temporary, "checkout");
  let added = false;
  try {
    await dependencies.git(
      ["-c", `core.hooksPath=${join(temporary, "no-hooks")}`, "worktree", "add", "--detach", checkout, commit], top,
    );
    added = true;
    const packagePath = relative(top, input.packageRoot);
    await dependencies.link(join(top, "node_modules"), join(checkout, "node_modules"));
    if (await dependencies.exists(join(input.packageRoot, "node_modules"))) {
      await dependencies.link(join(input.packageRoot, "node_modules"), join(checkout, packagePath, "node_modules"));
    }
    const summary = await capture(input, join(checkout, packagePath), dependencies);
    return { ref: { name: input.ref, commit }, summary };
  } finally {
    try {
      if (added) await dependencies.git(["worktree", "remove", "--force", checkout], top);
    } finally {
      await dependencies.remove(temporary);
    }
  }
}

async function resolveCommit(ref: string, top: string, dependencies: TestCostRefDependencies): Promise<string> {
  try {
    return await dependencies.git(["rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`], top);
  } catch {
    throw new Error(`Cannot resolve ${ref} to a commit in this repository; fetch it or name an existing ref.`);
  }
}

async function capture(
  input: TestCostRefInput, cwd: string, dependencies: TestCostRefDependencies,
): Promise<Readonly<Record<string, unknown>>> {
  const run = await dependencies.runCapture(cwd, [
    "--condition", input.mode.condition,
    "--project-set", input.mode.projectSet,
    "--workers", input.mode.workerSizing,
    "--output", input.outputPath,
  ], input.env);
  if (run.exitCode !== 0) {
    throw new Error(`The capture at ${input.ref} exited ${run.exitCode}; its diagnostics are above.`);
  }
  const predates = new Error(`The capture entry at ${input.ref} predates schema v5 or its JSON summary; apply the `
    + "current measurement instrumentation to a checkout of that commit before measuring it.");
  let summary: unknown;
  let retained: unknown;
  try {
    summary = JSON.parse(run.stdout);
    retained = JSON.parse(await dependencies.readText(input.outputPath));
  } catch {
    throw predates;
  }
  const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
    typeof value === "object" && value !== null && !Array.isArray(value);
  if (!isRecord(summary) || !isRecord(retained) || retained["schemaVersion"] !== 5) throw predates;
  return summary;
}
