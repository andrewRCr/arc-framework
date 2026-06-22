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
 * - `planning` / `active` — a started WU: remove the artifact set in-verb; its
 *   branch + worktree teardown is **out-of-band**, a post-action `arc teardown
 *   <name> --force` (the in-verb teardown legs tripped the `worktree-clean` guard
 *   on the verb's own staged removal and, in-place, targeted the un-removable
 *   primary worktree — see the abandon edges in `lifecycle-transitions`).
 * - `parked` — delete the preserved branch, but tear down no worktree (a parked
 *   WU has none, so no self-teardown to defer).
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
import { validFromStates } from "./dispatch.js";

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
}

/** The outcome of an `abandon` attempt — a rejection, or the completed teardown. */
export type AbandonResult =
  | { status: "rejected"; reason: string }
  | { status: "abandoned"; outcome: TransitionOutcome };

/** Started states whose branch + worktree teardown is deferred to a post-action `arc teardown --force`. */
const STARTED: ReadonlySet<LifecycleState> = new Set(["planning", "active"]);

/** Source states whose abandon cascade deletes a branch in-verb — only `parked` (no worktree to self-teardown). */
const IN_VERB_BRANCH_DELETE: ReadonlySet<LifecycleState> = new Set(["parked"]);

/** The destructive-cascade impact preview for an `abandon` — its legality and the cascade lines. */
export interface AbandonPlan {
  /** Whether `abandon` may legally act on the resolved state (a pre-merge cell). */
  legal: boolean;
  /** The cascade lines to present before requiring confirmation (empty when illegal). */
  lines: string[];
}

/**
 * Compose the destructive-cascade impact plan for a resolved source state, gated on
 * the state's table cell: a backlog stub removes only artifacts; a started WU
 * removes artifacts in-verb and defers branch + worktree teardown to a post-action
 * `arc teardown <name> --force`; a parked WU deletes its branch in-verb but has no
 * worktree. Pure: the handler resolves the state + branch, prints these lines, and
 * refuses without explicit confirmation.
 *
 * @param state - The target WU's resolved lifecycle state.
 * @param branch - The WU's branch (for the parked branch-delete leg), or null when none.
 * @param name - The WU slug, for the started-state post-action teardown command.
 * @returns The legality verdict and the impact-plan lines (empty when illegal).
 */
export function planAbandon(state: LifecycleState, branch: string | null, name: string): AbandonPlan {
  if (!validFromStates("abandon").includes(state)) return { legal: false, lines: [] };
  const lines = ["Artifacts: remove the work unit's artifact set"];
  if (STARTED.has(state)) {
    lines.push(`Teardown:  post-action — \`arc teardown ${name} --force\` (branch + worktree)`);
  } else if (IN_VERB_BRANCH_DELETE.has(state)) {
    lines.push(`Branch:    delete \`${branch ?? "[none]"}\` (local + remote)`);
  }
  lines.push("Workspace: remove the user session workspace");
  lines.push("ROADMAP:   remove its row");
  return { legal: true, lines };
}

/**
 * Run `abandon`: resolve the source state, compose the per-cell operands, and
 * dispatch the destructive cascade. A started WU's branch + worktree teardown is
 * **not** fired here — it is deferred to a post-action `arc teardown --force` (see
 * the abandon edges in `lifecycle-transitions`); only a `parked` WU deletes its
 * branch in-verb. Rejects without confirmation (the `confirmation` guard) or from an
 * illegal source (the table's lookup — `integrating` / merged / `shipped`).
 *
 * @param ctx - The executor seams plus the artifact-removal fs.
 * @param params - The target WU and the confirmation flag.
 * @returns A rejection or the completed teardown outcome.
 */
export async function runAbandon(ctx: AbandonContext, params: AbandonParams): Promise<AbandonResult> {
  const { name, confirmed } = params;
  const { executor, fs } = ctx;

  const index = await buildLifecycleIndex({ cwd: executor.cwd, fs: executor.indexFs });
  const state = resolveSlugState(index, name);
  const entry = index.get(name);

  const inputs: TransitionInputs = { confirmed };

  if (IN_VERB_BRANCH_DELETE.has(state) && entry !== undefined) {
    const record = await readMeta(executor, entry.path);
    inputs.branchOp = { mutation: "delete", branch: record.Branch ?? "[none]" };
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
