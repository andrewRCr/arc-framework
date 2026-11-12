/** Integration coverage for the dependency-free canonical change-fact entrypoint. */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { access, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execa } from "execa";

import {
  cleanupTempDir,
  createTempRepo,
  execFileAsync,
} from "../helpers/integration.js";

const MODULE_PATH = fileURLToPath(
  new URL("../../src/lib/change-facts.ts", import.meta.url),
);

describe("change-facts executable", () => {
  let repo: string;
  let base: string;
  let head: string;
  const hostilePath = "name\n$(touch should-not-exist).ts";

  beforeAll(async () => {
    repo = await createTempRepo("arc-change-facts-");
    await writeFile(join(repo, "base.txt"), "base\n");
    await execFileAsync("git", ["add", "--", "base.txt"], { cwd: repo });
    await execFileAsync("git", [
      "-c",
      "core.hooksPath=/dev/null",
      "commit",
      "-m",
      "base",
    ], { cwd: repo });
    base = (await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repo })).stdout.trim();

    await writeFile(join(repo, hostilePath), "head\n");
    await execFileAsync("git", ["add", "--", hostilePath], { cwd: repo });
    await execFileAsync("git", [
      "-c",
      "core.hooksPath=/dev/null",
      "commit",
      "-m",
      "head",
    ], { cwd: repo });
    head = (await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repo })).stdout.trim();
  });

  afterAll(async () => {
    await cleanupTempDir(repo);
  });

  it("emits stable JSON from exact commits without interpreting filenames", async () => {
    const first = await execFileAsync(process.execPath, [MODULE_PATH, base, head], { cwd: repo });
    const second = await execFileAsync(process.execPath, [MODULE_PATH, base, head], { cwd: repo });

    expect(first.stdout).toBe(second.stdout);
    expect(JSON.parse(first.stdout)).toEqual({
      changeSet: "known",
      changes: [
        {
          status: "added",
          path: hostilePath,
          oldMode: "000000",
          newMode: "100644",
        },
      ],
    });
    await expect(access(join(repo, "should-not-exist"))).rejects.toThrow();
  });

  it.each([
    "packages/arc-framework/src/lib/checks/runner/planning.ts",
    "packages/arc-framework/src/handlers/check/run.ts",
    "packages/arc-framework/src/lib/checks/forecast.ts",
    "packages/arc-framework/__tests__/integration/check-symlink-cwd.test.ts",
    "packages/arc-framework/__tests__/unit/lib/checks/runner/source-platform-paths.test.ts",
    "packages/arc-framework/__tests__/integration/check-runner-platform-spelling.test.ts",
    "packages/arc-framework/__tests__/e2e/check-runner-platform.e2e.test.ts",
    "packages/arc-framework/__tests__/fixtures/checks/prepared-execution.ts",
  ])("targets runner foundation path %s through the executable projection", async path => {
    const result = await execa(process.execPath, [MODULE_PATH, "portability-paths"], {
      cwd: repo, input: Buffer.from(`${path}\0`), reject: false,
    });
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stdout).toBe("true");
  });

  it("lets cwd select the repository despite inherited Git-local environment", async () => {
    const result = await execFileAsync(process.execPath, [MODULE_PATH, base, head], {
      cwd: repo,
      env: {
        ...process.env,
        GIT_DIR: join(repo, "does-not-exist"),
        GIT_WORK_TREE: join(repo, "also-does-not-exist"),
        GIT_INDEX_FILE: join(repo, "hostile-index"),
      },
    });

    expect(JSON.parse(result.stdout)).toMatchObject({ changeSet: "known" });
  });

  it("emits the unknown record when a coordinate cannot be resolved", async () => {
    const result = await execFileAsync(process.execPath, [MODULE_PATH, base, "missing-ref"], {
      cwd: repo,
    });

    expect(JSON.parse(result.stdout)).toEqual({ changeSet: "unknown", changes: [] });
  });

  it("does not expose planning-lane classification through the legacy executable", async () => {
    const result = await execFileAsync(
      process.execPath,
      [MODULE_PATH, "planning-lane", base, head],
      { cwd: repo },
    );

    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toEqual({ changeSet: "unknown", changes: [] });
  });
});
