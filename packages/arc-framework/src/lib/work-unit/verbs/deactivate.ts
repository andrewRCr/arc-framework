/**
 * The `deactivate` verb — the narrow inverse of `activate`.
 *
 * `deactivate` undoes a *premature* activation: a recoverable phase↓
 * (`Active → Planning`) that rotates the working branch back `<type>/ → plan/`
 * and clears the just-set `Next Task`, with **no location move** (the WU stays in
 * `active/`). It is narrow by design — shelving in-progress work is `park@Active`,
 * destructive teardown is `abandon`, and there is no merged corner (post-merge
 * rework is a new origin-linked WU; ADR-026 amendment).
 *
 * The verb stays thin: it reads the current working branch from the meta, derives
 * the `plan/<name>` rotation target, and dispatches through
 * {@link executeTransition}; the branch rename, the phase write, and the
 * soft-field reset are the table's. A non-`active` source is the table's
 * illegal-edge rejection (only an `active` WU qualifies).
 *
 * @module
 */

import { join } from "node:path";

import { parseMetaRecord, type MetaFieldName } from "../../active/meta-reader.js";
import {
  executeTransition,
  type ExecuteTransitionContext,
  type TransitionOutcome,
} from "../lifecycle-executor.js";

/** The flat `active/` tier — where an activated WU's meta lives. */
const ACTIVE_DIR = ".arc/active";

/** The inputs a `deactivate` supplies. */
export interface DeactivateParams {
  /** Target WU name (the CLI defaults this to the current worktree's WU). */
  name: string;
}

/** The outcome of a `deactivate` attempt — a rejection, or the de-activated meta path. */
export type DeactivateResult =
  | { status: "rejected"; reason: string }
  | { status: "deactivated"; outcome: TransitionOutcome; metaPath: string };

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
  const metaPath = `${ACTIVE_DIR}/meta-${name}.md`;

  let record: Record<MetaFieldName, string | null>;
  try {
    record = parseMetaRecord(await ctx.indexFs.readFile(join(ctx.cwd, metaPath)));
  } catch {
    return { status: "rejected", reason: `\`${name}\` is not an active WU in \`active/\` — nothing to deactivate.` };
  }

  const branch = record.Branch ?? "[none]";
  const outcome = await executeTransition(ctx, {
    verb: "deactivate",
    slug: name,
    inputs: { branchOp: { mutation: "rename", branch, toBranch: `plan/${name}` } },
  });

  if (outcome.status !== "ok") return { status: "rejected", reason: outcome.message };
  return { status: "deactivated", outcome, metaPath };
}
