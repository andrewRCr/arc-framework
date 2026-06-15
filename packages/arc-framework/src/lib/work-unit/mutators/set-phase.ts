/**
 * `set-phase` — the phase-axis encoding mutator.
 *
 * The single write point for a phase-axis move: it edits the meta's
 * `**State:**` field in place and touches nothing else — no location change, no
 * branch op. It is net-new and frontmatter-preserving by necessity, since
 * `meta-reader` is read-only and `renderMetaFile` writes a full fresh meta
 * (losing narrative, ordering, and hand-edits); `setMetaState` re-renders only
 * the core-block table, leaving every other field and section intact.
 *
 * The target phase is validated against the codified {@link WorkUnitState}
 * before any write — an unknown phase is rejected, never written. The filesystem
 * read/write seams are injected (three-layer architecture).
 *
 * @module
 */

import { setMetaState } from "../../active/meta-reader.js";
import { validateState, type WorkUnitState } from "../../../commands/active/types.js";
import type { ReadFileFn, WriteFileFn } from "../../template/files.js";

/** Filesystem seams for {@link setPhase} — injected for unit testing. */
export interface SetPhaseContext {
  /** Read the meta file as UTF-8 (matches `fs.readFile(p, "utf8")`). */
  readFile: ReadFileFn;
  /** Write the rewritten meta file (matches `fs.writeFile(p, content)`). */
  writeFile: WriteFileFn;
}

/** Parameters for {@link setPhase}. */
export interface SetPhaseParams {
  /** Path to the WU's meta file. */
  metaPath: string;
  /** Target phase — validated against {@link WorkUnitState} before writing. */
  phase: string;
}

/** Outcome of a {@link setPhase} call — the canonical phase written. */
export interface SetPhaseResult {
  phase: WorkUnitState;
}

/**
 * Move a work unit's phase by rewriting its meta `**State:**` field in place.
 *
 * Validates `phase` first (an unknown phase rejects before any read or write),
 * then reads the meta, rewrites only the core-block `State` cell, and writes it
 * back.
 *
 * @param ctx - Injected read/write seams.
 * @param params - The meta path and target phase.
 * @returns The canonical phase written.
 * @throws When `phase` is not a codified state, or the meta has no core-block table.
 */
export async function setPhase(
  ctx: SetPhaseContext,
  params: SetPhaseParams,
): Promise<SetPhaseResult> {
  const phase = validateState(params.phase);
  if (phase === "unknown") {
    throw new Error(`set-phase: unknown phase "${params.phase}"`);
  }
  const content = await ctx.readFile(params.metaPath);
  await ctx.writeFile(params.metaPath, setMetaState(content, phase));
  return { phase };
}
