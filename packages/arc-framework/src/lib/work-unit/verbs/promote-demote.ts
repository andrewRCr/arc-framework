/**
 * The `promote` / `demote` backlog-tier inverse pair.
 *
 * Both move a stub between the two backlog tiers (`provisional` ↔ `planned`,
 * both physically under `backlog/`) as a content-preserving relocation — no
 * branch, no worktree, no field rewrite. `promote` carries the **Class
 * ratchet**: it refuses to raise a stub whose `Class` is still `[TBD]`, reading
 * the realized value from the source meta to feed the executor's class-resolved
 * guard, so an unclassified idea never reaches `planned/`. `demote` is the
 * unguarded inverse — it lowers a planned stub back to provisional and never
 * re-blanks the realized Class (the ratchet is sticky: a content-preserving
 * relocate carries the field down untouched).
 *
 * Each verb stays thin: it supplies the relocate `toDir` (and, for `promote`,
 * the Class input) and dispatches through {@link executeTransition}, which fires
 * the table-driven relocate leg and the render side-effects.
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

/** The judgment-free input a backlog-tier move needs — just the target stub. */
export interface BacklogMoveParams {
  /** The stub's WU name. */
  name: string;
}

/** The outcome of a `promote` / `demote` attempt — a rejection, or the relocated meta path. */
export type BacklogMoveResult =
  | { status: "rejected"; reason: string }
  | { status: "moved"; outcome: TransitionOutcome; metaPath: string };

/** The per-WU subdir path for a meta at the given backlog tier (cwd-relative). */
function tierDir(tier: "provisional" | "planned", name: string): string {
  return `.arc/backlog/${tier}/${name}`;
}

/**
 * Run `promote` (`provisional → planned`): read the stub's realized `Class` and
 * dispatch the relocation, which the class-resolved guard refuses when the Class
 * is still `[TBD]`.
 *
 * @param ctx - The executor seams (the relocate mutator is pre-bound).
 * @param params - The target stub's WU name.
 * @returns A rejection (not a provisional stub, or unresolved Class) or the relocated meta path.
 */
export async function runPromote(
  ctx: ExecuteTransitionContext,
  params: BacklogMoveParams,
): Promise<BacklogMoveResult> {
  const { name } = params;
  const fromDir = tierDir("provisional", name);

  let cls: string | null;
  try {
    const content = await ctx.indexFs.readFile(join(ctx.cwd, fromDir, `meta-${name}.md`));
    cls = parseMetaRecord(content).Class;
  } catch {
    return { status: "rejected", reason: `\`${name}\` is not a provisional stub — \`promote\` needs one to raise.` };
  }

  const toDir = tierDir("planned", name);
  const outcome = await executeTransition(ctx, {
    verb: "promote",
    slug: name,
    inputs: { class: cls ?? "[TBD]", toDir },
  });

  if (outcome.status !== "ok") return { status: "rejected", reason: outcome.message };
  return { status: "moved", outcome, metaPath: `${toDir}/meta-${name}.md` };
}

/**
 * Run `demote` (`planned → provisional`): dispatch the inverse relocation. No
 * Class gate, and the relocate preserves the realized Class untouched.
 *
 * @param ctx - The executor seams (the relocate mutator is pre-bound).
 * @param params - The target stub's WU name.
 * @returns A rejection (not a planned stub) or the relocated meta path.
 */
export async function runDemote(
  ctx: ExecuteTransitionContext,
  params: BacklogMoveParams,
): Promise<BacklogMoveResult> {
  const { name } = params;
  const toDir = tierDir("provisional", name);

  const outcome = await executeTransition(ctx, { verb: "demote", slug: name, inputs: { toDir } });

  if (outcome.status !== "ok") return { status: "rejected", reason: outcome.message };
  return { status: "moved", outcome, metaPath: `${toDir}/meta-${name}.md` };
}
