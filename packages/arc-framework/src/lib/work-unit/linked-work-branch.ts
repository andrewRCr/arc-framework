/** Select a work unit's repository-qualified work branch for change-request effects. */
import { selectWorkBranchLink, workBranchName } from "../store/lifecycle-branch.js";
import type { ExecuteTransitionContext } from "./lifecycle-executor.js";
import type { StoreRecord } from "../store/read.js";
/** Select the final work link appended by activation or promotion, independent of the invoking checkout. */
export async function linkedWorkBranch(ctx: Pick<ExecuteTransitionContext, "exec" | "cwd" | "projectId">, record: StoreRecord): Promise<string | null> {
  const selection = selectWorkBranchLink(record, { repository: await ctx.projectId?.() });
  return selection.kind === "linked" ? workBranchName(selection.link.ref) : null;
}
