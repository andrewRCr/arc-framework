/** Real Git checkout lifecycle for measuring a named ref through its own capture entry. */

import { execFile } from "node:child_process";
import { access, chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { DEFAULT_TEST_COST_REF_DEPENDENCIES, measureTestCostAtRef } from "../../src/lib/test-cost/ref.js";
import { createTempRepoCore, removeGitBackedDir } from "../helpers/temp-repo.js";

const execFileAsync = promisify(execFile);
const lockfile = '{\n  "lockfileVersion": 3\n}\n';
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => removeGitBackedDir(root)));
});

async function git(cwd: string, ...args: string[]): Promise<string> {
  return (await execFileAsync("git", args, { cwd })).stdout.trim();
}

async function repositoryWithTwoCommits(): Promise<{ root: string; packageRoot: string; earlier: string }> {
  const root = await createTempRepoCore({ prefix: "arc-test-cost-ref-" });
  roots.push(root);
  const packageRoot = join(root, "packages/arc-framework");
  await mkdir(join(packageRoot, "src/scripts"), { recursive: true });
  await writeFile(join(root, "package-lock.json"), lockfile);
  await writeFile(join(root, ".gitignore"), "node_modules/\n");
  await writeFile(join(packageRoot, "src/scripts/measure-test-cost.ts"), "// earlier entry\n");
  await git(root, "add", "-A");
  await git(root, "commit", "-m", "earlier");
  const earlier = await git(root, "rev-parse", "HEAD");
  await writeFile(join(packageRoot, "src/scripts/measure-test-cost.ts"), "// later entry\n");
  await git(root, "commit", "-am", "later");
  await mkdir(join(root, "node_modules"));
  await writeFile(join(root, "node_modules/marker"), "root dependencies\n");
  await mkdir(join(packageRoot, "node_modules"));
  await writeFile(join(packageRoot, "node_modules/marker"), "package dependencies\n");
  const hook = join(root, ".git/hooks/post-checkout");
  await writeFile(hook, `#!/bin/sh\ntouch "${join(root, "hook-fired")}"\n`);
  await chmod(hook, 0o755);
  return { root, packageRoot, earlier };
}

function retainingCapture(outputPath: string, packageRoot: string) {
  return async () => {
    await mkdir(join(packageRoot, ".test-cost-runs"), { recursive: true });
    await writeFile(outputPath, JSON.stringify({ schemaVersion: 5 }));
    return { exitCode: 0, stdout: JSON.stringify({ outputPath }) };
  };
}

describe("measureTestCostAtRef against a real repository", () => {
  it("measures the earlier commit's own entry with shared dependencies, then removes its checkout", async () => {
    const { root, packageRoot, earlier } = await repositoryWithTwoCommits();
    const outputPath = join(packageRoot, ".test-cost-runs/run.json");
    const observed: { entry?: string; rootDependencies?: string; packageDependencies?: string; checkout?: string } = {};

    const result = await measureTestCostAtRef({
      packageRoot,
      ref: "HEAD~1",
      mode: { condition: "tier-isolated", projectSet: "unit", workerSizing: "1" },
      outputPath,
      env: process.env,
    }, {
      ...DEFAULT_TEST_COST_REF_DEPENDENCIES,
      runCapture: async (cwd) => {
        observed.checkout = cwd;
        observed.entry = await readFile(join(cwd, "src/scripts/measure-test-cost.ts"), "utf8");
        observed.rootDependencies = await readFile(join(cwd, "../../node_modules/marker"), "utf8");
        observed.packageDependencies = await readFile(join(cwd, "node_modules/marker"), "utf8");
        await mkdir(join(packageRoot, ".test-cost-runs"), { recursive: true });
        await writeFile(outputPath, JSON.stringify({ schemaVersion: 5 }));
        return { exitCode: 0, stdout: JSON.stringify({ outputPath }) };
      },
    });

    expect(result).toEqual({ ref: { name: "HEAD~1", commit: earlier }, summary: { outputPath } });
    expect(observed.entry).toBe("// earlier entry\n");
    expect(observed.rootDependencies).toBe("root dependencies\n");
    expect(observed.packageDependencies).toBe("package dependencies\n");
    await expect(access(observed.checkout ?? "")).rejects.toThrow();
    await expect(access(join(root, "hook-fired"))).rejects.toThrow();
    expect(await git(root, "worktree", "list", "--porcelain")).not.toContain(observed.checkout ?? "unset");
  });

  it("matches a lockfile that the checkout's line-ending conversion stores unchanged", async () => {
    const { root, packageRoot, earlier } = await repositoryWithTwoCommits();
    await git(root, "config", "core.autocrlf", "true");
    await writeFile(join(root, "package-lock.json"), lockfile.replaceAll("\n", "\r\n"));
    const outputPath = join(packageRoot, ".test-cost-runs/run.json");

    const result = await measureTestCostAtRef({
      packageRoot,
      ref: "HEAD~1",
      mode: { condition: "tier-isolated", projectSet: "unit", workerSizing: "1" },
      outputPath,
      env: process.env,
    }, { ...DEFAULT_TEST_COST_REF_DEPENDENCIES, runCapture: retainingCapture(outputPath, packageRoot) });

    expect(result.ref.commit).toBe(earlier);
  });
});
