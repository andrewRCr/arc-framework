import { execFile } from "node:child_process";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import type { GitExec } from "../../../src/lib/git/exec.js";
import {
  ensureWorktreeMarkerIgnored,
  nodeWorktreeMarkerIgnoreFs,
  writeWorktreeOwnershipMarker,
} from "../../../src/lib/git/worktree-marker.js";
import { decomposeCandidateBranch } from "../../../src/lib/work-unit/decompose-candidate.js";
import { cleanupGitOwnedDecomposeCandidate } from "../../../src/lib/work-unit/git-owned-decompose-candidate-cleanup.js";

const execFileAsync = promisify(execFile);
const roots: string[] = [];

async function git(cwd: string, args: readonly string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd, encoding: "utf8" });
  return stdout;
}

const exec: GitExec = async (_command, args, options) => ({
  stdout: await git(options?.cwd ?? process.cwd(), args),
  stderr: "",
});

async function candidateRepository() {
  const root = await mkdtemp(join(tmpdir(), "arc-owned-candidate-"));
  roots.push(root);
  await git(root, ["init", "-q"]);
  await git(root, ["config", "user.email", "arc@example.com"]);
  await git(root, ["config", "user.name", "ARC Test"]);
  await writeFile(join(root, "seed.txt"), "seed\n");
  await git(root, ["add", "seed.txt"]);
  await git(root, ["commit", "-qm", "seed"]);
  const head = (await git(root, ["rev-parse", "HEAD"])).trim();
  const branch = decomposeCandidateBranch("origin");
  const path = join(root, "candidate");
  await git(root, ["worktree", "add", "-q", "-b", branch, path, head]);
  await ensureWorktreeMarkerIgnored(path, exec, nodeWorktreeMarkerIgnoreFs);
  await writeWorktreeOwnershipMarker(path, {
    createdByArc: true,
    createdFor: { kind: "branch", ref: branch },
    spawningIdentity: "test",
  });
  return { root, path, branch, head };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => await rm(root, { recursive: true, force: true })));
});

describe("cleanupGitOwnedDecomposeCandidate", () => {
  it("resets candidate-local staged drift before removing the owned projection", async () => {
    const candidate = await candidateRepository();
    await writeFile(join(candidate.path, "seed.txt"), "staged drift\n");
    await git(candidate.path, ["add", "seed.txt"]);

    const result = await cleanupGitOwnedDecomposeCandidate({
      origin: "origin",
      expectedHead: candidate.head,
      expectedPath: candidate.path,
    }, { cwd: candidate.root, exec });

    expect(result).toEqual({
      status: "cleaned",
      branch: candidate.branch,
      branchOutcome: "deleted",
      worktreeOutcome: "removed",
    });
    await expect(access(candidate.path)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await git(candidate.root, ["branch", "--list", candidate.branch])).toBe("");
  });

  it("preserves unstaged candidate content", async () => {
    const candidate = await candidateRepository();
    await writeFile(join(candidate.path, "seed.txt"), "unstaged content\n");

    const result = await cleanupGitOwnedDecomposeCandidate({
      origin: "origin",
      expectedHead: candidate.head,
      expectedPath: candidate.path,
    }, { cwd: candidate.root, exec });

    expect(result).toEqual({ status: "refused", reason: "candidate-user-content" });
    await expect(access(candidate.path)).resolves.toBeUndefined();
    expect(await git(candidate.root, ["branch", "--list", candidate.branch])).toContain(candidate.branch);
  });

  it("preserves untracked candidate content", async () => {
    const candidate = await candidateRepository();
    await writeFile(join(candidate.path, "local-only.txt"), "untracked content\n");

    const result = await cleanupGitOwnedDecomposeCandidate({
      origin: "origin",
      expectedHead: candidate.head,
      expectedPath: candidate.path,
    }, { cwd: candidate.root, exec });

    expect(result).toEqual({ status: "refused", reason: "candidate-user-content" });
    await expect(access(join(candidate.path, "local-only.txt"))).resolves.toBeUndefined();
    expect(await git(candidate.root, ["branch", "--list", candidate.branch])).toContain(candidate.branch);
  });

  it("retries branch cleanup after the owned worktree is already absent", async () => {
    const candidate = await candidateRepository();
    await git(candidate.root, ["worktree", "remove", candidate.path]);

    const result = await cleanupGitOwnedDecomposeCandidate({
      origin: "origin",
      expectedHead: candidate.head,
      expectedPath: candidate.path,
    }, { cwd: candidate.root, exec });

    expect(result).toEqual({
      status: "cleaned",
      branch: candidate.branch,
      branchOutcome: "deleted",
      worktreeOutcome: "already-absent",
    });
    expect(await git(candidate.root, ["branch", "--list", candidate.branch])).toBe("");
  });

  it("refuses a marker owned by another branch", async () => {
    const candidate = await candidateRepository();
    await writeWorktreeOwnershipMarker(candidate.path, {
      createdByArc: true,
      createdFor: { kind: "branch", ref: "chore/decompose-other" },
      spawningIdentity: "other",
    });

    const result = await cleanupGitOwnedDecomposeCandidate({
      origin: "origin",
      expectedHead: candidate.head,
      expectedPath: candidate.path,
    }, { cwd: candidate.root, exec });

    expect(result).toEqual({ status: "refused", reason: "candidate-marker-mismatch" });
    await expect(access(candidate.path)).resolves.toBeUndefined();
    expect(await git(candidate.root, ["branch", "--list", candidate.branch])).toContain(candidate.branch);
  });

  it("preserves a candidate branch that moves after worktree removal", async () => {
    const candidate = await candidateRepository();
    await writeFile(join(candidate.root, "new-base.txt"), "new base\n");
    await git(candidate.root, ["add", "new-base.txt"]);
    await git(candidate.root, ["commit", "-qm", "move target"]);
    const movedHead = (await git(candidate.root, ["rev-parse", "HEAD"])).trim();

    const result = await cleanupGitOwnedDecomposeCandidate({
      origin: "origin",
      expectedHead: candidate.head,
      expectedPath: candidate.path,
    }, {
      cwd: candidate.root,
      exec,
      removeWorktree: async (path) => {
        await git(candidate.root, ["worktree", "remove", path]);
        await git(candidate.root, ["update-ref", `refs/heads/${candidate.branch}`, movedHead]);
      },
    });

    expect(result).toEqual({ status: "refused", reason: "candidate-cleanup-raced" });
    expect((await git(candidate.root, ["rev-parse", candidate.branch])).trim()).toBe(movedHead);
  });
});
