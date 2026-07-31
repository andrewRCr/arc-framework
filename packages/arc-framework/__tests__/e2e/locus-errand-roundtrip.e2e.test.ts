/** Real CLI promotion from an ordinary Errand into its work-unit session home. */

import { execFile } from "node:child_process";
import { chmod, copyFile, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  cleanupTempDir,
  createTempRepo,
  git,
  removeGitBackedDir,
  runArc,
  runArcAnchoredSequence,
} from "./helpers.js";

const execFileAsync = promisify(execFile);

async function setFullProtection(repository: string): Promise<void> {
  const path = join(repository, ".arc", "system", "arc-config.yml");
  const config = await readFile(path, "utf8");
  await writeFile(path, config.replace("branch.protection: partial", "branch.protection: full"));
}

async function createBareRemote(repository: string): Promise<string> {
  const remote = await mkdtemp(join(tmpdir(), "arc-locus-promotion-remote-"));
  await execFileAsync("git", ["init", "--bare", "--initial-branch=main", remote]);
  await git(repository, ["remote", "add", "origin", remote]);
  await git(repository, ["push", "-u", "origin", "main"]);
  return remote;
}

async function createCodexHarness(): Promise<{ directory: string; executable: string }> {
  const directory = await mkdtemp(join(tmpdir(), "arc-locus-promotion-codex-"));
  const executable = join(directory, "codex");
  await copyFile("/bin/bash", executable);
  await chmod(executable, 0o755);
  return { directory, executable };
}

describe("ordinary Errand promotion", () => {
  let repository: string;

  beforeEach(async () => {
    repository = await createTempRepo();
    const initialized = await runArc(["init", "--yes", "--name", "locus-promotion"], repository);
    expect(initialized.exitCode).toBe(0);
    await setFullProtection(repository);
    await git(repository, ["add", "-A"]);
    await git(repository, ["commit", "--no-verify", "-m", "initialize fixture"]);
  });

  afterEach(async () => {
    await cleanupTempDir(repository);
  });

  it.each([
    { floor: "scale", branch: "feat/growth-unit", state: "Active" },
    { floor: "derivation", branch: "plan/growth-unit", state: "Planning" },
  ] as const)("promotes a cold v3 Errand at the $floor floor", async ({ floor, branch, state }) => {
    const remote = await createBareRemote(repository);
    const harness = await createCodexHarness();
    try {
      const sequence = await runArcAnchoredSequence([
        ["errand", "open", "growing", "--json"],
        {
          args: ["errand", "promote", "growing", "--name", "growth-unit", "--type", "feat", "--floor", floor,
            "--json"],
          cwdFromPreviousJson: "activeLocusPath",
        },
      ], repository, { timeout: 60_000, anchorShellPath: harness.executable });

      expect(sequence.exitCode, sequence.stderr || sequence.stdout).toBe(0);
      expect(sequence.results[0]).toMatchObject({
        outcome: "applied",
        operation: "errand-open",
        identity: { kind: "errand", key: "growing", claimId: expect.any(String), state: "open" },
      });
      expect(sequence.results[1]).toMatchObject({
        outcome: "applied",
        operation: "errand-promote",
        allocation: { kind: "primary", checkoutPath: repository },
        identity: null,
        activeLocusPath: repository,
        sessionHomePath: repository,
      });
      expect(await git(repository, ["branch", "--show-current"])).toBe(branch);
      const meta = await readFile(join(repository, ".arc", "active", "meta-growth-unit.md"), "utf8");
      expect(meta).toContain(`# Metadata: growth-unit`);
      expect(meta).toContain(`\`${state}\``);
      expect(meta).toContain(`\`${branch}\``);
      if (floor === "derivation") expect(meta).toContain("draft-design");
      await expect(
        git(repository, ["cat-file", "-p", "refs/arc/user/test-user/errands:growing"]),
      ).rejects.toThrow();
    } finally {
      await removeGitBackedDir(remote);
      await removeGitBackedDir(harness.directory);
    }
  });
});
