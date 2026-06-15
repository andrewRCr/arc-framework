/**
 * The `park` / `resume` location-axis inverse pair.
 *
 * `park` shelves a started work unit off the active set; `resume` re-attaches it.
 * `park` is **phase-polymorphic** over the source state:
 *
 * - **park@Planning** — no code exists yet, so the `plan/<name>` branch is torn
 *   down (re-cut on resume); the artifacts relocate to `backlog/planned/` and the
 *   WU resolves `planned`.
 * - **park@Active** — code exists, so the pushed branch is **preserved** as the
 *   durable shelf (no branch leg); only the worktree is torn down, the artifacts
 *   relocate, and the tracked tree carries a minimal **pointer-record** (see
 *   {@link composePointerRecord}) opened by a derived-state callout. The WU
 *   resolves `parked` (derived from the `backlog/planned/` location; `State` stays
 *   the literal `Active`).
 *
 * Both arms require a free-form **`reason`** — never fabricated; an absent reason
 * is a rejection, mirroring `stub`'s no-default discipline. The park-from-
 * `Integrating` guard is the table's (a marked-illegal cell: withdraw the PR via
 * `reopen` first), surfaced here as the executor's rejection.
 *
 * Each verb stays thin: it resolves the source state from the meta, composes the
 * edge's operands (the relocate `toDir`, the worktree teardown/spawn op, and —
 * park@Planning only — the branch-delete op), and dispatches through
 * {@link executeTransition}; the worktree path / locus and the spawn config reach
 * it as operational inputs (the CLI resolves them). The cross-branch selectivity —
 * committing only the pointer to the tracked branch while the preserved branch
 * retains the authoritative artifacts — is the park ceremony's concern, not the
 * contract's.
 *
 * @module
 */

import { join } from "node:path";

import { parseMetaRecord, type MetaFieldName, type MetaFieldOverrides } from "../../active/meta-reader.js";
import type { WriteFileFn } from "../../template/files.js";
import {
  executeTransition,
  type ExecuteTransitionContext,
  type TransitionInputs,
  type TransitionOutcome,
} from "../lifecycle-executor.js";
import { composePointerRecord } from "../pointer-record.js";

/** The flat `active/` tier — where a started WU's artifacts live. */
const ACTIVE_DIR = ".arc/active";

/** The per-WU parked directory (cwd-relative); `parked` / `planned` both live here. */
function parkedDir(name: string): string {
  return `.arc/backlog/planned/${name}`;
}

/** Filesystem seam for writing the park@Active pointer-record. */
export interface ParkResumeFs {
  writeFile: WriteFileFn;
}

/**
 * The seams `runPark` / `runResume` drive: the executor's transition engine plus
 * the meta-write seam the pointer-record uses.
 */
export interface ParkContext {
  executor: ExecuteTransitionContext;
  fs: ParkResumeFs;
}

/** The judgment + operational inputs a `park` supplies. */
export interface ParkParams {
  /** Target WU name (the CLI defaults this to the current worktree's WU). */
  name: string;
  /** Free-form park reason — required; an absent value is a rejection (never fabricated). */
  reason: string | undefined;
  /** The worktree root to tear down (caller-resolved from `git worktree list`). */
  worktreePath: string;
  /** The directory the transition runs from — drives self-teardown detection. */
  currentLocus: string;
}

/** The operational inputs a `resume` supplies to re-attach the preserved branch. */
export interface ResumeParams {
  /** Target WU name. */
  name: string;
  /** Resolved `worktree.location_template` — where the re-attached worktree lands. */
  locationTemplate: string;
  /** Main-worktree basename — the `{repo}` expansion. */
  repo: string;
  /** Identity re-attaching the WU — the worktree ownership marker. */
  spawningIdentity: string;
}

/** The outcome of a `park` attempt — a rejection, or the parked meta path (+ pointer-record). */
export type ParkResult =
  | { status: "rejected"; reason: string }
  | { status: "parked"; outcome: TransitionOutcome; metaPath: string; pointerRecord?: string };

/** The outcome of a `resume` attempt — a rejection, or the re-attached meta path. */
export type ResumeResult =
  | { status: "rejected"; reason: string }
  | { status: "resumed"; outcome: TransitionOutcome; metaPath: string };

/** The source-meta render fields a pointer-record carries forward (sans State / Branch). */
const POINTER_RENDER_FIELDS: readonly MetaFieldName[] = [
  "Owner",
  "Class",
  "Priority",
  "Cohort",
  "Depends On",
  "Origin",
  "Design",
];

/** Collect a source meta's non-null render fields into a {@link MetaFieldOverrides}. */
function renderFieldsFrom(record: Record<MetaFieldName, string | null>): MetaFieldOverrides {
  const fields: MetaFieldOverrides = {};
  for (const name of POINTER_RENDER_FIELDS) {
    const value = record[name];
    if (value !== null) fields[name] = value;
  }
  return fields;
}

/**
 * Run `park`: resolve the source state from the meta, enforce the `reason`,
 * compose the edge's operands, and dispatch the transition. On the Active arm,
 * write the pointer-record at the relocated meta path.
 *
 * @param ctx - The executor seams plus the pointer-record write seam.
 * @param params - The target WU, the park reason, and the worktree locators.
 * @returns A rejection (missing reason, illegal source, or executor failure) or the parked meta path.
 */
export async function runPark(ctx: ParkContext, params: ParkParams): Promise<ParkResult> {
  const { name, reason, worktreePath, currentLocus } = params;

  // The reason is required before anything mutates — pure, so the non-TTY case is
  // the same rejection a missing flag is.
  if (reason === undefined || reason.trim() === "") {
    return { status: "rejected", reason: "`park` requires a `--reason` — refusing to fabricate one." };
  }

  const sourceMetaPath = `${ACTIVE_DIR}/meta-${name}.md`;
  let record: Record<MetaFieldName, string | null>;
  try {
    record = parseMetaRecord(await ctx.executor.indexFs.readFile(join(ctx.executor.cwd, sourceMetaPath)));
  } catch {
    return { status: "rejected", reason: `\`${name}\` is not a started WU in \`active/\` — nothing to park.` };
  }

  const isActive = record.State === "Active";
  const toDir = parkedDir(name);
  const inputs: TransitionInputs = {
    toDir,
    worktreeOp: { mutation: "teardown", worktreePath, currentLocus },
  };
  // park@Planning tears the codeless branch down; park@Active preserves it (no leg).
  if (record.State === "Planning" && record.Branch !== null) {
    inputs.branchOp = { mutation: "delete", branch: record.Branch };
  }

  const outcome = await executeTransition(ctx.executor, { verb: "park", slug: name, inputs });
  if (outcome.status !== "ok") return { status: "rejected", reason: outcome.message };

  const metaPath = `${toDir}/meta-${name}.md`;
  if (!isActive) return { status: "parked", outcome, metaPath };

  // park@Active: bless the relocated meta as a minimal pointer-record — the
  // authoritative artifacts stay on the preserved branch.
  const pointerRecord = composePointerRecord({
    name,
    branch: record.Branch ?? "[none]",
    reason,
    renderFields: renderFieldsFrom(record),
  });
  await ctx.fs.writeFile(join(ctx.executor.cwd, metaPath), pointerRecord);
  return { status: "parked", outcome, metaPath, pointerRecord };
}

/**
 * Run `resume`: relocate the parked WU back to `active/` and re-attach the
 * preserved branch (≈ the Materialize mechanic — spawn a worktree on the existing
 * branch).
 *
 * @param ctx - The executor seams (the pointer-record seam is unused on this arm).
 * @param params - The target WU and the worktree-spawn config.
 * @returns A rejection (no parked WU, or executor failure) or the re-attached meta path.
 */
export async function runResume(ctx: ParkContext, params: ResumeParams): Promise<ResumeResult> {
  const { name, locationTemplate, repo, spawningIdentity } = params;

  const sourceMetaPath = `${parkedDir(name)}/meta-${name}.md`;
  let record: Record<MetaFieldName, string | null>;
  try {
    record = parseMetaRecord(await ctx.executor.indexFs.readFile(join(ctx.executor.cwd, sourceMetaPath)));
  } catch {
    return { status: "rejected", reason: `\`${name}\` is not a parked WU — nothing to resume.` };
  }

  const branch = record.Branch ?? "[none]";
  const inputs: TransitionInputs = {
    toDir: ACTIVE_DIR,
    worktreeOp: {
      mutation: "spawn",
      branch,
      // Re-attach the preserved branch as its own base (the checkout-existing
      // refinement of `spawn` is the reconcile-worktree leg's to make).
      base: branch,
      locationTemplate,
      repo,
      wuName: name,
      spawningIdentity,
    },
  };

  const outcome = await executeTransition(ctx.executor, { verb: "resume", slug: name, inputs });
  if (outcome.status !== "ok") return { status: "rejected", reason: outcome.message };

  return { status: "resumed", outcome, metaPath: `${ACTIVE_DIR}/meta-${name}.md` };
}
