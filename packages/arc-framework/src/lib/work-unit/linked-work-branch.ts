/** Select a work unit's repository-qualified work branch for change-request effects. */
import { selectWorkBranchLink, workBranchName } from "../store/lifecycle-branch.js";
import type { ExecuteTransitionContext } from "./lifecycle-executor.js";
import type { StoreRecord } from "../store/read.js";
/** Prefer a linked checkout branch, then the final link appended by activation or promotion. */
export async function linkedWorkBranch(ctx: Pick<ExecuteTransitionContext, "exec" | "cwd" | "projectId">, record: StoreRecord): Promise<string | null> {
  const repository = await ctx.projectId?.();
  const branches = (record.links?.branches ?? []).filter((link) => repository === undefined || link.repository === repository);
  if (ctx.exec !== undefined) {
    const current = await ctx.exec("git", ["symbolic-ref", "--quiet", "--short", "HEAD"], { cwd: ctx.cwd })
      .then((result) => result.stdout.trim(), (error: unknown) => {
        if (error instanceof Error && "exitCode" in error && error.exitCode === 1) return null;
        throw error;
      });
    if (current !== null && branches.some((link) => workBranchName(link.ref) === workBranchName(current))) {
      const selection = selectWorkBranchLink(record, { repository, currentBranch: current });
      return selection.kind === "linked" ? workBranchName(selection.link.ref) : null;
    }
  }
  const selection = selectWorkBranchLink(record, { repository });
  return selection.kind === "linked" ? workBranchName(selection.link.ref) : null;
}
