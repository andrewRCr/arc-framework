/** Ephemeral detached exact-head checkout for one frontline provider run. */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { GitExec } from "../../../../lib/git/exec.js";
import { RepositoryGitCommonStatePublisher } from "../../../../lib/git-common-state.js";
import type { ReviewTarget } from "../../core/gate-contract-v2-schema.js";
import { resolveRepositoryIdentity } from "./git-common-state.js";
import { deriveLocalReviewTarget } from "./repository-target.js";

/** Materialize and independently re-derive one exact frontline execution target. */
export async function prepareFrontlineTargetMaterialization(input: {
  exec: GitExec;
  cwd: string;
  target: ReviewTarget;
}): Promise<{
  target: ReviewTarget;
  reviewRoot: string;
  release(): Promise<void>;
}> {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "arc-frontline-review-"));
  const reviewRoot = join(temporaryRoot, "checkout");
  let added = false;
  const release = async () => {
    try {
      if (added) {
        await input.exec("git", ["worktree", "remove", "--force", reviewRoot], { cwd: input.cwd });
        added = false;
      }
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  };
  try {
    await input.exec("git", ["worktree", "add", "--detach", reviewRoot, input.target.headSha], {
      cwd: input.cwd,
    });
    added = true;
    const repositoryId = await resolveRepositoryIdentity(
      new RepositoryGitCommonStatePublisher(input.exec, reviewRoot),
    );
    const target = await deriveLocalReviewTarget({
      exec: input.exec,
      cwd: reviewRoot,
      baseRef: input.target.baseRef,
      repositoryId,
      ...(input.target.kind === "delivery-member"
        ? {
            memberCoordinates: {
              headSha: input.target.headSha,
              diffBaseSha: input.target.diffBaseSha,
            },
          }
        : {}),
    });
    return { target, reviewRoot, release };
  } catch (error) {
    await release();
    throw error;
  }
}
