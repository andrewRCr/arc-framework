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
 * closeout sidecar (see {@link sweepCohortDoc}); and when that member is nested
 * and the ship also closes out its parent cohort, the parent's `cohort-<parent>.md`
 * follows into a `NNb_cohort-<parent>` sidecar (see {@link sweepNestedParentDoc}).
 * Detection is the resolver's (`isArchivalTriggeredWithDescendants`, which counts
 * subcohort members transitively) — this verb consumes the predicate over the
 * post-move index and performs the `git mv`; it never re-derives membership.
 *
 * @module
 */

import { join } from "node:path";

import { cohortLeaf, cohortParent, isSafeCohortPath } from "../../active/cohort-path.js";
import { parseMetaRecord, type MetaFieldName } from "../../active/meta-reader.js";
import {
  computeArchiveDestination,
  type ArchiveDestination,
  type Clock,
  type CompletedIndexFs,
} from "../completed-index.js";
import { buildLifecycleIndex, type LifecycleIndex } from "../lifecycle-index.js";
import { isArchivalTriggeredWithDescendants } from "../lifecycle-membership.js";
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
  /**
   * The integration PR URL → meta `PR URL`. Optional: absent writes a `[none]`
   * placeholder and surfaces a backfill warning (offline / resume / pre-PR), so
   * the sweep never blocks on a URL it can't resolve.
   */
  prUrl?: string;
  /** Completion date (`YYYY-MM-DD`) → meta `Completed`; defaults to the injected clock's day. */
  completed?: string;
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
      /**
       * The relocated nested-parent cohort-doc path when this archive also closed
       * out the shipping member's nested parent (the `{NN}b` cascade), or `null`
       * when the member is not nested or the parent has members still in flight.
       */
      nestedParentSwept: string | null;
      /** Non-fatal advisories (e.g. the absent-`--pr-url` backfill notice). */
      warnings: string[];
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
  const { name, prUrl, completed, suggestion } = params;
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

  const metaPath = `${destination.toDir}/meta-${name}.md`;

  // Write the finalize facts to the relocated meta as managed fields (the
  // structured replacement for the hand-appended post-integration prose block).
  // `--pr-url` is optional: an absent URL writes a `[none]` placeholder and warns,
  // so an offline / pre-PR / resumed ship still completes (backfill later). The
  // completion date defaults to the clock's day — archive runs pre-merge, so the
  // git merge timestamp isn't available and the ship day is the right default.
  const warnings: string[] = [];
  const resolvedPrUrl = prUrl ?? PR_URL_PLACEHOLDER;
  if (prUrl === undefined) {
    warnings.push(
      `No \`--pr-url\` supplied — wrote a \`${PR_URL_PLACEHOLDER}\` placeholder; ` +
        `set the \`PR URL\` field in the archived meta once the PR exists (archive can't retarget a shipped WU).`,
    );
  }
  // The finalize-write seams are core archive side effects — never silently skipped
  // (the `?.` no-op would lose the facts) and never escaping as an uncaught throw
  // (every other archive failure returns a rejection). The relocation already
  // landed, so a write failure surfaces as a rejection that names the partial state.
  if (executor.writeFinalizeFields === undefined || executor.stageMeta === undefined) {
    return { status: "rejected", reason: "`archive` finalize-write seams are not wired (internal error)." };
  }
  try {
    await executor.writeFinalizeFields(metaPath, { prUrl: resolvedPrUrl, completed: completed ?? today(clock) });
    await executor.stageMeta(metaPath);
  } catch (err) {
    return {
      status: "rejected",
      reason:
        `archive relocated \`${name}\` but could not persist its finalize fields ` +
        `(${err instanceof Error ? err.message : String(err)}) — set \`PR URL\` / \`Completed\` in the archived meta.`,
    };
  }

  // The member is now under `completed/`. Rebuild the index so the cohort-sweep
  // predicate reads the post-move state, then sweep the cohort doc if this was the
  // last member to ship.
  const postIndex = await buildLifecycleIndex({ cwd: executor.cwd, fs: executor.indexFs });
  const sweepArgs = {
    cohort: record.Cohort,
    quarter: destination.quarter,
    sequence: destination.sequence,
  };
  const cohortSwept = await sweepCohortDoc(executor.relocateArtifacts, postIndex, sweepArgs);
  const nestedParentSwept = await sweepNestedParentDoc(executor.relocateArtifacts, postIndex, sweepArgs);

  return { status: "archived", outcome, metaPath, destination, cohortSwept, nestedParentSwept, warnings };
}

/** The placeholder `PR URL` written when `--pr-url` is absent — a bare sentinel, backfilled later. */
const PR_URL_PLACEHOLDER = "[none]";

/** The clock's day as a `YYYY-MM-DD` stamp, in local components (matching the quarter label). */
function today(clock: Clock): string {
  const d = clock();
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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
  // Descendants-aware so a nested parent (when the member's field IS the parent)
  // is held back until its subcohorts ship; for a leaf this is exact membership.
  if (!isArchivalTriggeredWithDescendants(index, field)) return null;

  const leaf = cohortLeaf(field);
  const toDir = `.arc/completed/${quarter}/${sequence}a_cohort-${leaf}`;
  const { moved } = await relocate({ slug: leaf, fromDir: `.arc/backlog/planned/${field}`, toDir });
  return moved.length > 0 ? `${toDir}/cohort-${leaf}.md` : null;
}

/**
 * Sweep a nested member's coordinating **parent** `cohort-<parent>.md` into a
 * `NNb_cohort-<parent>` closeout sidecar when archiving that member also closes
 * out its nested parent — the parent's archival trigger has fired transitively
 * (every direct and subcohort member shipped). The `{NN}b` suffix shares the
 * member's completion-order number, sorting just after the `{NN}a` leaf sidecar
 * the same archive produced (inner → outer within one `NN`).
 *
 * A no-op when the field is standalone / the `[none]` sentinel, single-segment
 * (no parent to sweep), unsafe to interpolate into a path, or when the parent
 * still has members in flight. Mirrors {@link sweepCohortDoc}'s path-safety and
 * post-move-index contract.
 *
 * @param relocate - The pre-bound `relocate-artifacts` mutator.
 * @param index - The post-move lifecycle index.
 * @param args - The archived member's cohort field and the sidecar's quarter / NN.
 * @returns The relocated parent cohort-doc path, or `null` when the sweep did not fire.
 */
export async function sweepNestedParentDoc(
  relocate: ExecuteTransitionContext["relocateArtifacts"],
  index: LifecycleIndex,
  args: { cohort: string | null; quarter: string; sequence: string },
): Promise<string | null> {
  const { cohort, quarter, sequence } = args;
  if (cohort === null) return null;
  const field = cohort.trim();
  if (field === "" || field === NONE_SENTINEL) return null;
  if (!isSafeCohortPath(field)) return null;

  const parent = cohortParent(field);
  if (parent === null) return null;
  if (!isArchivalTriggeredWithDescendants(index, parent)) return null;

  const toDir = `.arc/completed/${quarter}/${sequence}b_cohort-${parent}`;
  const { moved } = await relocate({ slug: parent, fromDir: `.arc/backlog/planned/${parent}`, toDir });
  return moved.length > 0 ? `${toDir}/cohort-${parent}.md` : null;
}
