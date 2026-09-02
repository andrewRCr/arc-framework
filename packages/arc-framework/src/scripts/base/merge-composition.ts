/** Production Git composition for the exact-base merge procedure. */

import { boundedGitInvocation, type GitExec } from "../../lib/git/exec.js";
import { DEFAULT_NETWORK_TIMEOUT_MS } from "../../lib/git/remote-ref-reader.js";
import { isGitProcessError } from "../../lib/git/process-error.js";
import type { BaseMergePort } from "./merge.js";

async function resolveOid(exec: GitExec, cwd: string, ref: string): Promise<string> {
  const oid = (await exec("git", ["rev-parse", "--verify", ref], {
    cwd,
    objectAccess: "local-only",
  })).stdout.trim();
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(oid)) {
    throw new Error(`Git returned an invalid object ID for ${ref}.`);
  }
  return oid;
}

async function mergeInProgress(exec: GitExec, cwd: string): Promise<boolean> {
  try {
    await exec("git", ["rev-parse", "--verify", "MERGE_HEAD"], {
      cwd,
      objectAccess: "local-only",
    });
    return true;
  } catch {
    return false;
  }
}

async function hasUnmergedEntries(exec: GitExec, cwd: string): Promise<boolean> {
  return (await exec("git", ["diff", "--name-only", "--diff-filter=U"], {
    cwd,
    objectAccess: "local-only",
  })).stdout.trim() !== "";
}

async function resolveParents(exec: GitExec, cwd: string, commitOid: string): Promise<string[]> {
  const fields = (await exec("git", ["rev-list", "--parents", "-n", "1", commitOid], {
    cwd,
    objectAccess: "local-only",
  })).stdout.trim().split(/\s+/u);
  if (fields.shift() !== commitOid || fields.some((field) => !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(field))) {
    throw new Error("Git returned malformed merge-parent evidence.");
  }
  return fields;
}

/**
 * Bind one repository worktree and configured base branch to the merge reducer.
 *
 * @param input - Repository, configured branch, Git executor, and optional bounded-fetch timeout.
 * @returns A production base-merge port pinned to the explicit remote-tracking ref.
 */
export function createBaseMergePort(input: {
  cwd: string;
  baseBranch: string;
  exec: GitExec;
  fetchTimeoutMs?: number;
}): BaseMergePort {
  const remoteBaseRef = `refs/remotes/origin/${input.baseBranch}`;
  return {
    refreshBase: async () => {
      await input.exec("git", ["check-ref-format", "--branch", input.baseBranch], {
        cwd: input.cwd,
        objectAccess: "local-only",
      });
      const fetched = await boundedGitInvocation(input.exec, [
        "fetch",
        "--no-tags",
        "origin",
        `+refs/heads/${input.baseBranch}:${remoteBaseRef}`,
      ], input.fetchTimeoutMs ?? DEFAULT_NETWORK_TIMEOUT_MS, { cwd: input.cwd });
      if (fetched.outcome !== "ok") {
        throw new Error(fetched.outcome === "timeout"
          ? "Fetching the configured base timed out."
          : "Fetching the configured base failed.", { cause: fetched.error });
      }
      return resolveOid(input.exec, input.cwd, `${remoteBaseRef}^{commit}`);
    },
    refreshHead: () => resolveOid(input.exec, input.cwd, "HEAD"),
    isAncestor: async (ancestorOid, descendantOid) => {
      try {
        await input.exec("git", ["merge-base", "--is-ancestor", ancestorOid, descendantOid], {
          cwd: input.cwd,
          objectAccess: "local-only",
        });
        return true;
      } catch (error) {
        if (isGitProcessError(error) && error.kind === "nonzero-exit" && error.exitCode === 1) return false;
        throw error;
      }
    },
    mergeAppendOnly: async (baseOid, headOid) => {
      const status = (await input.exec("git", ["status", "--porcelain=v1"], {
        cwd: input.cwd,
        objectAccess: "local-only",
      })).stdout;
      if (status !== "") throw new Error("The candidate worktree must be clean before merging its base.");
      const before = await resolveOid(input.exec, input.cwd, "HEAD");
      if (before !== headOid) return { status: "head-moved", actualHead: before };
      try {
        await input.exec("git", ["merge", "--no-ff", "--no-edit", baseOid], { cwd: input.cwd });
        const after = await resolveOid(input.exec, input.cwd, "HEAD");
        const parents = await resolveParents(input.exec, input.cwd, after);
        if (parents.length !== 2 || parents[0] !== headOid || parents[1] !== baseOid) {
          const failure = new Error("Git created a merge commit with unexpected parents.");
          const actualPredecessor = parents[0];
          if (actualPredecessor === undefined
            || await resolveOid(input.exec, input.cwd, "HEAD") !== after) throw failure;
          try {
            await input.exec("git", ["update-ref", "HEAD", actualPredecessor, after], { cwd: input.cwd });
            await input.exec("git", ["reset", "--hard", "HEAD"], { cwd: input.cwd });
            const [restored, clean, stillMerging] = await Promise.all([
              resolveOid(input.exec, input.cwd, "HEAD"),
              input.exec("git", ["status", "--porcelain=v1"], {
                cwd: input.cwd,
                objectAccess: "local-only",
              }).then(({ stdout }) => stdout === ""),
              mergeInProgress(input.exec, input.cwd),
            ]);
            if (restored !== actualPredecessor || !clean || stillMerging) {
              throw new Error("Git could not remove the unexpected merge commit.");
            }
          } catch (error) {
            throw new Error("Git could not remove the unexpected merge commit.", { cause: error });
          }
          throw failure;
        }
        return { status: "merged", headOid: after };
      } catch (error) {
        if (!await mergeInProgress(input.exec, input.cwd)) throw error;
        const contentConflict = await hasUnmergedEntries(input.exec, input.cwd);
        await input.exec("git", ["merge", "--abort"], { cwd: input.cwd });
        const [after, clean, stillMerging] = await Promise.all([
          resolveOid(input.exec, input.cwd, "HEAD"),
          input.exec("git", ["status", "--porcelain=v1"], {
            cwd: input.cwd,
            objectAccess: "local-only",
          }).then(({ stdout }) => stdout === ""),
          mergeInProgress(input.exec, input.cwd),
        ]);
        if (after !== before || !clean || stillMerging) {
          throw new Error("Git could not restore the pre-merge candidate state.", { cause: error });
        }
        if (!contentConflict) throw error;
        return { status: "conflict" };
      }
    },
  };
}
