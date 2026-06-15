/**
 * The `abandon` verb — the destructive inverse of `stub`.
 *
 * `abandon` removes a work unit from any **pre-merge** state, leaving no residue,
 * so the resolver then returns `nonexistent`. It is a destructive cascade gated
 * on explicit confirmation (the `confirmation` guard's `--yes`); the impact-plan
 * print and the confirmation prompt are the handler's, but the refusal-without-
 * confirmation is enforced here through the guard input (never fabricated).
 *
 * The cascade is phase-polymorphic over the source state, matching the table's
 * per-cell encoding:
 *
 * - `provisional` / `planned` — a branchless backlog stub: just remove the
 *   artifact set.
 * - `planning` / `active` — a started WU: also delete the branch (local + remote)
 *   and tear down the worktree (with execution-locus relocation when abandoning
 *   the current WU).
 * - `parked` — delete the preserved branch, but tear down no worktree (a parked
 *   WU has none).
 *
 * `integrating` and merged / `shipped` are illegal (the table's marked cells):
 * post-merge backout is a new origin-linked WU (ADR-026 amendment), never a
 * same-unit abandon.
 *
 * The verb resolves the source state from the lifecycle index, composes the
 * matching leg operands (the branch-delete / worktree-teardown ops), registers a
 * `remove` artifact runner that deletes the WU's own artifact set by slug, and
 * dispatches through {@link executeTransition}.
 *
 * @module
 */

import { basename, join } from "node:path";

import { parseMetaRecord, type MetaFieldName } from "../../active/meta-reader.js";
import { buildLifecycleIndex } from "../lifecycle-index.js";
import {
  executeTransition,
  type ArtifactRunner,
  type ExecuteTransitionContext,
  type TransitionInputs,
  type TransitionOutcome,
} from "../lifecycle-executor.js";
import { resolveSlugState, type LifecycleState } from "../lifecycle-resolver.js";
import { artifactMatcher } from "../mutators/relocate-artifacts.js";

/** Filesystem seam for the `remove` artifact disposition — list, delete files, drop the emptied subdir. */
export interface AbandonFs {
  /** List entry names directly under a directory (matches `fs.readdir(p)`). */
  readdir: (path: string) => Promise<string[]>;
  /** Remove one file (matches `fs.rm(p)`). */
  rm: (path: string) => Promise<void>;
  /** Remove an emptied directory (matches `fs.rmdir(p)`); best-effort. */
  rmdir: (path: string) => Promise<void>;
}

/**
 * The seams `runAbandon` drives — the executor's transition engine (minus the
 * `scaffoldOrRemove` runner, which the verb builds) plus the artifact-removal fs.
 */
export interface AbandonContext {
  executor: Omit<ExecuteTransitionContext, "scaffoldOrRemove">;
  fs: AbandonFs;
}

/** The judgment + operational inputs an `abandon` supplies. */
export interface AbandonParams {
  /** Target WU name — slug-required for safety (never default-to-current). */
  name: string;
  /** Explicit destructive-cascade confirmation (`--yes`); absent ⇒ refused. */
  confirmed: boolean | undefined;
  /** The worktree root to tear down — required for a started (`planning` / `active`) WU. */
  worktreePath?: string;
  /** The directory the transition runs from — drives self-teardown locus relocation. */
  currentLocus?: string;
}

/** The outcome of an `abandon` attempt — a rejection, or the completed teardown. */
export type AbandonResult =
  | { status: "rejected"; reason: string }
  | { status: "abandoned"; outcome: TransitionOutcome };

/** Source states whose abandon cascade tears down a branch (started or parked WU). */
const BRANCH_TEARDOWN: ReadonlySet<LifecycleState> = new Set(["planning", "active", "parked"]);

/** Source states whose abandon cascade also tears down a worktree (started WU only). */
const WORKTREE_TEARDOWN: ReadonlySet<LifecycleState> = new Set(["planning", "active"]);

/**
 * Run `abandon`: resolve the source state, compose the per-cell teardown operands,
 * and dispatch the destructive cascade. Rejects without confirmation (the
 * `confirmation` guard), when a started WU lacks its worktree locators, or from an
 * illegal source (the table's lookup — `integrating` / merged / `shipped`).
 *
 * @param ctx - The executor seams plus the artifact-removal fs.
 * @param params - The target WU, the confirmation flag, and the worktree locators.
 * @returns A rejection or the completed teardown outcome.
 */
export async function runAbandon(ctx: AbandonContext, params: AbandonParams): Promise<AbandonResult> {
  const { name, confirmed, worktreePath, currentLocus } = params;
  const { executor, fs } = ctx;

  const index = await buildLifecycleIndex({ cwd: executor.cwd, fs: executor.indexFs });
  const state = resolveSlugState(index, name);
  const entry = index.get(name);

  const inputs: TransitionInputs = { confirmed };

  if (BRANCH_TEARDOWN.has(state) && entry !== undefined) {
    const record = await readMeta(executor, entry.path);
    inputs.branchOp = { mutation: "delete", branch: record.Branch ?? "[none]" };
  }
  if (WORKTREE_TEARDOWN.has(state)) {
    if (worktreePath === undefined || currentLocus === undefined) {
      return {
        status: "rejected",
        reason: `\`abandon\` of a started WU needs its worktree path and current locus to tear down.`,
      };
    }
    inputs.worktreeOp = { mutation: "teardown", worktreePath, currentLocus };
  }

  const scaffoldOrRemove = buildRemoveRunner(executor.cwd, fs);
  const outcome = await executeTransition({ ...executor, scaffoldOrRemove }, { verb: "abandon", slug: name, inputs });

  if (outcome.status !== "ok") return { status: "rejected", reason: outcome.message };
  return { status: "abandoned", outcome };
}

/** Read and parse a meta from its cwd-relative index path. */
async function readMeta(
  executor: AbandonContext["executor"],
  relPath: string,
): Promise<Record<MetaFieldName, string | null>> {
  return parseMetaRecord(await executor.indexFs.readFile(join(executor.cwd, relPath)));
}

/**
 * Build the `remove` artifact runner: delete the WU's own artifact set (by slug)
 * from the source directory, then drop the directory itself when it is a per-WU
 * backlog subdir (basename === slug) — never the shared flat `active/` tier.
 */
function buildRemoveRunner(cwd: string, fs: AbandonFs): ArtifactRunner {
  return async ({ disposition, slug, fromDir }) => {
    if (disposition !== "remove") {
      throw new Error(`abandon removes artifacts; received a \`${disposition}\` disposition.`);
    }
    if (fromDir === null) throw new Error("abandon-remove requires a source directory.");

    const absDir = join(cwd, fromDir);
    const matcher = artifactMatcher(slug);
    const names = (await fs.readdir(absDir)).filter((n) => matcher.test(n)).sort();
    for (const n of names) await fs.rm(join(absDir, n));

    if (basename(fromDir) === slug) {
      try {
        await fs.rmdir(absDir);
      } catch {
        // Best-effort: a still-populated or already-gone subdir is not fatal — the
        // authoritative removal is the artifact deletion above.
      }
    }
  };
}
