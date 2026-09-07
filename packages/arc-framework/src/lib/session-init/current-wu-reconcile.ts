/**
 * Read-only current-work-unit reconcile projection for session entry.
 *
 * The probe owns no write or staging seam. It projects the shared exact planner
 * into a compact envelope fact plus CLI-authored guidance for the session
 * workflow to render verbatim.
 *
 * @module
 */

import {
  prepareCurrentWuReconcile,
  type CurrentWuReconcileOp,
  type CurrentWuReconcilePlan,
  type CurrentWuReconcilePrepareContext,
  type DependencyReconcileConflictReason,
} from "../work-unit/side-effects/discharge-dep-edges.js";
/** Current-WU reconcile probe input. */
export type CurrentWuReconcileSessionOp = Omit<CurrentWuReconcileOp, "apply">;

/** Session-entry projection of one current-WU reconcile inspection. */
export interface CurrentWuReconcileSessionResult {
  status: "clean" | "pending" | "conflict";
  slug: string;
  dependency: CurrentWuReconcilePlan["dependency"];
  trackedReferences: CurrentWuReconcilePlan["trackedReferences"];
  advisories: CurrentWuReconcilePlan["advisories"];
  reason?: DependencyReconcileConflictReason;
  recommendedAction: "skip" | "surface";
  recommendedCommand: readonly string[] | null;
  recommendedPromptText: string;
}

/**
 * Inspect the active work unit without exposing any mutation capability.
 *
 * @param ctx - Lifecycle, receipt-query, and read-only filesystem boundaries
 * @param op - Current work-unit identity and owned meta path
 * @returns Closed reconcile facts and precomposed session-entry guidance
 */
export async function runCurrentWuReconcileSessionProbe(
  ctx: CurrentWuReconcilePrepareContext,
  op: CurrentWuReconcileSessionOp,
): Promise<CurrentWuReconcileSessionResult> {
  const result = await prepareCurrentWuReconcile(ctx, op);
  if (result.status === "clean") {
    return {
      status: "clean",
      slug: op.slug,
      dependency: result.prepared.plan.dependency,
      trackedReferences: result.prepared.plan.trackedReferences,
      advisories: result.prepared.plan.advisories,
      recommendedAction: "skip",
      recommendedCommand: null,
      recommendedPromptText: "",
    };
  }
  if (result.status === "pending") {
    const hasTrackedEdits = result.prepared.edits.length > 0;
    return {
      status: "pending",
      slug: op.slug,
      dependency: result.prepared.plan.dependency,
      trackedReferences: result.prepared.plan.trackedReferences,
      advisories: result.prepared.plan.advisories,
      recommendedAction: "surface",
      recommendedCommand: hasTrackedEdits
        ? ["arc", "wu", "reconcile", op.slug, "--apply", "--json"]
        : ["arc", "wu", "reconcile", op.slug, "--json"],
      recommendedPromptText: hasTrackedEdits
        ? `Current work unit \`${op.slug}\` has pending tracked reconcile edits. `
          + `Apply them in its own review increment with `
          + `\`arc wu reconcile ${op.slug} --apply --json\`.`
        : `Current work unit \`${op.slug}\` has advisory reference findings. `
          + `Inspect them with \`arc wu reconcile ${op.slug} --json\`.`,
    };
  }
  return {
    status: "conflict",
    slug: op.slug,
    dependency: result.prepared.plan.dependency,
    trackedReferences: result.prepared.plan.trackedReferences,
    advisories: result.prepared.plan.advisories,
    reason: result.reason,
    recommendedAction: "surface",
    recommendedCommand: ["arc", "wu", "reconcile", op.slug, "--json"],
    recommendedPromptText:
      `Current work unit \`${op.slug}\` reconcile is blocked (${result.reason}). `
      + `Inspect with \`arc wu reconcile ${op.slug} --json\` before applying tracked repairs.`,
  };
}
