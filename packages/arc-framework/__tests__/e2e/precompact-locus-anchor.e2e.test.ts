/** Real PreCompact seed emission beneath an attached Codex session locus. */

import { execFile } from "node:child_process";
import { chmod, copyFile, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CLI_PATH } from "../helpers/cli-spawn.js";
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
  const protectedConfig = config.replace("branch.protection: partial", "branch.protection: full");
  if (protectedConfig === config) throw new Error("Expected partial branch protection in the fixture.");
  await writeFile(path, protectedConfig);
}

async function createBareRemote(repository: string): Promise<string> {
  const remote = await mkdtemp(join(tmpdir(), "arc-precompact-anchor-remote-"));
  await execFileAsync("git", ["init", "--bare", "--initial-branch=main", remote]);
  await git(repository, ["remote", "add", "origin", remote]);
  await git(repository, ["push", "-u", "origin", "main"]);
  return remote;
}

async function createCodexHarness(): Promise<{ directory: string; executable: string }> {
  const directory = await mkdtemp(join(tmpdir(), "arc-precompact-anchor-codex-"));
  const executable = join(directory, "codex");
  await copyFile("/bin/bash", executable);
  await chmod(executable, 0o755);
  return { directory, executable };
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

describe("PreCompact locus anchor", () => {
  let repository: string;

  beforeEach(async () => {
    repository = await createTempRepo("arc-precompact-anchor-");
    const initialized = await runArc(["init", "--yes", "--name", "precompact-anchor"], repository);
    expect(initialized.exitCode, initialized.stderr || initialized.stdout).toBe(0);
    await setFullProtection(repository);
    await git(repository, ["add", "-A"]);
    await git(repository, ["commit", "--no-verify", "-m", "initialize fixture"]);
  });

  afterEach(async () => {
    await cleanupTempDir(repository);
  });

  it.runIf(process.platform === "linux")("recovers the exact locus seeded by the shipped Codex hook", async () => {
    const remote = await createBareRemote(repository);
    const harness = await createCodexHarness();
    const hookPath = join(
      repository,
      ".arc",
      "system",
      ".internal",
      "harness-hooks",
      "common",
      "pre-compact-seed.mjs",
    );
    const arcCommand = `${process.execPath} ${CLI_PATH}`;
    const hookCommand = [
      "ARC_HOOK_HARNESS=codex-cli",
      `ARC_HOOK_ARC_COMMAND=${shellQuote(arcCommand)}`,
      shellQuote(process.execPath),
      shellQuote(hookPath),
      "< /dev/null",
    ].join(" ");

    try {
      const sequence = await runArcAnchoredSequence([
        ["errand", "open", "seed-probe", "--intent", "prove PreCompact locus recovery", "--json"],
        { command: ["bash", "-lc", hookCommand] },
        ["recover", "audit", "--json"],
      ], repository, { timeout: 60_000, anchorShellPath: harness.executable });

      expect(sequence.exitCode, sequence.stderr || sequence.stdout).toBe(0);
      const opened = sequence.results[0] as Record<string, unknown>;
      expect(opened).toMatchObject({
        outcome: "applied",
        operation: "errand-open",
        recordId: expect.stringMatching(/^sha256:/u),
        leaseId: expect.any(String),
      });
      expect(sequence.results[1]).toMatchObject({
        mode: "recover-audit",
        verdict: {
          status: "ready",
          locusHint: {
            expected: {
              checkoutPath: repository,
              parentCheckoutPath: null,
            },
            actual: {
              checkoutPath: repository,
              parentCheckoutPath: null,
            },
            match: true,
          },
        },
      });

      const seed = JSON.parse(await readFile(
        join(repository, ".arc", "user", "test-user", ".internal", "compaction-seed.json"),
        "utf8",
      )) as Record<string, unknown>;
      expect(seed).toMatchObject({
        locus: {
          checkoutPath: repository,
          parentCheckoutPath: null,
        },
      });
      expect(seed).not.toHaveProperty("locusAbsence");
      expect(JSON.stringify(seed.locus)).not.toMatch(/recordId|leaseId|sessionHomePath/u);
    } finally {
      await removeGitBackedDir(remote);
      await removeGitBackedDir(harness.directory);
    }
  });
});
