/**
 * The planning-stage-pointer write — the lightweight write half of the
 * planning-stage-pointer mechanics.
 *
 * The planning workflows (`draft-design` / `create-spec` / `generate-tasks`)
 * invoke this at their entry step so the active WU's meta carries one
 * deterministic `Current Workflow` field naming the live sub-stage, retiring
 * session-init's free-form prose-parse. Not a lifecycle transition — no
 * relocation, no phase change — just the single `Current Workflow` write fired
 * through the executor's `writeCurrentWorkflowField` seam (the same write the
 * activate-exit clear reuses).
 *
 * The CLI verb spelling is provisional, pending idiomatic-alignment; the
 * invocation point (each planning workflow's entry step) is pinned.
 *
 * @module
 */

import { isPlanningWorkflow, PLANNING_WORKFLOWS } from "../../active/current-workflow-consistency.js";
import type { ExecuteTransitionContext } from "../lifecycle-executor.js";

/** The executor capability the stage-pointer write needs — nothing more. */
export type SetStageContext = Pick<ExecuteTransitionContext, "writeCurrentWorkflowField">;

/** The outcome of a {@link runSetStage} run. */
export type SetStageResult =
  | { status: "ok"; metaPath: string; stage: string }
  | { status: "rejected"; reason: string };

/**
 * Write the named WU's `Current Workflow` to `stage`. Refuses a `stage` outside
 * the planning enum (`draft-design` / `create-spec` / `generate-tasks`) — the
 * clear to `[none]` is the `activate` edge's encoding leg, not this command's, so
 * a refused stage performs no write.
 *
 * @param ctx - The executor seam carrying the stage-pointer write.
 * @param params - `name` (the WU slug, resolving `.arc/active/meta-<name>.md`) and the target `stage`.
 * @returns `ok` with the written meta path and stage, or `rejected` with a reason.
 */
export async function runSetStage(
  ctx: SetStageContext,
  params: { name: string; stage: string },
): Promise<SetStageResult> {
  const { name, stage } = params;
  if (!isPlanningWorkflow(stage)) {
    return {
      status: "rejected",
      reason: `\`${stage}\` is not a planning stage (expected one of ${PLANNING_WORKFLOWS.join(", ")}).`,
    };
  }
  const metaPath = `.arc/active/meta-${name}.md`;
  await ctx.writeCurrentWorkflowField(metaPath, stage);
  return { status: "ok", metaPath, stage };
}
