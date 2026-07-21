/** Integration coverage for the dependency-free canonical change-fact entrypoint. */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { access, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

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

  it("emits the unknown record when a coordinate cannot be resolved", async () => {
    const result = await execFileAsync(process.execPath, [MODULE_PATH, base, "missing-ref"], {
      cwd: repo,
    });

    expect(JSON.parse(result.stdout)).toEqual({ changeSet: "unknown", changes: [] });
  });
});
