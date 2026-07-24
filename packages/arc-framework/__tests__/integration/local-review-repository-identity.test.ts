import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createExecaGitExec } from "../../src/lib/git/process-executor.js";
import {
  RepositoryGitCommonStatePublisher,
  resolveRepositoryIdentity,
} from "../../src/scripts/review-gate/hosts/local/git-common-state.js";

const roots: string[] = [];
const exec = createExecaGitExec();

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

async function git(cwd: string, ...args: string[]): Promise<string> {
  return (await exec("git", args, { cwd })).stdout.trim();
}

describe("local review repository identity", () => {
  it("mints once and resolves the same identity across sibling worktrees and relocation", async () => {
    const parent = await mkdtemp(join(tmpdir(), "arc-review-repository-identity-"));
    roots.push(parent);
    const root = join(parent, "repository");
    const sibling = join(parent, "sibling");
    const relocated = join(parent, "relocated");

    await git(parent, "init", "-b", "main", root);
    await git(root, "config", "user.name", "ARC Test");
    await git(root, "config", "user.email", "arc@example.test");
    await writeFile(join(root, "tracked.txt"), "initial\n", "utf8");
    await git(root, "add", "tracked.txt");
    await git(root, "commit", "-m", "initial");
    await git(root, "worktree", "add", "-b", "sibling", sibling);

    const minted = await resolveRepositoryIdentity(new RepositoryGitCommonStatePublisher(exec, root));
    const resolved = await resolveRepositoryIdentity(new RepositoryGitCommonStatePublisher(exec, root));
    const fromSibling = await resolveRepositoryIdentity(new RepositoryGitCommonStatePublisher(exec, sibling));

    expect(minted).toMatch(/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u);
    expect(resolved).toBe(minted);
    expect(fromSibling).toBe(minted);

    await git(root, "worktree", "move", sibling, relocated);
    await expect(resolveRepositoryIdentity(
      new RepositoryGitCommonStatePublisher(exec, relocated),
    )).resolves.toBe(minted);
  });
});
