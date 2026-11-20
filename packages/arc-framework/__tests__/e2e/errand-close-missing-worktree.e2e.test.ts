/** Errand closure with stale registrations in a real Git repository. */

import { execFile } from "node:child_process";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { expect, it } from "vitest";

import { SlugSchema } from "../../src/lib/kernel/index.js";
import { OwnerIdentitySchema, recordReferences } from "../../src/lib/store/identity.js";
import { initializedRepository } from "../helpers/initialized-repository.js";
import { readStoreRecord } from "../helpers/store/seed-store.js";
import { cleanupTempDir, git, runArc, runArcAnchoredSequence } from "./store-default.js";

const execFileAsync = promisify(execFile);

/** The Errand the store holds under a slug, with the placement that says whether it is live. */
async function readErrand(repository: string, slug: string): Promise<{ claimId: string; placement: string | undefined }> {
  const record = await readStoreRecord(repository, SlugSchema.parse("test-user"), recordReferences["work-item/record"](
    OwnerIdentitySchema.parse({ type: "work-item", name: slug })));
  return { claimId: (JSON.parse(record.content) as { claimId: string }).claimId, placement: record.placement?.kind };
}

/** The branch an applied Errand open reports, which the store suffixes with the generation it mints. */
function openedBranch(result: unknown): string {
  const branch = (result as { identity?: { branch?: unknown } } | undefined)?.identity?.branch;
  if (typeof branch !== "string") throw new Error("The open reported no branch");
  return branch;
}

async function prepareRepository(repository: string, remote: string): Promise<void> {
  const configPath = join(repository, ".arc", "system", "arc-config.yml");
  const config = await readFile(configPath, "utf8");
  expect(config).toContain("branch.protection: partial");
  await writeFile(configPath, config.replace("branch.protection: partial", "branch.protection: full"));
  await git(repository, ["add", "-A"]);
  const tree = await git(repository, ["write-tree"]);
  const parent = await git(repository, ["rev-parse", "HEAD"]);
  const commit = await git(repository, ["commit-tree", tree, "-p", parent, "-m", "enable full protection"]);
  await git(repository, ["update-ref", "HEAD", commit, parent]);
  await execFileAsync("git", ["init", "--bare", "--initial-branch=main", remote]);
  await git(repository, ["remote", "add", "origin", remote]);
  await git(repository, ["push", "-u", "origin", "main"]);
  const designated = await runArc(["store", "remote", "origin", "push"], repository);
  expect(designated.exitCode, designated.stderr).toBe(0);
}

it.each(["close", "abandon"])("%s leaves unrelated missing detached and branched registrations intact", async (operation) => {
  const repository = await initializedRepository("initialized-and-committed", "process");
  const remote = await mkdtemp(join(tmpdir(), "arc-close-missing-remote-"));
  const detached = `${repository}-missing-detached`;
  const branched = `${repository}-missing-branched`;
  const slug = `stale-registration-${operation}`;
  try {
    await prepareRepository(repository, remote);
    await git(repository, ["worktree", "add", "--detach", detached]);
    await git(repository, ["worktree", "add", "-b", "chore/unrelated", branched]);
    await rm(detached, { recursive: true });
    await rm(branched, { recursive: true });
    const before = await git(repository, ["worktree", "list", "--porcelain", "-z"]);
    expect(before).toContain(detached);
    expect(before).toContain(branched);
    expect(before).toContain("prunable ");

    const result = await runArcAnchoredSequence([
      ["errand", "open", slug, "--json"],
      ["errand", operation, slug, "--json"],
    ], repository, { timeout: 60_000 });

    expect(result.exitCode, result.stderr || result.stdout).toBe(0);
    expect(result.results).toMatchObject([
      { outcome: "applied", operation: "errand-open" },
      { outcome: "applied", operation: `errand-${operation}`, subject: { slug } },
    ]);
    expect(await git(repository, ["branch", "--show-current"])).toBe("main");
    expect(await git(repository, ["branch", "--list", openedBranch(result.results[0])])).toBe("");
    expect((await readErrand(repository, slug)).placement).toBe("completed");
    expect(await git(repository, ["worktree", "list", "--porcelain", "-z"])).toBe(before);
    expect(await git(repository, ["rev-parse", "chore/unrelated"])).toBe(await git(repository, ["rev-parse", "main"]));
    const gitDir = await git(repository, ["rev-parse", "--absolute-git-dir"]);
    await expect(access(join(gitDir, "HEAD.lock"))).rejects.toMatchObject({ code: "ENOENT" });
  } finally {
    await cleanupTempDir(repository);
    await cleanupTempDir(remote);
    await cleanupTempDir(detached);
    await cleanupTempDir(branched);
  }
}, 90_000);

it("refuses a locked missing branch holder, then closes after its registration is intentionally retired", async () => {
  const repository = await initializedRepository("initialized-and-committed", "process");
  const remote = await mkdtemp(join(tmpdir(), "arc-close-locked-remote-"));
  const missing = `${repository}-locked-missing`;
  const slug = "locked-missing-close";
  try {
    await prepareRepository(repository, remote);
    const result = await runArcAnchoredSequence([
      ["errand", "open", slug, "--json"],
      // The open checks its suffixed branch out in place, so the second holder takes it from the primary.
      { command: ["sh", "-c", 'git worktree add --force "$1" "$(git branch --show-current)"', "sh", missing] },
      { command: ["git", "worktree", "lock", "--reason", "portable storage", missing] },
      { command: [process.execPath, "-e", "require('node:fs').rmSync(process.argv[1],{recursive:true})", missing] },
      ["errand", "close", slug, "--json"],
    ], repository, { timeout: 60_000 });
    expect(result.exitCode, result.stdout + result.stderr).toBe(1);
    expect(result.results.at(-1)).toMatchObject({ outcome: "refused", operation: "errand-close" });
    expect(result.stdout).toContain(missing);
    expect(result.stdout).toContain("unlock");
    const branch = openedBranch(result.results[0]);
    expect(await git(repository, ["branch", "--list", branch])).toContain(branch);
    const record = await readErrand(repository, slug);
    await git(repository, ["worktree", "unlock", missing]);
    await git(repository, ["worktree", "prune"]);
    const retried = await runArcAnchoredSequence([
      ["errand", "close", slug, "--confirm-foreign-generation", `errand-v1/${slug}/${record.claimId}`, "--json"],
    ], repository, { timeout: 60_000 });
    expect(retried.exitCode, retried.stdout + retried.stderr).toBe(0);
    expect(retried.results.at(-1)).toMatchObject({ outcome: "applied", operation: "errand-close" });
    expect(await git(repository, ["branch", "--list", branch])).toBe("");
    expect((await readErrand(repository, slug)).placement).toBe("completed");
  } finally {
    await cleanupTempDir(repository);
    await cleanupTempDir(remote);
    await cleanupTempDir(missing);
  }
}, 90_000);
