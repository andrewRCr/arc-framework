/**
 * The planning-ceremony finalize-fact write — the deterministic meta-field writes
 * a planning / verification ceremony emits at its finalize fire-point.
 *
 * The complement of the PPR-owned planning pointers (`Current Workflow` / `Design`
 * / the begin-sentinel `Next Action`, written by `set-stage` / `repoint-design`):
 * this verb persists the *finalize facts* each ceremony produces — the resolved
 * `Class`, the derived `Task List` filename, and the fixed terminal `Next Action` —
 * replacing the hand-fills that lived in the create-spec / generate-tasks /
 * verify-work-unit finalize steps. Not a lifecycle transition (no relocation, no
 * phase change) and not a pointer write; a field/record-seam write through the
 * executor's `writeClassField` (core-table) and `writeSoftFields` (bullet) seams.
 *
 * Each fire-point writes its own deterministic field set:
 *
 * - **create-spec** — persists the resolved `Class` only. `Current Workflow` and
 *   the begin-sentinel `Next Action` are PPR's, written by the adjacent
 *   `set-stage generate-tasks --advance`.
 * - **generate-tasks** (the planning terminus) — persists `Class`, the derived
 *   `Task List` (`tasks-<name>.md`), and the terminal `Next Action`. No stage
 *   advance (`activate` clears `Current Workflow`), so the `Next Action` is a fixed
 *   terminal string, not the begin-sentinel.
 * - **verify** — writes the integration-handoff terminal `Next Action` only.
 *
 * The terminal `Next Action` strings are code-owned pointer *values* (the protocol
 * strings the session-init probe resolves — `integrate-work-unit` sets
 * `sessionType: integration`), the same way the planning-stage basenames are
 * code-owned in the stage-pointer machinery; they are migrated from the workflow
 * markdown to here, not cited.
 *
 * The CLI verb spelling is provisional, pending idiomatic-alignment.
 *
 * @module
 */

import { validateClass, type WorkClass } from "../../../commands/active/types.js";
import { formatValue, type MetaFieldName } from "../../active/meta-reader.js";
import { isSlugSafe } from "../slug.js";
import type { ExecuteTransitionContext } from "../lifecycle-executor.js";

/** The planning / verification ceremony whose finalize facts are being written. */
export type FinalizeFirePoint = "create-spec" | "generate-tasks" | "verify";

/** The fire-points, in lifecycle order — the closed set the verb validates against. */
const FIRE_POINTS: readonly FinalizeFirePoint[] = ["create-spec", "generate-tasks", "verify"];

/** Fire-points that persist the resolved `Class` (the others take no Class). */
const CLASS_FIRE_POINTS: ReadonlySet<FinalizeFirePoint> = new Set(["create-spec", "generate-tasks"]);

/**
 * The fixed terminal `Next Action` strings, keyed by fire-point. create-spec is
 * absent — its `Next Action` is PPR's begin-sentinel (it advances into a next
 * stage), not a terminal string.
 */
const TERMINAL_NEXT_ACTION: Partial<Record<FinalizeFirePoint, string>> = {
  "generate-tasks": "Task list finalized — ready to activate",
  verify: "integrate-work-unit Step 1 — verify completion",
};

/** The executor capabilities the finalize-fact write needs. */
export interface FinalizeStageContext {
  /** Core-table `Class` write (read → rewrite cell → write). */
  writeClassField: NonNullable<ExecuteTransitionContext["writeClassField"]>;
  /** Bullet-field write for `Task List` / `Next Action` (read → rewrite → write). */
  writeSoftFields: ExecuteTransitionContext["writeSoftFields"];
}

/** The outcome of a {@link runFinalizeStage} run. */
export type FinalizeStageResult =
  | {
      status: "ok";
      metaPath: string;
      firePoint: FinalizeFirePoint;
      /** The resolved Class written, or `null` at a fire-point that takes none. */
      workClass: WorkClass | null;
      /** The derived Task List filename written, or `null` when not written. */
      taskList: string | null;
      /** The terminal Next Action written, or `null` when not written. */
      nextAction: string | null;
    }
  | { status: "rejected"; reason: string };

/**
 * Write the named WU's finalize facts for the given `firePoint`. Validates the
 * name (slug-safe) and the Class arg against the fire-point's contract — required
 * and resolved (`Light` / `Heavy` / `Novel`, not `[TBD]`) where the fire-point
 * persists it, refused where it doesn't — performing no write on any rejection.
 *
 * @param ctx - The executor seams carrying the Class and bullet-field writes.
 * @param params - `name` (the WU slug, resolving `.arc/active/meta-<name>.md`), the `firePoint`, and the
 *   resolved `workClass` (required at create-spec / generate-tasks).
 * @returns `ok` with the written meta path and the facts written, or `rejected` with a reason.
 */
export async function runFinalizeStage(
  ctx: FinalizeStageContext,
  params: { name: string; firePoint: FinalizeFirePoint; workClass?: string },
): Promise<FinalizeStageResult> {
  const name = params.name.trim();
  if (name === "") {
    return { status: "rejected", reason: "A work-unit name is required to finalize the planning stage." };
  }
  // `name` flows straight into the meta path below, so reject anything but a slug
  // before it can escape `.arc/active/` via separators or dot-segments.
  if (!isSlugSafe(name)) {
    return {
      status: "rejected",
      reason: "`finalize` requires a slug-safe name (`[a-z0-9-]`, no path separators or dot segments).",
    };
  }

  const { firePoint } = params;
  if (!FIRE_POINTS.includes(firePoint)) {
    return {
      status: "rejected",
      reason: `\`${firePoint}\` is not a finalize fire-point (expected one of ${FIRE_POINTS.join(", ")}).`,
    };
  }

  // Class-arg contract: required-and-resolved where the fire-point persists it,
  // refused where it doesn't.
  const takesClass = CLASS_FIRE_POINTS.has(firePoint);
  let resolvedClass: WorkClass | null = null;
  if (takesClass) {
    if (params.workClass === undefined || params.workClass.trim() === "") {
      return {
        status: "rejected",
        reason: `The \`${firePoint}\` finalize requires the resolved Class (\`Light\` | \`Heavy\` | \`Novel\`).`,
      };
    }
    const validated = validateClass(params.workClass);
    if (validated === "[TBD]") {
      return {
        status: "rejected",
        reason: `\`${params.workClass}\` is not a resolved Class (expected \`Light\` | \`Heavy\` | \`Novel\`).`,
      };
    }
    resolvedClass = validated;
  } else if (params.workClass !== undefined) {
    return { status: "rejected", reason: `The \`${firePoint}\` finalize takes no Class.` };
  }

  const metaPath = `.arc/active/meta-${name}.md`;

  if (resolvedClass !== null) {
    await ctx.writeClassField(metaPath, resolvedClass);
  }

  // Compose the bullet-field writes (Task List + terminal Next Action) into one
  // rewrite. Each value renders through the canonical field formatter per its value
  // class — `Task List` backticked as an identifier, the narrative `Next Action`
  // verbatim — matching the fresh-render shape.
  const updates: Partial<Record<MetaFieldName, string>> = {};
  let taskList: string | null = null;
  if (firePoint === "generate-tasks") {
    taskList = `tasks-${name}.md`;
    updates["Task List"] = formatValue(taskList, "identifier");
  }
  const nextAction = TERMINAL_NEXT_ACTION[firePoint] ?? null;
  if (nextAction !== null) {
    updates["Next Action"] = formatValue(nextAction, "narrative");
  }
  if (Object.keys(updates).length > 0) {
    await ctx.writeSoftFields(metaPath, updates);
  }

  return { status: "ok", metaPath, firePoint, workClass: resolvedClass, taskList, nextAction };
}
