/** Git adapter for enumerating and releasing local review materializations. */

import { stat } from "node:fs/promises";
import { join } from "node:path";

import type { GitExec } from "../../../../lib/git/exec.js";
import { resolveGitCommonDir } from "../../../../lib/user-sync/repo-shared-paths.js";
import { ReviewIdentifierSchema } from "../../core/gate-contract-v2-schema.js";
import { withRepositoryLocalReviewLock } from "./git-common-state.js";

const LOCAL_PIN_PREFIX = "refs/arc/review/local/";
const LOCAL_SCOPE_PIN_PREFIX = "refs/arc/review/local-scope/";

async function git(exec: GitExec, cwd: string, args: string[]): Promise<string> {
  return (await exec("git", args, { cwd })).stdout.trim();
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/** Git-common pin enumeration and exact materialization release. */
export class RepositoryLocalReviewSourceSweepAdapter {
  constructor(
    private readonly exec: GitExec,
    private readonly cwd: string,
  ) {}

  async listOperationIds(): Promise<string[]> {
    const output = await git(this.exec, this.cwd, [
      "for-each-ref",
      "--format=%(refname)",
      LOCAL_PIN_PREFIX,
    ]);
    return output === ""
      ? []
      : output.split("\n").map((ref) => {
        if (!ref.startsWith(LOCAL_PIN_PREFIX)) throw new Error("unexpected local review pin");
        return ReviewIdentifierSchema.parse(ref.slice(LOCAL_PIN_PREFIX.length));
      });
  }

  async release(operationIdInput: string): Promise<void> {
    await withRepositoryLocalReviewLock(this.exec, this.cwd, async () => {
      await this.releaseWithinLock(operationIdInput);
    });
  }

  /** Release one materialization while the caller holds the repository review source lock. */
  async releaseWithinLock(operationIdInput: string): Promise<void> {
    const operationId = ReviewIdentifierSchema.parse(operationIdInput);
    const commonDir = await resolveGitCommonDir(this.exec, this.cwd);
    const reviewRoot = join(commonDir, "arc", "review-gate", "materializations", operationId);
    if (await pathExists(reviewRoot)) {
      await git(this.exec, reviewRoot, ["reset", "--hard"]);
      await git(this.exec, reviewRoot, ["clean", "-fdx"]);
      await git(this.exec, this.cwd, ["worktree", "remove", reviewRoot]);
    } else {
      await git(this.exec, this.cwd, ["worktree", "prune"]);
    }
    const scopePrefix = `${LOCAL_SCOPE_PIN_PREFIX}${operationId}/`;
    const scopeRefs = await git(this.exec, this.cwd, [
      "for-each-ref",
      "--format=%(refname)",
      scopePrefix,
    ]);
    for (const reference of scopeRefs.split("\n").filter((value) => value !== "")) {
      if (!reference.startsWith(scopePrefix)) throw new Error("unexpected local review scope pin");
      await git(this.exec, this.cwd, ["update-ref", "-d", reference]);
    }
    await git(this.exec, this.cwd, ["update-ref", "-d", `${LOCAL_PIN_PREFIX}${operationId}`]);
  }
}
