/** Raw local tracking values owned by a preparatory branch rename's upstream clear. */
import type { GitExec } from "../git/exec.js";
import { GitProcessError } from "../git/process-error.js";

/** Raw ordered values, including multiple merge refs and an empty remote value. */
export type BranchTracking = ReadonlyMap<string, readonly string[]>;

/** Capture the local values that clearing an upstream removes.
 * @param exec - Repository-bound Git executor.
 * @param branch - Branch whose local configuration is inspected.
 * @returns Exact remote and merge values without display-name derivation.
 */
export async function readBranchTracking(exec: GitExec, branch: string): Promise<BranchTracking> {
  const values = new Map<string, string[]>();
  for (const field of ["remote", "merge"]) {
    try {
      const result = await exec("git", ["config", "--local", "--null", "--get-all", `branch.${branch}.${field}`], { preserveOutput: true });
      values.set(field, result.stdout === "" ? [] : result.stdout.split("\0").slice(0, -1));
    } catch (error) {
      if (!(error instanceof GitProcessError && error.kind === "nonzero-exit" && error.exitCode === 1)) throw error;
      values.set(field, []);
    }
  }
  return values;
}

/** Restore a cleared upstream only while its cleared values remain untouched.
 * @param exec - Repository-bound Git executor.
 * @param branch - Restored original branch name.
 * @param prior - Raw values captured immediately before this invocation cleared them.
 * @returns Nothing; concurrent replacement values remain authoritative.
 */
export async function restoreClearedBranchTracking(exec: GitExec, branch: string, prior: BranchTracking): Promise<void> {
  const current = await readBranchTracking(exec, branch);
  if ([...current.values()].some((values) => values.length > 0)) return;
  for (const [field, values] of prior) {
    for (const value of values) await exec("git", ["config", "--local", "--add", `branch.${branch}.${field}`, value]);
  }
}
