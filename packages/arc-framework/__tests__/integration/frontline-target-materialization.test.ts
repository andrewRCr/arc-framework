import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createExecaGitExec } from "../../src/lib/git/process-executor.js";
import {
  prepareFrontlineTargetMaterialization,
} from "../../src/scripts/review-gate/hosts/local/frontline-materialization.js";
import {
  RepositoryGitCommonStatePublisher,
} from "../../src/lib/git-common-state.js";
import {
  resolveRepositoryIdentity,
} from "../../src/scripts/review-gate/hosts/local/git-common-state.js";
import {
  deriveLocalReviewTarget,
} from "../../src/scripts/review-gate/hosts/local/repository-target.js";

const roots: string[] = [];
const exec = createExecaGitExec();

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

async function git(cwd: string, ...args: string[]): Promise<string> {
  return (await exec("git", args, { cwd })).stdout.trim();
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "arc-frontline-target-"));
  roots.push(root);
  await git(root, "init", "-b", "main");
  await git(root, "config", "user.name", "ARC Test");
  await git(root, "config", "user.email", "arc@example.test");
  await writeFile(join(root, "tracked.txt"), "base\n", "utf8");
  await git(root, "add", "tracked.txt");
  await git(root, "commit", "-m", "base");
  await git(root, "switch", "-c", "feature");
  await writeFile(join(root, "tracked.txt"), "feature\n", "utf8");
  await git(root, "commit", "-am", "feature");
  const repositoryId = await resolveRepositoryIdentity(
    new RepositoryGitCommonStatePublisher(exec, root),
  );
  return {
    root,
    target: await deriveLocalReviewTarget({ exec, cwd: root, baseRef: "main", repositoryId }),
  };
}

describe("frontline exact-target materialization", () => {
  it("re-derives and retains the exact detached head while the caller branch moves away and returns", async () => {
    const records = await fixture();
    const materialized = await prepareFrontlineTargetMaterialization({
      exec,
      cwd: records.root,
      target: records.target,
    });

    expect(materialized.target).toEqual(records.target);
    expect(materialized.target.kind).toBe("change-set");
    expect(await git(materialized.reviewRoot, "rev-parse", "HEAD")).toBe(records.target.headSha);
    expect(await git(materialized.reviewRoot, "branch", "--show-current")).toBe("");

    await writeFile(join(records.root, "tracked.txt"), "moved\n", "utf8");
    await git(records.root, "commit", "-am", "move caller");
    await git(records.root, "reset", "--hard", records.target.headSha);

    expect(await git(materialized.reviewRoot, "rev-parse", "HEAD")).toBe(records.target.headSha);
    await materialized.release();
    await expect(access(materialized.reviewRoot)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("preserves delivery-member kind and predecessor coordinates", async () => {
    const records = await fixture();
    const memberTarget = await deriveLocalReviewTarget({
      exec,
      cwd: records.root,
      baseRef: records.target.baseRef,
      repositoryId: records.target.repositoryId,
      memberCoordinates: {
        headSha: records.target.headSha,
        diffBaseSha: records.target.diffBaseSha,
      },
    });

    const materialized = await prepareFrontlineTargetMaterialization({
      exec,
      cwd: records.root,
      target: memberTarget,
    });
    expect(materialized.target).toEqual(memberTarget);
    expect(materialized.target.kind).toBe("delivery-member");
    expect(materialized.target.diffBaseSha).toBe(memberTarget.diffBaseSha);
    await materialized.release();
  });
});
