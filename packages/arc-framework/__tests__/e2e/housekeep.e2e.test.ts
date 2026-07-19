/**
 * `arc housekeep check` end-to-end contract.
 *
 * Pins the write-context envelope consumed by the housekeeping workflow,
 * including the resolved branch-protection mode that selects its write lane.
 */

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { cleanupTempDir, createTempRepo, runArc } from "./helpers.js";

describe("arc housekeep check", () => {
  let tmpDir: string | undefined;

  beforeEach(async () => {
    tmpDir = await createTempRepo();
    const init = await runArc(["init", "--yes", "--name", "test-project"], tmpDir);
    expect(init.exitCode).toBe(0);
  });

  afterEach(async () => {
    if (tmpDir !== undefined) await cleanupTempDir(tmpDir);
  });

  it("returns the resolved branch-protection mode in JSON", async () => {
    if (tmpDir === undefined) throw new Error("Test setup did not initialize a temporary repository");

    const configPath = join(tmpDir, ".arc", "system", "arc-config.yml");
    const config = await readFile(configPath, "utf8");
    await writeFile(
      configPath,
      config.replace("branch.protection: partial", "branch.protection: full"),
      "utf8",
    );

    const result = await runArc(["housekeep", "check", "--json"], tmpDir);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout.trim())).toMatchObject({
      baseBranch: "main",
      branchProtection: "full",
    });
  });
});
