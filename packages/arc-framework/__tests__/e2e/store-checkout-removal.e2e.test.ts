/** Commands run from the checkout they remove complete through the built CLI on the ref store. */

import { execFile } from "node:child_process";
import { access, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { cleanupTempDir, createTempRepo, removeGitBackedDir, runArc, runArcAnchoredSequence } from "./store-default.js";
import { readStoreRecord } from "../helpers/store/seed-store.js";
import { seededWorkUnitSubject, seedWorkUnit } from "../helpers/store/seed-work-unit.js";
import { writeWorktreeMarker } from "../../src/lib/git/worktree-marker.js";
import { ArchiveQuarterSchema, SlugSchema } from "../../src/lib/kernel/index.js";

const execFileAsync = promisify(execFile);
const SEQUENCE_TIMEOUT_MS = 90_000;

async function git(cwd: string, args: string[]): Promise<string> {
  return (await execFileAsync("git", args, { cwd })).stdout.trim();
}

describe("commands that remove the checkout they run in (ref store)", () => {
  let repo: string;
  let origin: string;
  let checkouts: string;

  beforeEach(async () => {
    repo = await createTempRepo("arc-checkout-removal-");
    const init = await runArc(["init", "--yes", "--name", "test-project"], repo);
    expect(init.exitCode, init.stdout + init.stderr).toBe(0);
    const configPath = join(repo, ".arc", "system", "arc-config.yml");
    const config = await readFile(configPath, "utf8");
    await writeFile(configPath, config.replace("branch.protection: partial", "branch.protection: full"));
    await git(repo, ["add", "-A"]);
    await git(repo, ["-c", "core.hooksPath=/dev/null", "commit", "-m", "chore: initialize ARC"]);
    origin = await mkdtemp(join(tmpdir(), "arc-checkout-removal-origin-"));
    checkouts = await mkdtemp(join(tmpdir(), "arc-checkout-removal-wt-"));
    await git(origin, ["init", "--bare", "--initial-branch=main"]);
    await git(repo, ["remote", "add", "origin", origin]);
    await git(repo, ["push", "-u", "origin", "main"]);
    const designated = await runArc(["store", "remote", "origin", "push"], repo);
    expect(designated.exitCode, designated.stdout + designated.stderr).toBe(0);
  });

  afterEach(async () => {
    await git(repo, ["worktree", "prune"]).catch(() => undefined);
    for (const path of [checkouts, origin]) await removeGitBackedDir(path);
    await cleanupTempDir(repo);
  });

  it("abandons a work unit from the linked checkout ARC spawned for it, reaping its branch locally and remotely", async () => {
    const { meta } = await seedWorkUnit(repo, "mono", { identity: "test-user", branch: "feat/mono",
      meta: { state: "Active", owner: "test-user", branch: "feat/mono" } });
    await writeFile(join(repo, ".git", "info", "exclude"), ".arc/system/.internal/worktree-marker.json\n", { flag: "a" });
    const worktree = join(checkouts, "mono");
    await git(repo, ["worktree", "add", "-b", "feat/mono", worktree, "main"]);
    await writeWorktreeMarker(worktree, { spawnedByArc: true, wuName: "mono", createdFor: seededWorkUnitSubject(meta),
      spawningIdentity: "test-user", createdAt: "2026-10-24T00:00:00.000Z" });
    await writeFile(join(worktree, "work.txt"), "unlanded\n");
    await git(worktree, ["add", "work.txt"]);
    await git(worktree, ["-c", "core.hooksPath=/dev/null", "commit", "-m", "feat: unlanded work"]);
    await git(worktree, ["push", "-u", "origin", "feat/mono"]);

    const abandon = await runArc(["abandon", "mono", "--yes"], worktree);

    expect(abandon.exitCode, abandon.stdout + abandon.stderr).toBe(0);
    await expect(access(worktree)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await git(repo, ["branch", "--list", "feat/mono"])).toBe("");
    expect(await git(repo, ["ls-remote", "--heads", "origin", "feat/mono"])).toBe("");
    await expect(readStoreRecord(repo, SlugSchema.parse("test-user"), meta.reference)).rejects.toThrow(/not-found/u);
  }, SEQUENCE_TIMEOUT_MS);

  it("tears down a shipped work unit from its own checkout when self-teardown removes the checkout", async () => {
    await git(repo, ["checkout", "-b", "feat/demo"]);
    await writeFile(join(repo, "demo.txt"), "demo\n");
    await git(repo, ["add", "demo.txt"]);
    await git(repo, ["-c", "core.hooksPath=/dev/null", "commit", "-m", "feat: demo"]);
    await git(repo, ["checkout", "main"]);
    await git(repo, ["-c", "core.hooksPath=/dev/null", "merge", "--no-ff", "feat/demo", "-m", "merge: demo"]);
    await git(repo, ["push", "origin", "main"]);
    const { meta } = await seedWorkUnit(repo, "demo", { identity: "test-user", branch: "feat/demo",
      meta: { state: "Shipped", owner: "test-user", branch: "feat/demo", currentWorkflow: null, completed: "2026-07-14",
        prUrl: "https://example.test/pull/1" },
      placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q3") } });
    await writeFile(join(repo, ".git", "info", "exclude"), ".arc/system/.internal/worktree-marker.json\n", { flag: "a" });
    const worktree = join(checkouts, "demo");
    await git(repo, ["worktree", "add", worktree, "feat/demo"]);
    await writeWorktreeMarker(worktree, { spawnedByArc: true, wuName: "demo", createdFor: seededWorkUnitSubject(meta),
      spawningIdentity: "test-user", createdAt: "2026-07-14T00:00:00.000Z" });
    await git(repo, ["config", "arc.selfTeardownMode", "remove"]);

    const teardown = await runArc(["teardown", "demo"], worktree);

    expect(teardown.exitCode, teardown.stdout + teardown.stderr).toBe(0);
    await expect(access(worktree)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await git(repo, ["branch", "--list", "feat/demo"])).toBe("");
  }, SEQUENCE_TIMEOUT_MS);

  // Pausing keeps the Errand's branch, so its work is published first.
  it.each([
    { verb: "abandon", args: [] as string[], publish: false, keepsBranch: false },
    { verb: "close", args: [] as string[], publish: false, keepsBranch: false },
    { verb: "leave", args: ["--state", "paused"], publish: true, keepsBranch: true },
  ])("runs errand $verb from the Errand's own isolated checkout", async ({ verb, args, publish, keepsBranch }) => {
    const slug = `own-${verb}`;
    const sequence = await runArcAnchoredSequence([
      ["errand", "open", slug, "--isolate", "--json"],
      ...publish
        ? [{ command: ["git", "push", "origin", "HEAD"], cwdFromPreviousJson: "allocation.checkoutPath" },
          { args: ["errand", verb, slug, ...args, "--json"], reuseResolvedCwd: true as const }]
        : [{ args: ["errand", verb, slug, ...args, "--json"], cwdFromPreviousJson: "allocation.checkoutPath" }],
    ], repo, { timeout: SEQUENCE_TIMEOUT_MS });
    const [opened, ended] = sequence.results as [
      { allocation?: { checkoutPath?: string }; identity?: { branch?: string } } | undefined, unknown];
    const checkout = opened?.allocation?.checkoutPath, branch = opened?.identity?.branch;
    expect(checkout, JSON.stringify(opened)).toEqual(expect.any(String));
    expect(branch, JSON.stringify(opened)).toEqual(expect.any(String));

    expect(sequence.exitCode, sequence.stdout + sequence.stderr).toBe(0);
    expect(ended).toMatchObject({ outcome: "applied", checkoutPath: checkout });
    await expect(access(checkout!)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await git(repo, ["branch", "--list", branch!]) !== "").toBe(keepsBranch);
  }, SEQUENCE_TIMEOUT_MS);
});
