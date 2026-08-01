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
import type { LocusStateV1 } from "../locus/schema/index.js";
import { canonicalLocalPath } from "../local-path-identity.js";

/** Reader-owned role state for the exact checkout entering a work-unit session. */
export type CurrentWuLocusRoleState = "managed" | "missing" | "unknown";

/** Current-WU reconcile probe input, including the read-only locus classification when available. */
export interface CurrentWuReconcileSessionOp extends Omit<CurrentWuReconcileOp, "apply"> {
  locusRoleState?: CurrentWuLocusRoleState;
}

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
  const roleMissing = op.locusRoleState === "missing";
  if (result.status === "clean") {
    if (roleMissing) return missingRoleResult(op, result.prepared.plan);
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
      recommendedCommand: hasTrackedEdits || roleMissing
        ? ["arc", "wu", "reconcile", op.slug, "--apply", "--json"]
        : ["arc", "wu", "reconcile", op.slug, "--json"],
      recommendedPromptText: roleMissing
        ? `Current work unit \`${op.slug}\` has no durable work-unit session role for this checkout. `
          + `Establish it${hasTrackedEdits ? " and apply its pending tracked reconcile edits" : ""} with `
          + `\`arc wu reconcile ${op.slug} --apply --json\`.`
        : hasTrackedEdits
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

/** Classify only the exact current checkout; sibling rows cannot authorize or suppress its repair. */
export async function classifyCurrentWuLocusRole(
  state: LocusStateV1,
  checkoutPath: string,
  slug: string,
): Promise<CurrentWuLocusRoleState> {
  const canonicalCheckoutPath = await canonicalLocalPath(checkoutPath);
  const candidates = await Promise.all(state.roster.rows.map(async (row) => ({
    row,
    canonicalPath: row.checkoutPath === null ? null : await canonicalLocalPath(row.checkoutPath),
  })));
  const matches = candidates
    .filter((candidate) => candidate.canonicalPath === canonicalCheckoutPath)
    .map((candidate) => candidate.row);
  if (matches.length !== 1) return "unknown";
  const row = matches[0];
  if (row?.kind === "free-primary" || row?.kind === "unmanaged-checkout") return "missing";
  return row?.kind === "managed-role"
    && row.role?.kind === "work-unit"
    && row.role.subject.kind === "work-unit"
    && row.role.subject.key === slug
    ? "managed"
    : "unknown";
}

function missingRoleResult(
  op: CurrentWuReconcileSessionOp,
  plan: CurrentWuReconcilePlan,
): CurrentWuReconcileSessionResult {
  return {
    status: "pending",
    slug: op.slug,
    dependency: plan.dependency,
    trackedReferences: plan.trackedReferences,
    advisories: plan.advisories,
    recommendedAction: "surface",
    recommendedCommand: ["arc", "wu", "reconcile", op.slug, "--apply", "--json"],
    recommendedPromptText:
      `Current work unit \`${op.slug}\` has no durable work-unit session role for this checkout. `
      + `Establish it with \`arc wu reconcile ${op.slug} --apply --json\`.`,
  };
}
