/**
 * The `integrate` verb — open review on an `Active` WU (`Active → Integrating`).
 *
 * `integrate` is the forward half of the `integrate` ⊥ `reopen` phase-axis pair: it
 * marks a WU's **entry into review**, not the merge — the integration-interlock owns
 * merge approval, and the description disambiguates that effect exactly as `reopen`
 * does for its withdrawal. A `set-phase`-only move — `Active → Integrating`, no
 * location move and no branch rotation (the working branch already carries its
 * `<type>/` prefix from `activate`) — that fires the render + `user-workspace`
 * side-effects and sets the integration orientation from caller inputs.
 *
 * The verb stays thin: it forwards the two judgment soft-field `input` values the
 * edge requires — `Last Completed` (the work being submitted) and `Next Action`
 * (the integration pointer, e.g. "open the PR") — and dispatches through
 * {@link executeTransition}; the `set-phase` leg, the side-effects, and the
 * soft-field disposition (resetting the now-closed `Next Task`) are the table's. The
 * orientation values are never fabricated here — a missing input is the executor's
 * rejection. A non-`Active` source falls to the table's illegal-edge lookup.
 *
 * @module
 */

import { join } from "node:path";

import { parseMetaRecord } from "../../active/meta-reader.js";
import {
  executeTransition,
  type ExecuteTransitionContext,
  type TransitionOutcome,
} from "../lifecycle-executor.js";
import type {
  CurrentWuReconcileHost,
  CurrentWuReconcileResult,
} from "../side-effects/discharge-dep-edges.js";
import { SlugSchema } from "../../kernel/index.js";
import { resolveArcPath } from "../../layout/index.js";

/** The orientation inputs an `integrate` supplies. */
export interface IntegrateParams {
  /** Target WU name (the CLI defaults this to the current Active WU). */
  name: string;
  /** The work being submitted for review — the `Last Completed` `input` the edge requires. */
  lastCompleted: string;
  /** The integration pointer (e.g. "open the PR") — the `Next Action` `input` the edge requires. */
  nextAction: string;
}

/** The outcome of an `integrate` attempt — a rejection, or the integrating meta path. */
export type IntegrateResult =
  | { status: "rejected"; reason: string }
  | { status: "integrated"; outcome: TransitionOutcome; metaPath: string; reconcile: CurrentWuReconcileResult }
  | {
      status: "reconcile-failed";
      reason: string;
      metaPath: string;
      reconcile: Extract<CurrentWuReconcileResult, { status: "conflict" }>;
    };

/**
 * Run `integrate`: flip the WU's phase `Active → Integrating` and set the
 * integration orientation soft fields. Rejects when the source is not an `Active`
 * WU (the table's illegal-edge lookup).
 *
 * @param ctx - The executor seams (the render + `user-workspace` handlers are registered by the caller).
 * @param params - The target WU and the integration orientation inputs.
 * @returns A rejection (illegal source, or executor failure) or the integrating meta path.
 */
export async function runIntegrate(
  ctx: ExecuteTransitionContext & CurrentWuReconcileHost,
  params: IntegrateParams,
): Promise<IntegrateResult> {
  const { name, lastCompleted, nextAction } = params;
  const slug = SlugSchema.safeParse(name);
  if (!slug.success) {
    return { status: "rejected", reason: `\`${name}\` is not an active WU — nothing to integrate.` };
  }
  const metaPath = resolveArcPath({
    kind: "work-unit-artifact",
    placement: { kind: "active", scope: { kind: "project" } },
    slug: slug.data,
    artifact: "meta",
  });
  try {
    if (parseMetaRecord(await ctx.indexFs.readFile(join(ctx.cwd, metaPath))).State !== "Active") {
      return { status: "rejected", reason: `\`${name}\` is not an active WU — nothing to integrate.` };
    }
  } catch {
    return { status: "rejected", reason: `\`${name}\` is not an active WU — nothing to integrate.` };
  }
  const reconcile = await ctx.currentWuReconcile.prepare({ slug: name, metaPath });
  if (reconcile.status === "conflict") {
    return {
      status: "rejected",
      reason: `Cannot integrate \`${name}\`: current-WU reconcile refused (${reconcile.reason}).`,
    };
  }
  const applied = await ctx.currentWuReconcile.apply(reconcile.prepared);
  if (applied.status === "conflict") {
    return {
      status: "reconcile-failed",
      reason:
        `Integration preflight for \`${name}\` became stale before mutation (${applied.reason}). `
        + `Rerun \`arc integrate\` after reconciling the current branch.`,
      metaPath,
      reconcile: applied,
    };
  }

  const outcome = await executeTransition(ctx, {
    verb: "integrate",
    slug: name,
    inputs: { softFields: { lastCompleted, nextAction } },
  });

  if (outcome.status !== "ok") return { status: "rejected", reason: outcome.message };
  return {
    status: "integrated",
    outcome,
    metaPath,
    reconcile: applied,
  };
}
