/**
 * `arc housekeep check` end-to-end contract.
 *
 * Pins the write-context envelope consumed by the housekeeping workflow,
 * including the resolved branch-protection mode that selects its write lane.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
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

  it("compiles routing intent into a source-qualified canonical plan", async () => {
    if (tmpDir === undefined) throw new Error("Test setup did not initialize a temporary repository");
    const userDir = join(tmpDir, ".arc", "user", "test-user");
    await mkdir(userDir, { recursive: true });
    await writeFile(join(userDir, "USER-INBOX.md"), [
      "# User Inbox",
      "",
      "## Errand",
      "",
      "### `[ ]` **Run now**",
      "",
      "- _Observation:_ Execute this capture.",
      "",
      "## Work Unit",
      "",
      "---",
      "",
    ].join("\n"), "utf8");
    const intentPath = join(tmpDir, "intent.json");
    const planPath = join(tmpDir, "plan.json");
    await writeFile(intentPath, JSON.stringify({
      version: 1,
      entries: [{ title: "Run now", disposition: "execute-now" }],
    }), "utf8");

    const result = await runArc([
      "housekeep", "plan", "--intent-file", intentPath, "--output", planPath, "--json",
    ], tmpDir);

    expect(result.exitCode, result.stdout + result.stderr).toBe(0);
    expect(JSON.parse(result.stdout.trim())).toMatchObject({
      mode: "housekeep-plan",
      outcome: "applied",
      planPath,
      routingPlanDigest: expect.stringMatching(/^sha256:/u),
    });
    expect(JSON.parse(await readFile(planPath, "utf8"))).toMatchObject({
      entries: [{ title: "Run now", disposition: "execute-now", sourceDigest: expect.stringMatching(/^sha256:/u) }],
    });
  });
});
