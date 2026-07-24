/**
 * The `activate` / `deactivate` phase-axis inverse pair.
 *
 * Both rotate a work unit between `Planning` and `Active` **in place** (no location
 * move — the WU stays in `active/`), rotating the working branch and the meta phase
 * together:
 *
 * - **`activate`** (`Planning → Active`) raises a graduated planning WU to in-flight:
 *   the `plan/<name>` branch rotates to the working branch (caller-supplied — the
 *   `<type>/<name>` choice is judgment, never fabricated), the phase writes `Active`,
 *   and the `Next Task` / `Next Action` orientation is set from caller inputs. It
 *   preflights the current-WU reconcile before transition mutation, then applies
 *   that exact plan in the ceremony's staged write batch.
 * - **`deactivate`** (`Active → Planning`) undoes a *premature* activation: the
 *   working branch rotates back to `plan/<name>`, the phase drops to `Planning`, and
 *   the just-set `Next Task` / `Next Action` clear. Narrow by design — shelving in-progress work is
 *   `park@Active`, destructive teardown is `abandon`, and there is no merged corner
 *   (post-merge rework is a new origin-linked WU; ADR-026 amendment).
 *
 * Each verb stays thin: it reads the current working branch from the meta, composes
 * the branch-rotation operand (and, for `activate`, the soft-field inputs), and
 * dispatches through {@link executeTransition}; the branch rename, the phase write,
 * the soft-field disposition, and the dependent-owned reconcile stay one ceremony.
 * A source in the wrong phase falls to the table's illegal-edge rejection (each edge
 * has exactly one legal source).
 *
 * @module
 */

import { join } from "node:path";

import { parseMetaRecord, type MetaFieldName } from "../../active/meta-reader.js";
import { SlugSchema } from "../../kernel/index.js";
import { resolveArcPath } from "../../layout/index.js";
import {
  executeTransition,
  type ExecuteTransitionContext,
  type TransitionOutcome,
} from "../lifecycle-executor.js";
import type {
  CurrentWuReconcileHost,
  CurrentWuReconcileResult,
} from "../side-effects/discharge-dep-edges.js";

/** The judgment + orientation inputs an `activate` supplies. */
export interface ActivateParams {
  /** Target WU name (the CLI defaults this to the current worktree's WU). */
  name: string;
  /** The working branch to rotate `plan/<name>` onto — caller judgment (`<type>/<name>`), never fabricated. */
  toBranch: string;
  /** The first task to orient on — the `Next Task` `input` the activate edge requires. */
  nextTask: string;
  /** The next-action pointer — the `Next Action` `input` the activate edge requires. */
  nextAction: string;
}

/** The inputs a `deactivate` supplies. */
export interface DeactivateParams {
  /** Target WU name (the CLI defaults this to the current worktree's WU). */
  name: string;
}

/** The outcome of an `activate` attempt — a rejection, or the activated meta path. */
export type ActivateResult =
  | { status: "rejected"; reason: string }
  | { status: "activated"; outcome: TransitionOutcome; metaPath: string; reconcile: CurrentWuReconcileResult }
  | {
      status: "reconcile-failed";
      reason: string;
      metaPath: string;
      reconcile: Extract<CurrentWuReconcileResult, { status: "conflict" }>;
    };

/** The outcome of a `deactivate` attempt — a rejection, or the de-activated meta path. */
export type DeactivateResult =
  | { status: "rejected"; reason: string }
  | { status: "deactivated"; outcome: TransitionOutcome; metaPath: string };

/**
 * Run `activate`: rotate the `plan/<name>` branch onto the caller-supplied working
 * branch, raise the phase `Planning → Active`, and set the orientation soft fields.
 * The dependent reconcile is validated first and its exact content guard applies
 * before the transition starts. Rejects when the source is not a planning WU on its
 * branch (the table's illegal-edge lookup).
 *
 * @param ctx - The executor and current-WU reconcile seams.
 * @param params - The target WU, the working branch, and the orientation inputs.
 * @returns A rejection (wrong source, or executor failure) or the activated meta path.
 */
export async function runActivate(
  ctx: ExecuteTransitionContext & CurrentWuReconcileHost,
  params: ActivateParams,
): Promise<ActivateResult> {
  const { name, toBranch, nextTask, nextAction } = params;
  const slug = SlugSchema.safeParse(name);
  if (!slug.success) {
    return { status: "rejected", reason: `\`${name}\` is not a planning WU in \`active/\` — nothing to activate.` };
  }
  const metaPath = resolveArcPath({
    kind: "work-unit-artifact",
    placement: { kind: "active", scope: { kind: "project" } },
    slug: slug.data,
    artifact: "meta",
  });

  let record: Record<MetaFieldName, string | null>;
  try {
    record = parseMetaRecord(await ctx.indexFs.readFile(join(ctx.cwd, metaPath)));
  } catch {
    return { status: "rejected", reason: `\`${name}\` is not a planning WU in \`active/\` — nothing to activate.` };
  }
  if (record.State !== "Planning") {
    return { status: "rejected", reason: `\`${name}\` is not a planning WU in \`active/\` — nothing to activate.` };
  }

  const branch = record.Branch;
  if (branch === null || branch.trim() === "" || branch === "[none]") {
    return { status: "rejected", reason: `\`${name}\` has no tracked branch in meta — refusing to activate.` };
  }
  const reconcile = await ctx.currentWuReconcile.prepare({ slug: name, metaPath });
  if (reconcile.status === "conflict") {
    return {
      status: "rejected",
      reason: `Cannot activate \`${name}\`: current-WU reconcile refused (${reconcile.reason}).`,
    };
  }
  const applied = await ctx.currentWuReconcile.apply(reconcile.prepared);
  if (applied.status === "conflict") {
    return {
      status: "reconcile-failed",
      reason:
        `Activation preflight for \`${name}\` became stale before mutation (${applied.reason}). `
        + `Rerun \`arc activate\` after reconciling the current branch.`,
      metaPath,
      reconcile: applied,
    };
  }
  const outcome = await executeTransition(ctx, {
    verb: "activate",
    slug: name,
    inputs: {
      branchOp: { mutation: "rename", branch, toBranch },
      softFields: { nextTask, nextAction },
    },
  });

  if (outcome.status !== "ok") return { status: "rejected", reason: outcome.message };
  return { status: "activated", outcome, metaPath, reconcile: applied };
}

/**
 * Run `deactivate`: rotate the working branch back to `plan/<name>` and drop the
 * phase `Active → Planning`, undoing a premature activation. Rejects when the
 * source is not an `active` WU (the table's illegal-edge lookup).
 *
 * @param ctx - The executor seams.
 * @param params - The target WU.
 * @returns A rejection (not active, or executor failure) or the de-activated meta path.
 */
export async function runDeactivate(
  ctx: ExecuteTransitionContext,
  params: DeactivateParams,
): Promise<DeactivateResult> {
  const { name } = params;
  const slug = SlugSchema.safeParse(name);
  if (!slug.success) {
    return { status: "rejected", reason: `\`${name}\` is not an active WU in \`active/\` — nothing to deactivate.` };
  }
  const metaPath = resolveArcPath({
    kind: "work-unit-artifact",
    placement: { kind: "active", scope: { kind: "project" } },
    slug: slug.data,
    artifact: "meta",
  });

  let record: Record<MetaFieldName, string | null>;
  try {
    record = parseMetaRecord(await ctx.indexFs.readFile(join(ctx.cwd, metaPath)));
  } catch {
    return { status: "rejected", reason: `\`${name}\` is not an active WU in \`active/\` — nothing to deactivate.` };
  }

  const branch = record.Branch;
  if (branch === null || branch.trim() === "" || branch === "[none]") {
    return { status: "rejected", reason: `\`${name}\` has no tracked branch in meta — refusing to deactivate.` };
  }
  const outcome = await executeTransition(ctx, {
    verb: "deactivate",
    slug: name,
    inputs: { branchOp: { mutation: "rename", branch, toBranch: `plan/${name}` } },
  });

  if (outcome.status !== "ok") return { status: "rejected", reason: outcome.message };
  return { status: "deactivated", outcome, metaPath };
}
