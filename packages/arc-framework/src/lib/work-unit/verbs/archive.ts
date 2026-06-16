/**
 * The `archive` verb — the terminal sweep of a shipped work unit to `completed/`.
 *
 * `archive` (`Active` / `Integrating → completed`) is the irreversible terminal
 * edge. It is a `relocate-artifacts` caller whose destination is *computed*: the
 * dated/numbered `completed/{YYYY-qN}/{NN}_{name}/` path comes from an injected
 * clock (the quarter) plus a scan of that quarter (the next completion-order
 * `NN`) — pure deterministic mechanics, no longer hand-run in the workflow. The
 * edge's full encoding fires through the executor: relocate the artifact set,
 * delete the working branch (local + remote), tear down the worktree (with
 * execution-locus relocation when archiving the current WU), flip the meta
 * `State` to `Shipped`, and reset the orientation soft fields.
 *
 * Judgment — merge approval, archival timing — stays in the
 * `integrate-work-unit` / `archive` workflow; this verb runs only once that
 * judgment has been made. The verb stays thin: it reads the source meta to
 * resolve the branch, computes the destination, composes the relocate / branch /
 * worktree operands, and dispatches through {@link executeTransition}.
 *
 * @module
 */

import { join } from "node:path";

import { parseMetaRecord, type MetaFieldName } from "../../active/meta-reader.js";
import {
  computeArchiveDestination,
  type ArchiveDestination,
  type Clock,
  type CompletedIndexFs,
} from "../completed-index.js";
import {
  executeTransition,
  type ExecuteTransitionContext,
  type TransitionInputs,
  type TransitionOutcome,
} from "../lifecycle-executor.js";

/** The flat `active/` tier — where an Active / Integrating WU's artifacts live. */
const ACTIVE_DIR = ".arc/active";

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
  /** The worktree root to tear down (caller-resolved from the worktree list). */
  worktreePath: string;
  /** The directory the transition runs from — drives self-teardown locus relocation. */
  currentLocus: string;
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
    };

/**
 * Run `archive`: compute the dated destination, relocate the WU's artifact set
 * there, and tear down its branch + worktree. Rejects when the WU is not a
 * started (`Active` / `Integrating`) WU in `active/`, or when the executor refuses
 * the edge (the table's lookup — every non-`Active`/`Integrating` source).
 *
 * @param ctx - The executor seams plus the quarter-scan fs and clock.
 * @param params - The target WU and the worktree locators.
 * @returns A rejection or the completed sweep (with the computed destination).
 */
export async function runArchive(ctx: ArchiveContext, params: ArchiveParams): Promise<ArchiveResult> {
  const { name, worktreePath, currentLocus, suggestion } = params;
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
    branchOp: { mutation: "delete", branch: record.Branch ?? "[none]" },
    worktreeOp: { mutation: "teardown", worktreePath, currentLocus },
    suggestion,
  };

  const outcome = await executeTransition(executor, { verb: "archive", slug: name, inputs });
  if (outcome.status !== "ok") return { status: "rejected", reason: outcome.message };

  return { status: "archived", outcome, metaPath: `${destination.toDir}/meta-${name}.md`, destination };
}
