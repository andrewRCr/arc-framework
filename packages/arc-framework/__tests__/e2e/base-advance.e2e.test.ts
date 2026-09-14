/**
 * Base-advance harness behavior that only the spawned lane can establish.
 *
 * Two things cannot be shown in process: that the advance is identical when it rides inside one
 * persistent shell sequence as an interleaved step, and that a spawned verb resolving its own `git`
 * reports a typed unavailable verdict when the base read fails under it.
 */

import { execFile } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import {
  cleanupTempDir,
  createTempRepo,
  removeGitBackedDir,
  runArcAnchoredSequence,
  runArcNoTty,
} from "./helpers.js";
import {
  advanceBase,
  advanceBaseStep,
  arrangeBranchSide,
  writeUnavailableBaseReadShim,
} from "../helpers/base-advance.js";

const execFileAsync = promisify(execFile);
const cleanup: string[] = [];

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout.trim();
}

/** An initialized checkout on a work-unit branch, with a bare origin holding its base. */
async function fixture(): Promise<{ repo: string; remote: string; shimDir: string }> {
  const repo = await createTempRepo("arc-base-advance-");
  const remote = await mkdtemp(join(tmpdir(), "arc-base-advance-remote-"));
  const shimDir = await mkdtemp(join(tmpdir(), "arc-base-advance-shim-"));
  cleanup.push(repo, remote, shimDir);
  expect((await runArcNoTty(["init", "--yes", "--name", "test-project"], repo)).exitCode).toBe(0);
  await git(repo, ["add", "."]);
  await git(repo, ["commit", "--no-verify", "-m", "init"]);
  await execFileAsync("git", ["init", "--bare", remote]);
  await git(repo, ["remote", "add", "origin", remote]);
  await git(repo, ["push", "-u", "origin", "main"]);
  await git(repo, ["switch", "-c", "feat/sample-unit"]);
  await arrangeBranchSide({ cwd: repo, paths: ["src/branch-only-surface.ts"] });
  return { repo, remote, shimDir };
}

afterEach(async () => {
  while (cleanup.length > 0) {
    const path = cleanup.pop();
    if (path === undefined) continue;
    if (path.includes("arc-base-advance-remote-")) await removeGitBackedDir(path);
    else await cleanupTempDir(path);
  }
});

describe("advancing the base from inside an anchored sequence", () => {
  it("advances identically when run as an interleaved step", async () => {
    const { repo, remote } = await fixture();
    const before = await git(repo, ["rev-parse", "refs/remotes/origin/main"]);

    const sequence = await runArcAnchoredSequence(
      [
        { command: ["git", "rev-parse", "HEAD"], cwd: repo },
        advanceBaseStep({ cwd: repo, paths: ["src/base-only-surface.ts"] }),
        { command: ["git", "rev-parse", "refs/remotes/origin/main"], cwd: repo },
      ],
      repo,
    );

    expect(sequence.exitCode).toBe(0);
    const after = await git(remote, ["rev-parse", "refs/heads/main"]);
    expect(after).not.toBe(before);
    // The step publishes through the same path the in-process form does, so the checkout it ran
    // in sees the advance without a further fetch.
    expect(await git(repo, ["rev-parse", "refs/remotes/origin/main"])).toBe(after);
  });

  it("leaves the checkout on its own branch after the step runs", async () => {
    const { repo } = await fixture();

    await runArcAnchoredSequence(
      [advanceBaseStep({ cwd: repo, paths: ["src/base-only-surface.ts"] })],
      repo,
    );

    expect(await git(repo, ["rev-parse", "--abbrev-ref", "HEAD"])).toBe("feat/sample-unit");
    expect(await git(repo, ["status", "--porcelain"])).toBe("");
  });
});

describe("an unavailable base read under a spawned verb", () => {
  it("reports the typed unavailable verdict when the shim is armed", async () => {
    const { repo, shimDir } = await fixture();
    await advanceBase({ cwd: repo, paths: ["src/base-only-surface.ts"] });
    const shim = await writeUnavailableBaseReadShim({ dir: shimDir });

    const result = await runArcNoTty(["base", "drift", "--json"], repo, {
      env: { ...shim.env, [shim.armVariable]: "1" },
    });

    const drift = JSON.parse(result.stdout) as { verdict: string; baseOid: string | null };
    expect(drift.verdict).toBe("unavailable");
    expect(drift.baseOid).toBeNull();
  });

  it("leaves the same verb reporting an available base when the shim is not armed", async () => {
    const { repo, shimDir } = await fixture();
    await advanceBase({ cwd: repo, paths: ["src/base-only-surface.ts"] });
    const shim = await writeUnavailableBaseReadShim({ dir: shimDir });

    const result = await runArcNoTty(["base", "drift", "--json"], repo, { env: shim.env });

    const drift = JSON.parse(result.stdout) as { verdict: string; baseOid: string | null };
    expect(drift.verdict).not.toBe("unavailable");
    expect(drift.baseOid).not.toBeNull();
  });
});
