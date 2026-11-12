/** Exercise package-method neutrality validation against the real Git index. */

import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { cleanupTempDir, createTempRepo } from "../helpers/integration.js";

const execute = promisify(execFile);
const tsxLoader = import.meta.resolve("tsx");
const validatorPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../src/scripts/validate-package-neutrality.ts",
);
const methodPath = "packages/arc-framework/arc/system/methods/commit-format.md";
const neutralMethod = [
  "---",
  "name: commit-format",
  "description: Commit message format",
  "override-active: false",
  "---",
  "",
  "# Method: commit-format",
  "",
  "## commit-format.override",
  "",
  "[No override configured]",
  "",
  "## commit-format.default",
  "",
  "Default guidance.",
  "",
].join("\n");
const customizedMethod = neutralMethod.replace("override-active: false", "override-active: true");

describe("package-neutrality staged content", () => {
  const fixtures: string[] = [];

  afterEach(async () => {
    await Promise.all(fixtures.splice(0).map((root) => cleanupTempDir(root)));
  });

  async function fixture(staged: string | null, worktree: string): Promise<string> {
    const root = await createTempRepo("arc-package-neutrality-staged-");
    fixtures.push(root);
    const fullPath = join(root, methodPath);
    await mkdir(dirname(fullPath), { recursive: true });
    if (staged !== null) {
      await writeFile(fullPath, staged);
      await execute("git", ["add", "--", methodPath], { cwd: root });
    }
    await writeFile(fullPath, worktree);
    return root;
  }

  function runValidator(cwd: string, path = methodPath) {
    return execute(process.execPath, ["--import", tsxLoader, validatorPath, path], {
      cwd,
      env: { ...process.env, FORCE_COLOR: undefined },
    });
  }

  it("rejects a customized staged method even when the worktree is neutral", async () => {
    const root = await fixture(customizedMethod, neutralMethod);

    await expect(runValidator(root)).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining("package source must ship `override-active: false`"),
    });
  });

  it("accepts a neutral staged method even when the worktree enables an override", async () => {
    const root = await fixture(neutralMethod, customizedMethod);

    await expect(runValidator(root)).resolves.toMatchObject({ stdout: "", stderr: "" });
  });

  it.each([".", "nested"])("accepts neutral staged content through an absolute path from %s", async (directory) => {
    const root = await fixture(neutralMethod, customizedMethod);
    const cwd = join(root, directory);
    await mkdir(cwd, { recursive: true });
    const absolutePath = join(root, methodPath).split(sep).join("/");

    await expect(runValidator(cwd, absolutePath)).resolves.toMatchObject({ stdout: "", stderr: "" });
  });

  it.each([".", "nested"])("rejects customized staged content through an absolute path from %s", async (directory) => {
    const root = await fixture(customizedMethod, neutralMethod);
    const cwd = join(root, directory);
    await mkdir(cwd, { recursive: true });
    const absolutePath = join(root, methodPath).split(sep).join("/");

    await expect(runValidator(cwd, absolutePath)).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining("package source must ship `override-active: false`"),
    });
  });

  it("refuses a candidate absent from the index even when the worktree is neutral", async () => {
    const root = await fixture(null, neutralMethod);

    await expect(runValidator(root)).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining(methodPath),
    });
  });
});
