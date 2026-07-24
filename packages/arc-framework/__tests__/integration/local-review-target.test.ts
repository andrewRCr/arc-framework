import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createExecaGitExec } from "../../src/lib/git/process-executor.js";
import {
  confirmLocalReviewTarget,
  deriveLocalReviewTarget,
  LocalTargetDerivationError,
} from "../../src/scripts/review-gate/hosts/local/repository-target.js";

const roots: string[] = [];
const exec = createExecaGitExec();
const repositoryId = "12345678-1234-1234-1234-123456789abc";

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

async function git(cwd: string, ...args: string[]): Promise<string> {
  return (await exec("git", args, { cwd })).stdout.trim();
}

async function createRepository(commit = true): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "arc-review-target-"));
  roots.push(root);
  await git(root, "init", "-b", "main");
  await git(root, "config", "user.name", "ARC Test");
  await git(root, "config", "user.email", "arc@example.test");
  if (commit) {
    await writeFile(join(root, "tracked.txt"), "initial\n", "utf8");
    await git(root, "add", "tracked.txt");
    await git(root, "commit", "-m", "initial");
  }
  return root;
}

async function expectInvalid(
  root: string,
  reason: LocalTargetDerivationError["reason"],
  baseRef = "main",
): Promise<void> {
  await expect(deriveLocalReviewTarget({ exec, cwd: root, baseRef, repositoryId }))
    .rejects.toMatchObject({ code: "invalid-input", reason });
}

describe("canonical local review target derivation", () => {
  it("refuses unborn, unresolved-base, dirty, and non-commit repositories as invalid input", async () => {
    await expectInvalid(await createRepository(false), "unborn-repository");

    const unresolved = await createRepository();
    await expectInvalid(unresolved, "unresolved-base", "missing");

    const dirty = await createRepository();
    await writeFile(join(dirty, "untracked.txt"), "dirty\n", "utf8");
    await expectInvalid(dirty, "dirty-worktree");

    const nonCommit = await createRepository();
    const tree = await git(nonCommit, "rev-parse", "HEAD^{tree}");
    await writeFile(join(nonCommit, ".git", "HEAD"), `${tree}\n`, "utf8");
    await expectInvalid(nonCommit, "non-commit-head");
  });

  it("derives exact commits, merge base, and trees from a clean repository", async () => {
    const root = await createRepository();
    await git(root, "switch", "-c", "feature");
    await writeFile(join(root, "tracked.txt"), "feature\n", "utf8");
    await git(root, "commit", "-am", "feature");

    const target = await deriveLocalReviewTarget({ exec, cwd: root, baseRef: "main", repositoryId });

    expect(target).toMatchObject({
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      kind: "change-set",
      repositoryId,
      baseRef: "main",
      diffBaseSha: await git(root, "rev-parse", "main"),
      diffBaseTree: await git(root, "rev-parse", "main^{tree}"),
      headSha: await git(root, "rev-parse", "HEAD"),
      headTree: await git(root, "rev-parse", "HEAD^{tree}"),
    });
  });

  it("reports a stale target when coordinates move before publication", async () => {
    const root = await createRepository();
    await git(root, "switch", "-c", "feature");
    const attemptedTarget = await deriveLocalReviewTarget({
      exec,
      cwd: root,
      baseRef: "main",
      repositoryId,
    });
    await writeFile(join(root, "tracked.txt"), "moved\n", "utf8");
    await git(root, "commit", "-am", "move target");

    await expect(confirmLocalReviewTarget({
      exec,
      cwd: root,
      attemptedTarget,
    })).resolves.toMatchObject({
      state: "stale-target",
      attemptedTarget,
      currentTarget: { headSha: await git(root, "rev-parse", "HEAD") },
    });
  });
});
