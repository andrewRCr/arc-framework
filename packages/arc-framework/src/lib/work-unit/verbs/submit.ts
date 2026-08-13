/**
 * The `submit` verb — schedule publication for an `Active` WU (`Active → Integrating`).
 *
 * `submit` is the forward half of the `submit` ⊥ `reopen` phase-axis pair: it
 * marks the start of publication, not the merge — the integration-interlock owns
 * merge approval. A `set-phase`-only move — `Active → Integrating`, no
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

/** The orientation inputs a `submit` supplies. */
export interface SubmitParams {
  /** Target WU name (the CLI defaults this to the current Active WU). */
  name: string;
  /** The work being submitted for review — the `Last Completed` `input` the edge requires. */
  lastCompleted: string;
  /** The integration pointer (e.g. "open the PR") — the `Next Action` `input` the edge requires. */
  nextAction: string;
  /** Explicit authority to retain advisory-only reconcile findings while entering review. */
  allowAdvisories?: boolean;
}

/** The outcome of a `submit` attempt, including reconcile stops before phase mutation. */
export type SubmitResult =
  | { status: "rejected"; reason: string }
  | {
      status: "submitted";
      outcome: TransitionOutcome;
      metaPath: string;
      reconcile: Extract<CurrentWuReconcileResult, { status: "clean" | "pending" | "applied" }>;
    }
  | {
      status: "reconcile-pending";
      reason: string;
      metaPath: string;
      reconcile: Extract<CurrentWuReconcileResult, { status: "pending" | "applied" }>;
    }
  | {
      status: "reconcile-failed";
      reason: string;
      metaPath: string;
      reconcile: Extract<CurrentWuReconcileResult, { status: "conflict" }>;
    };

/**
 * Run `submit`: flip the WU's phase `Active → Integrating` and set the
 * integration orientation soft fields. Rejects when the source is not an `Active`
 * WU (the table's illegal-edge lookup).
 *
 * @param ctx - The executor seams (the render + `user-workspace` handlers are registered by the caller).
 * @param params - The target WU and the integration orientation inputs.
 * @returns A pre-transition reconcile stop, a rejection, or the integrating meta path.
 */
export async function runSubmit(
  ctx: ExecuteTransitionContext & CurrentWuReconcileHost,
  params: SubmitParams,
): Promise<SubmitResult> {
  const { name, lastCompleted, nextAction, allowAdvisories } = params;
  const slug = SlugSchema.safeParse(name);
  if (!slug.success) {
    return { status: "rejected", reason: `\`${name}\` is not an active WU — nothing to submit.` };
  }
  const metaPath = resolveArcPath({
    kind: "work-unit-artifact",
    placement: { kind: "active", scope: { kind: "project" } },
    slug: slug.data,
    artifact: "meta",
  });
  try {
    if (parseMetaRecord(await ctx.indexFs.readFile(join(ctx.cwd, metaPath))).state !== "Active") {
      return { status: "rejected", reason: `\`${name}\` is not an active WU — nothing to submit.` };
    }
  } catch {
    return { status: "rejected", reason: `\`${name}\` is not an active WU — nothing to submit.` };
  }
  const reconcile = await ctx.currentWuReconcile.prepare({ slug: name, metaPath });
  if (reconcile.status === "conflict") {
    return {
      status: "rejected",
      reason: `Cannot submit \`${name}\`: current-WU reconcile refused (${reconcile.reason}).`,
    };
  }
  const applied = await ctx.currentWuReconcile.apply(reconcile.prepared);
  if (applied.status === "conflict") {
    return {
      status: "reconcile-failed",
      reason:
        `Submission preflight for \`${name}\` became stale before mutation (${applied.reason}). `
        + `Rerun \`arc submit\` after reconciling the current branch.`,
      metaPath,
      reconcile: applied,
    };
  }
  const advisories = applied.prepared.plan.advisories;
  if (applied.status !== "clean" && advisories.length > 0 && allowAdvisories !== true) {
    return {
      status: "reconcile-pending",
      reason:
        `Cannot submit \`${name}\`: current-WU reconcile has `
        + `${advisories.length} advisory reference(s) requiring review.`,
      metaPath,
      reconcile: applied,
    };
  }

  const outcome = await executeTransition(ctx, {
    verb: "submit",
    slug: name,
    inputs: { softFields: { lastCompleted, nextAction } },
  });

  if (outcome.status !== "ok") return { status: "rejected", reason: outcome.message };
  return {
    status: "submitted",
    outcome,
    metaPath,
    reconcile: applied,
  };
}
