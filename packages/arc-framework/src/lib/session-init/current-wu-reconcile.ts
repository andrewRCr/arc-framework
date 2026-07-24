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

/** Session-entry projection of one current-WU reconcile inspection. */
export interface CurrentWuReconcileSessionResult {
  status: "clean" | "pending" | "conflict";
  slug: string;
  dependency: CurrentWuReconcilePlan["dependency"];
  trackedReferences: CurrentWuReconcilePlan["trackedReferences"];
  advisories: readonly string[];
  reason?: DependencyReconcileConflictReason;
  recommendedAction: "skip" | "surface";
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
  op: Omit<CurrentWuReconcileOp, "apply">,
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
      recommendedPromptText: "",
    };
  }
  if (result.status === "pending") {
    return {
      status: "pending",
      slug: op.slug,
      dependency: result.prepared.plan.dependency,
      trackedReferences: result.prepared.plan.trackedReferences,
      advisories: result.prepared.plan.advisories,
      recommendedAction: "surface",
      recommendedPromptText:
        `Current work unit \`${op.slug}\` has pending tracked reconcile edits. `
        + `Apply them in its own review increment with `
        + `\`arc wu reconcile ${op.slug} --apply --json\`.`,
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
    recommendedPromptText:
      `Current work unit \`${op.slug}\` reconcile is blocked (${result.reason}). `
      + `Inspect with \`arc wu reconcile ${op.slug} --json\` before applying tracked repairs.`,
  };
}
