/** Production Git composition for the exact-base merge procedure. */

import type { GitExec } from "../../lib/git/exec.js";
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

/** Bind one repository worktree and configured base branch to the merge reducer. */
export function createBaseMergePort(input: {
  cwd: string;
  baseBranch: string;
  exec: GitExec;
}): BaseMergePort {
  return {
    refreshBase: async () => {
      await input.exec("git", ["fetch", "origin", input.baseBranch], { cwd: input.cwd });
      return resolveOid(input.exec, input.cwd, `refs/remotes/origin/${input.baseBranch}`);
    },
    containsBase: async (baseOid) => {
      try {
        await input.exec("git", ["merge-base", "--is-ancestor", baseOid, "HEAD"], {
          cwd: input.cwd,
          objectAccess: "local-only",
        });
        return true;
      } catch (error) {
        if (isGitProcessError(error) && error.kind === "nonzero-exit" && error.exitCode === 1) return false;
        throw error;
      }
    },
    mergeAppendOnly: async (baseOid) => {
      const status = (await input.exec("git", ["status", "--porcelain=v1"], {
        cwd: input.cwd,
        objectAccess: "local-only",
      })).stdout;
      if (status !== "") throw new Error("The candidate worktree must be clean before merging its base.");
      const before = await resolveOid(input.exec, input.cwd, "HEAD");
      try {
        await input.exec("git", ["merge", "--no-edit", baseOid], { cwd: input.cwd });
        return "merged";
      } catch (error) {
        if (!await mergeInProgress(input.exec, input.cwd)) throw error;
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
        return "conflict";
      }
    },
  };
}
