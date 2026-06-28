/**
 * Integration tests for `closeErrand` — the `arc errand close` composed core —
 * over a real temp repo with a bare remote. `close` removes the identity record
 * and pushes the removal, reaps the branch (containment-safe) and prunes the
 * stale remote-tracking ref, and is an idempotent no-op when no record exists.
 *
 * The reap is containment-safe: the local branch is deleted only when its commits
 * are provably preserved — contained in `origin/<branch>` (pushed) or in `base`
 * (merged). An unsafe branch is refused with the record left intact, so an
 * abandoned errand stays recoverable. The slug-matched inbox drop is the handler's
 * composition (file I/O over the gitignored inbox), covered at the e2e layer.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  createTempRepo,
  cleanupTempDir,
  makeCommit,
  addBareRemote,
  makeGitExec,
  makeGitExecInput,
  execFileAsync,
} from "../helpers/integration.js";
import {
  openErrand,
  closeErrand,
  readErrandRecord,
  errandsRef,
  type ErrandRecordIO,
} from "../../src/lib/errand/index.js";

const IDENTITY = "andrew";
const REF = errandsRef(IDENTITY);
const CREATED_AT = "2026-06-19T12:00:00.000Z";

function ioFor(dir: string): ErrandRecordIO {
  return { exec: makeGitExec(dir), execInput: makeGitExecInput(dir), identity: IDENTITY };
}

async function git(dir: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd: dir });
  return stdout;
}

/** Add an empty commit on the current branch. */
async function commitOn(dir: string, message: string): Promise<void> {
  await execFileAsync("git", ["commit", "--allow-empty", "--no-verify", "-m", message], { cwd: dir });
}

async function currentBranch(dir: string): Promise<string> {
  try {
    return (await git(dir, ["symbolic-ref", "--quiet", "--short", "HEAD"])).trim();
  } catch {
    // Detached HEAD falls back to the conventional branch-name probe.
  }
  return (await git(dir, ["rev-parse", "--abbrev-ref", "HEAD"])).trim();
}

async function branchExists(dir: string, branch: string): Promise<boolean> {
  try {
    await git(dir, ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`]);
    return true;
  } catch {
    return false;
  }
}

/** Slugs present on the remote errand ref. */
async function remoteSlugs(dir: string): Promise<string[]> {
  const { stdout } = await execFileAsync("git", ["ls-remote", "origin", REF], { cwd: dir });
  if (stdout.trim() === "") return [];
  const { stdout: ls } = await execFileAsync(
    "git",
    ["ls-tree", "--name-only", `${stdout.trim().split(/\s+/u)[0]}^{tree}`],
    { cwd: dir },
  );
  return ls.split("\n").map((s) => s.trim()).filter(Boolean).sort();
}

describe("closeErrand", () => {
  let dir: string;
  let remoteDir: string;
  let io: ErrandRecordIO;

  beforeEach(async () => {
    dir = await createTempRepo();
    await makeCommit(dir, "init");
    remoteDir = await addBareRemote(dir);
    io = ioFor(dir);
  });

  afterEach(async () => {
    // Best-effort cleanup — never let a cleanup error (e.g. an early beforeEach
    // failure leaving a path unassigned) mask the real test/setup failure.
    try {
      await Promise.all([dir, remoteDir].map(cleanupTempDir));
    } catch {
      // ignored
    }
  });

  it("removes the record and pushes the removal, reaping the branch and hopping off it", async () => {
    await openErrand(io, { slug: "done", base: "main", createdAt: CREATED_AT });
    expect(await remoteSlugs(dir)).toEqual(["done"]);

    const result = await closeErrand(io, { slug: "done", base: "main" });

    expect(result.kind).toBe("closed");
    expect(await readErrandRecord(io, "done")).toBeNull();
    expect(await remoteSlugs(dir)).toEqual([]);
    expect(await currentBranch(dir)).toBe("main");
    expect(await branchExists(dir, "chore/done")).toBe(false);
  });

  it("reaps a pushed branch and prunes its remote-tracking ref", async () => {
    await openErrand(io, { slug: "pushed-errand", base: "main", createdAt: CREATED_AT });
    // Push the branch so an upstream exists — the preserved-on-remote safe path.
    await git(dir, ["push", "origin", "chore/pushed-errand"]);
    expect(
      (await git(dir, ["rev-parse", "--verify", "refs/remotes/origin/chore/pushed-errand"])).trim(),
    ).toMatch(/^[0-9a-f]{40}$/u);

    const result = await closeErrand(io, { slug: "pushed-errand", base: "main" });

    expect(result.kind).toBe("closed");
    expect(await branchExists(dir, "chore/pushed-errand")).toBe(false);
    await expect(
      git(dir, ["rev-parse", "--verify", "refs/remotes/origin/chore/pushed-errand"]),
    ).rejects.toThrow();
  });

  it("reaps a branch whose commits are merged into base even with no upstream", async () => {
    await openErrand(io, { slug: "merged", base: "main", createdAt: CREATED_AT });
    await commitOn(dir, "errand change"); // a commit on chore/merged
    await git(dir, ["switch", "main"]);
    await git(dir, ["merge", "--no-ff", "chore/merged", "-m", "merge errand"]);

    const result = await closeErrand(io, { slug: "merged", base: "main" });

    expect(result.kind).toBe("closed");
    expect(await branchExists(dir, "chore/merged")).toBe(false);
  });

  it("refuses to reap an unmerged, unpushed branch and keeps the record recoverable", async () => {
    await openErrand(io, { slug: "wip", base: "main", type: "fix", createdAt: CREATED_AT });
    await commitOn(dir, "unfinished work"); // chore/... ahead of base, never pushed
    await git(dir, ["switch", "main"]);

    const result = await closeErrand(io, { slug: "wip", base: "main" });

    expect(result.kind).toBe("unsafe-reap");
    expect(await branchExists(dir, "fix/wip")).toBe(true);
    expect(await readErrandRecord(io, "wip")).not.toBeNull();
    expect(await remoteSlugs(dir)).toEqual(["wip"]); // record (pushed at open) untouched
  });

  it("force-reaps an otherwise-unsafe branch and removes the record", async () => {
    await openErrand(io, { slug: "shipped-squash", base: "main", type: "fix", createdAt: CREATED_AT });
    await commitOn(dir, "work that squash-merged"); // ahead of base, never pushed → unsafe
    await git(dir, ["switch", "main"]);

    const result = await closeErrand(io, { slug: "shipped-squash", base: "main", force: true });

    expect(result.kind).toBe("closed");
    expect(await branchExists(dir, "fix/shipped-squash")).toBe(false);
    expect(await readErrandRecord(io, "shipped-squash")).toBeNull();
  });

  it("force-closes and removes the record when the local branch is already gone", async () => {
    const opened = await openErrand(io, { slug: "host-deleted", base: "main", createdAt: CREATED_AT });
    await git(dir, ["switch", "main"]);
    await git(dir, ["update-ref", "-d", `refs/heads/${opened.record.branch}`]);
    expect(await branchExists(dir, opened.record.branch)).toBe(false);

    const result = await closeErrand(io, { slug: "host-deleted", base: "main", force: true });

    expect(result.kind).toBe("closed");
    if (result.kind === "closed") {
      expect(result.branchReaped).toBe(false);
    }
    expect(await branchExists(dir, opened.record.branch)).toBe(false);
    expect(await readErrandRecord(io, "host-deleted")).toBeNull();
    expect(await remoteSlugs(dir)).toEqual([]);
  });

  it("force-closes an already-gone current branch after hopping back to base", async () => {
    const opened = await openErrand(io, { slug: "dead-head", base: "main", createdAt: CREATED_AT });
    expect(await currentBranch(dir)).toBe(opened.record.branch);
    await git(dir, ["update-ref", "-d", `refs/heads/${opened.record.branch}`]);
    expect(await branchExists(dir, opened.record.branch)).toBe(false);
    expect(await currentBranch(dir)).toBe(opened.record.branch);

    const result = await closeErrand(io, { slug: "dead-head", base: "main", force: true });

    expect(result.kind).toBe("closed");
    expect(await currentBranch(dir)).toBe("main");
    expect(await readErrandRecord(io, "dead-head")).toBeNull();
  });

  it("refuses an already-gone branch without force and names the force escape", async () => {
    const opened = await openErrand(io, { slug: "needs-force", base: "main", createdAt: CREATED_AT });
    await git(dir, ["switch", "main"]);
    await git(dir, ["update-ref", "-d", `refs/heads/${opened.record.branch}`]);

    const result = await closeErrand(io, { slug: "needs-force", base: "main" });

    expect(result.kind).toBe("unsafe-reap");
    if (result.kind === "unsafe-reap") {
      expect(result.reason).toContain("--force");
    }
    expect(await readErrandRecord(io, "needs-force")).not.toBeNull();
    expect(await remoteSlugs(dir)).toEqual(["needs-force"]);
  });

  it("propagates unexpected branch-existence lookup failures", async () => {
    const opened = await openErrand(io, { slug: "lookup-fails", base: "main", createdAt: CREATED_AT });
    await git(dir, ["switch", "main"]);
    const brokenIo: ErrandRecordIO = {
      ...io,
      exec: async (cmd, args, options) => {
        if (args[0] === "show-ref" && args.at(-1) === `refs/heads/${opened.record.branch}`) {
          throw Object.assign(new Error("git show-ref exploded"), { code: 128 });
        }
        return io.exec(cmd, args, options);
      },
    };

    await expect(closeErrand(brokenIo, { slug: "lookup-fails", base: "main", force: true }))
      .rejects.toThrow("git show-ref exploded");
    expect(await readErrandRecord(io, "lookup-fails")).not.toBeNull();
  });

  it("is a no-op when no record exists for the slug", async () => {
    expect(await closeErrand(io, { slug: "ghost", base: "main" })).toEqual({
      kind: "no-record",
      slug: "ghost",
    });
  });
});
