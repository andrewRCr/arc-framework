/**
 * The `archive` verb — the terminal sweep of a shipped work unit to `completed/`.
 *
 * `archive` (`Active` / `Integrating → completed`) is the irreversible terminal
 * edge. It is a `relocate-artifacts` caller whose destination is *computed*: the
 * dated/numbered `completed/{YYYY-qN}/{NN}_{name}/` path comes from an injected
 * clock (the quarter) plus a scan of that quarter (the next completion-order
 * `NN`) — pure deterministic mechanics, no longer hand-run in the workflow. The
 * edge fires the **mergeable** half of the ship through the executor — relocate
 * the artifact set, flip the meta `State` to `Shipped`, clear the `Branch` field
 * to `[none]` (logical, no git op), and reset the orientation soft fields — all of
 * which rides the ship PR. The **physical** branch/worktree teardown is deferred
 * to post-merge cleanup (the integration tail): the branch can't be reaped until
 * its PR merges, and the sweep must ride that same PR (one PR, full or partial
 * protection).
 *
 * Judgment — merge approval, archival timing — stays in the
 * `integrate-work-unit` / `archive` workflow; this verb runs only once that
 * judgment has been made. The verb stays thin: it reads the source meta to
 * resolve the branch, computes the destination, composes the relocate / branch /
 * worktree operands, and dispatches through {@link executeTransition}.
 *
 * When the archived member is the **last** of its cohort, the same sweep also
 * relocates the coordinating `cohort-<leaf>.md` into a `NNa_cohort-<leaf>`
 * closeout sidecar (see {@link sweepCohortDoc}). Detection is the resolver's
 * (`isArchivalTriggered`) — this verb consumes the predicate over the post-move
 * index and performs the `git mv`; it never re-derives membership.
 *
 * @module
 */

import { join } from "node:path";

import { cohortLeaf, isSafeCohortPath } from "../../active/cohort-path.js";
import { parseMetaRecord, type MetaFieldName } from "../../active/meta-reader.js";
import {
  computeArchiveDestination,
  type ArchiveDestination,
  type Clock,
  type CompletedIndexFs,
} from "../completed-index.js";
import { buildLifecycleIndex, type LifecycleIndex } from "../lifecycle-index.js";
import { isArchivalTriggered } from "../lifecycle-membership.js";
import {
  executeTransition,
  type ExecuteTransitionContext,
  type TransitionInputs,
  type TransitionOutcome,
} from "../lifecycle-executor.js";

/** The flat `active/` tier — where an Active / Integrating WU's artifacts live. */
const ACTIVE_DIR = ".arc/active";

/** The standalone-WU sentinel; carries no cohort grouping. */
const NONE_SENTINEL = "[none]";

/** The seams `runArchive` drives: the executor's transition engine plus the quarter-scan fs + clock. */
export interface ArchiveContext {
  executor: ExecuteTransitionContext;
  /** Filesystem seam for the quarter scan that computes the next archive path. */
  fs: CompletedIndexFs;
  /** Reference clock — the quarter grouping comes from `clock()`. */
  clock: Clock;
}

/** The operational inputs an `archive` supplies. */
export interface ArchiveParams {
  /** Target WU name (the CLI defaults this to the current worktree's WU). */
  name: string;
  /** Ephemeral next-step suggestion to surface (advisory; never persisted). */
  suggestion?: string;
}

/** The outcome of an `archive` attempt — a rejection, or the completed sweep. */
export type ArchiveResult =
  | { status: "rejected"; reason: string }
  | {
      status: "archived";
      outcome: TransitionOutcome;
      /** The relocated meta path under `completed/`. */
      metaPath: string;
      /** The computed dated/numbered destination. */
      destination: ArchiveDestination;
      /**
       * The relocated cohort-doc path when this archive shipped the cohort's last
       * member, or `null` when the WU is standalone or members remain in flight.
       */
      cohortSwept: string | null;
    };

/**
 * Run `archive`: compute the dated destination and relocate the WU's artifact set
 * there as the **mergeable** ship — relocate + `State → Shipped` + logical
 * `Branch → [none]` + soft-reset, all riding the PR. Physical branch/worktree
 * teardown is **not** done here; it is the integration tail's post-merge cleanup.
 * Rejects when the WU is not a started (`Active` / `Integrating`) WU in `active/`,
 * or when the executor refuses the edge (the table's lookup — every
 * non-`Active`/`Integrating` source).
 *
 * @param ctx - The executor seams plus the quarter-scan fs and clock.
 * @param params - The target WU (and an optional next-step suggestion).
 * @returns A rejection or the completed sweep (with the computed destination).
 */
export async function runArchive(ctx: ArchiveContext, params: ArchiveParams): Promise<ArchiveResult> {
  const { name, suggestion } = params;
  const { executor, fs, clock } = ctx;

  const sourceMetaPath = `${ACTIVE_DIR}/meta-${name}.md`;
  let record: Record<MetaFieldName, string | null>;
  try {
    record = parseMetaRecord(await executor.indexFs.readFile(join(executor.cwd, sourceMetaPath)));
  } catch {
    return { status: "rejected", reason: `\`${name}\` is not a started WU in \`active/\` — nothing to archive.` };
  }

  const destination = await computeArchiveDestination({ cwd: executor.cwd, fs, clock, name });

  const inputs: TransitionInputs = {
    toDir: destination.toDir,
    suggestion,
  };

  const outcome = await executeTransition(executor, { verb: "archive", slug: name, inputs });
  if (outcome.status !== "ok") return { status: "rejected", reason: outcome.message };

  // The member is now under `completed/`. Rebuild the index so the cohort-sweep
  // predicate reads the post-move state, then sweep the cohort doc if this was the
  // last member to ship.
  const postIndex = await buildLifecycleIndex({ cwd: executor.cwd, fs: executor.indexFs });
  const cohortSwept = await sweepCohortDoc(executor.relocateArtifacts, postIndex, {
    cohort: record.Cohort,
    quarter: destination.quarter,
    sequence: destination.sequence,
  });

  return { status: "archived", outcome, metaPath: `${destination.toDir}/meta-${name}.md`, destination, cohortSwept };
}

/**
 * Sweep a cohort's coordinating `cohort-<leaf>.md` into a `NNa_cohort-<leaf>`
 * closeout sidecar when the cohort's **last member has shipped** — the archival
 * trigger, detected by the resolver's {@link isArchivalTriggered} over the
 * post-move index (never re-derived here). The sidecar shares the final member's
 * completion-order number (`{NN}a`), keeping `completed/` chronological. A
 * standalone WU, the `[none]` sentinel, or a cohort with members still in flight
 * is a no-op.
 *
 * The move reuses the `relocate-artifacts` git-mv primitive with the cohort leaf
 * as the match key, so only `cohort-<leaf>.md` in the grouping dir is moved.
 *
 * @param relocate - The pre-bound `relocate-artifacts` mutator.
 * @param index - The post-move lifecycle index.
 * @param args - The archived member's cohort field and the sidecar's quarter / NN.
 * @returns The relocated cohort-doc path, or `null` when the sweep did not fire.
 */
export async function sweepCohortDoc(
  relocate: ExecuteTransitionContext["relocateArtifacts"],
  index: LifecycleIndex,
  args: { cohort: string | null; quarter: string; sequence: string },
): Promise<string | null> {
  const { cohort, quarter, sequence } = args;
  if (cohort === null) return null;
  const field = cohort.trim();
  if (field === "" || field === NONE_SENTINEL) return null;
  // Refuse to build a path from a field that could escape `backlog/planned/`
  // (`..` traversal, a leading `/`, a backslash, or a Windows drive). No-op,
  // matching the empty/sentinel skip above — never construct the path or sweep.
  if (!isSafeCohortPath(field)) return null;
  if (!isArchivalTriggered(index, field)) return null;

  const leaf = cohortLeaf(field);
  const toDir = `.arc/completed/${quarter}/${sequence}a_cohort-${leaf}`;
  const { moved } = await relocate({ slug: leaf, fromDir: `.arc/backlog/planned/${field}`, toDir });
  return moved.length > 0 ? `${toDir}/cohort-${leaf}.md` : null;
}
