/**
 * Read-only current-work-unit reconcile projection for session entry.
 *
 * The probe owns no write or staging seam. It projects the shared exact planner
 * into a compact envelope fact plus CLI-authored guidance for the session
 * workflow to render verbatim.
 *
 * @module
 */

import { z } from "zod";
import { ArcError } from "../kernel/errors.js";
import type { Store } from "../store/contract.js";
import { ListingDiagnosticSchema } from "../store/read.js";
import { workUnitMetaPath } from "../store/lifecycle-write.js";
import { createStoreReconcilePrepareContext } from "../work-unit/store-reconcile-context.js";
import { CurrentWuReconcileSessionResultSchema } from "./current-wu-reconcile-schema.js";
import {
  prepareCurrentWuReconcile,
  type CurrentWuReconcileOp,
  type CurrentWuReconcilePrepareContext,
  type HeldDependencyEdge,
} from "../work-unit/side-effects/discharge-dep-edges.js";
/** Current-WU reconcile probe input. */
export type CurrentWuReconcileSessionOp = Omit<CurrentWuReconcileOp, "apply"> & { checkoutPath: string };

/** Session-entry projection of one current-WU reconcile inspection. */
export type CurrentWuReconcileSessionResult = z.infer<typeof CurrentWuReconcileSessionResultSchema>;

/**
 * Inspect the active work unit without exposing any mutation capability.
 *
 * @param ctx - Lifecycle, receipt-query, and read-only filesystem boundaries
 * @param op - Current work-unit identity and owned meta path
 * @returns Closed reconcile facts and precomposed session-entry guidance
 */
export async function runCurrentWuReconcileSessionProbe(
  ctx: CurrentWuReconcilePrepareContext | { store: Store },
  op: CurrentWuReconcileSessionOp,
): Promise<CurrentWuReconcileSessionResult> {
  if (!("store" in ctx)) return projectCurrentWuResult(await prepareCurrentWuReconcile(ctx, op), op);
  let acquired;
  try { acquired = await createStoreReconcilePrepareContext(ctx.store, op.slug); }
  catch (error) {
    if (!(error instanceof ArcError) || (error.code !== "store.lifecycle-incomplete" && error.code !== "store.lifecycle-unreadable")) throw error;
    const diagnostics = z.array(ListingDiagnosticSchema).safeParse(error.cause);
    if (diagnostics.success && diagnostics.data.length > 0) return unavailable(op.slug,
      diagnostics.data.map(item => item.condition).join("\n"),
      diagnostics.data.map(item => ({ text: `${item.key}: ${item.condition} ${item.remedy.text}` })));
    return unavailable(op.slug, error.message, [{ text: error.message }]);
  }
  if (acquired.status === "refused") return unavailable(op.slug, acquired.refusal.condition, [{ text: acquired.refusal.remedy.text }]);
  const primary = acquired.result.primary;
  const selected = { ...op, slug: primary.reference.owner.name, metaPath: workUnitMetaPath(primary) };
  return projectCurrentWuResult(await prepareCurrentWuReconcile(acquired.result.context, selected), selected);
}

function projectCurrentWuResult(result: Awaited<ReturnType<typeof prepareCurrentWuReconcile>>,
  op: CurrentWuReconcileSessionOp): CurrentWuReconcileSessionResult {
  const inspect = {
    text: `arc wu reconcile ${op.slug} --json`,
    argv: ["arc", "wu", "reconcile", op.slug, "--json"],
  };
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
      actions: [inspect, ...(hasTrackedEdits ? [{
        text: `arc wu reconcile ${op.slug} --apply --json`,
        argv: ["arc", "wu", "reconcile", op.slug, "--apply", "--json"], checkout: op.checkoutPath,
      }] : [])],
      slug: op.slug,
      dependency: result.prepared.plan.dependency,
      trackedReferences: result.prepared.plan.trackedReferences,
      advisories: result.prepared.plan.advisories,
      recommendedAction: "surface",
      recommendedCommand: hasTrackedEdits
        ? ["arc", "wu", "reconcile", op.slug, "--apply", "--json"]
        : ["arc", "wu", "reconcile", op.slug, "--json"],
      recommendedPromptText: pendingPromptText(op.slug, hasTrackedEdits, result.prepared.plan.dependency.held),
    };
  }
  return {
    status: "conflict",
    actions: [inspect],
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

function pendingPromptText(slug: string, hasTrackedEdits: boolean, held: readonly HeldDependencyEdge[] = []): string {
  const heldNames = [...new Set(held.map(item => item.edge))].map(edge => `\`${edge}\``).join(", ");
  if (hasTrackedEdits) return `Current work unit \`${slug}\` has pending tracked reconcile edits. `
    + `Apply them in its own review increment with \`arc wu reconcile ${slug} --apply --json\`.`
    + (heldNames === "" ? "" : ` It also has held dependency edges: ${heldNames}.`);
  const findings = heldNames === "" ? "advisory reference findings" : `held dependency edges: ${heldNames}`;
  return `Current work unit \`${slug}\` has ${findings}. Inspect them with \`arc wu reconcile ${slug} --json\`.`;
}

function unavailable(slug: string, condition: string, actions: { text: string }[]): CurrentWuReconcileSessionResult {
  return { status: "unavailable", slug, condition, actions, recommendedAction: "surface", recommendedCommand: null, recommendedPromptText: condition };
}
