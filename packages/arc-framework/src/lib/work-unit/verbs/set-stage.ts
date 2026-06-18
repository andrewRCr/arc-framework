/**
 * The planning-stage-pointer write — the lightweight write half of the
 * planning-stage-pointer mechanics.
 *
 * Writes the active WU's `Current Workflow` field so the meta carries one
 * deterministic value naming the live sub-stage, retiring session-init's
 * free-form prose-parse. Not a lifecycle transition — no relocation, no phase
 * change — just the `Current Workflow` write through the executor's
 * `writeCurrentWorkflowField` seam (the same write the activate-exit clear reuses).
 *
 * Two invocation shapes:
 *
 * - **Finalization-advance** (`advance: true`) — a planning workflow, at its
 *   finalization, advances the pointer to the *next* stage and resets `Next Action`
 *   to the `[begin current workflow]` boundary sentinel (one deterministic op, so the
 *   sentinel never has to be hand-written). This is what makes a fresh session after
 *   handoff resolve the next stage, not the just-finished one.
 * - **Entry correction** (`advance: false`, the default) — `create-spec`'s entry,
 *   when `draft-design` was skipped (no draft), corrects the stale `draft-design`
 *   pointer. `Next Action` is left untouched: the relative sentinel re-resolves
 *   against the new `Current Workflow` on its own.
 *
 * The CLI verb spelling is provisional, pending idiomatic-alignment.
 *
 * @module
 */

import {
  isPlanningWorkflow,
  PLANNING_WORKFLOWS,
  BEGIN_CURRENT_WORKFLOW_SENTINEL,
} from "../../active/current-workflow-consistency.js";
import { isSlugSafe } from "../slug.js";
import type { ExecuteTransitionContext } from "../lifecycle-executor.js";

/**
 * The executor capabilities the stage-pointer write needs: the `Current Workflow`
 * write always, and the bullet-field write for the `Next Action` sentinel reset on
 * an `advance`.
 */
export type SetStageContext = Pick<
  ExecuteTransitionContext,
  "writeCurrentWorkflowField" | "writeSoftFields"
>;

/** The outcome of a {@link runSetStage} run. */
export type SetStageResult =
  | { status: "ok"; metaPath: string; stage: string; advanced: boolean }
  | { status: "rejected"; reason: string };

/**
 * Write the named WU's `Current Workflow` to `stage`, optionally advancing at a
 * stage boundary. Refuses a `stage` outside the planning enum
 * (`draft-design` / `create-spec` / `generate-tasks`) — the clear to `[none]` is
 * the `activate` edge's encoding leg, not this command's, so a refused stage
 * performs no write.
 *
 * On `advance`, additionally resets `Next Action` to the `[begin current workflow]`
 * boundary sentinel (the finalization-advance shape); otherwise `Next Action` is
 * left untouched (the entry-correction shape — the relative sentinel re-resolves).
 *
 * @param ctx - The executor seams carrying the stage-pointer and bullet-field writes.
 * @param params - `name` (the WU slug, resolving `.arc/active/meta-<name>.md`), the target `stage`, and `advance`.
 * @returns `ok` with the written meta path, stage, and whether it advanced, or `rejected` with a reason.
 */
export async function runSetStage(
  ctx: SetStageContext,
  params: { name: string; stage: string; advance?: boolean },
): Promise<SetStageResult> {
  const name = params.name.trim();
  if (name === "") {
    return { status: "rejected", reason: "A work-unit name is required to set the planning stage." };
  }
  // `name` flows straight into the meta path below, so reject anything but a slug
  // before it can escape `.arc/active/` via separators or dot-segments.
  if (!isSlugSafe(name)) {
    return {
      status: "rejected",
      reason: "`set-stage` requires a slug-safe name (`[a-z0-9-]`, no path separators or dot segments).",
    };
  }
  const { stage, advance = false } = params;
  if (!isPlanningWorkflow(stage)) {
    return {
      status: "rejected",
      reason: `\`${stage}\` is not a planning stage (expected one of ${PLANNING_WORKFLOWS.join(", ")}).`,
    };
  }
  const metaPath = `.arc/active/meta-${name}.md`;
  await ctx.writeCurrentWorkflowField(metaPath, stage);
  if (advance) {
    await ctx.writeSoftFields(metaPath, { "Next Action": BEGIN_CURRENT_WORKFLOW_SENTINEL });
  }
  return { status: "ok", metaPath, stage, advanced: advance };
}
