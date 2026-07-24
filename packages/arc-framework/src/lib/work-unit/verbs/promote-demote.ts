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
 * Both are **cohort-aware**. A stub may be standalone (`backlog/{tier}/{name}/`)
 * or nested under its cohort path (`backlog/{tier}/{cohort}/{name}/`). The source
 * directory is resolved from the lifecycle index — never assumed flat — so the
 * destination preserves the same cohort segment, and the emptied source dirs are
 * pruned up to (never including) the tier root after the move. The executor
 * derives the relocate's `fromDir` from the resolved meta path itself; the verb
 * supplies the matching nested `toDir`.
 *
 * Each verb stays thin: it locates the stub, supplies the relocate `toDir` (and,
 * for `promote`, the Class input), dispatches through {@link executeTransition},
 * and prunes the emptied source.
 *
 * @module
 */

import { join, posix } from "node:path";

import { parseMetaRecord } from "../../active/meta-reader.js";
import { SlugSchema } from "../../kernel/index.js";
import { resolveArcPath, type WorkUnitPlacement } from "../../layout/index.js";
import { buildLifecycleIndex } from "../lifecycle-index.js";
import {
  executeTransition,
  type ExecuteTransitionContext,
  type TransitionOutcome,
} from "../lifecycle-executor.js";

/** Filesystem seam for the emptied-source prune — list a dir, remove an emptied one. */
export interface BacklogMoveFs {
  /** List entry names directly under a directory (matches `fs.readdir(p)`). */
  readdir(path: string): Promise<string[]>;
  /** Remove an emptied directory (matches `fs.rmdir(p)`); best-effort. */
  rmdir(path: string): Promise<void>;
}

/** The seams a backlog-tier move drives — the executor's transition engine plus the prune fs. */
export interface BacklogMoveContext {
  executor: ExecuteTransitionContext;
  fs: BacklogMoveFs;
}

/** The judgment-free input a backlog-tier move needs — just the target stub. */
export interface BacklogMoveParams {
  /** The stub's WU name. */
  name: string;
}

/** The outcome of a `promote` / `demote` attempt — a rejection, or the relocated meta path. */
export type BacklogMoveResult =
  | { status: "rejected"; reason: string }
  | { status: "moved"; outcome: TransitionOutcome; metaPath: string };

function projectBacklogDestination(
  entry: { slug: string; cohort: string | null },
  commitment: "provisional" | "planned",
): { toDir: string; metaPath: string } | { reason: string } {
  const slug = SlugSchema.safeParse(entry.slug);
  if (!slug.success) return { reason: `Lifecycle record carries an invalid work-unit slug \`${entry.slug}\`.` };
  const rawCohort = entry.cohort?.trim();
  const cohortSegments = rawCohort === undefined || rawCohort === "" || rawCohort === "[none]"
    ? []
    : rawCohort.split("/");
  if (cohortSegments.some((segment) => !SlugSchema.safeParse(segment).success) || cohortSegments.length > 2) {
    return { reason: `Lifecycle record carries an invalid Cohort path \`${entry.cohort ?? ""}\`.` };
  }
  const placement: WorkUnitPlacement = {
    kind: "backlog",
    commitment,
    cohort: cohortSegments.map((segment) => SlugSchema.parse(segment)),
  };
  return {
    toDir: resolveArcPath({ kind: "work-unit-container", placement, slug: slug.data }),
    metaPath: resolveArcPath({ kind: "work-unit-artifact", placement, slug: slug.data, artifact: "meta" }),
  };
}

/**
 * Prune the emptied source directories after a relocate: walk up from the stub's
 * own subdir, removing each directory that the move left empty, and stop at the
 * first non-empty directory or at the tier root (which is never removed). Best-
 * effort throughout — an already-gone or still-populated dir ends the walk
 * without failing the completed transition.
 *
 * @param cwd - Repository root containing `.arc/`.
 * @param fs - The prune filesystem seam.
 * @param leafDir - The stub's own (cwd-relative) source subdir.
 * @param tier - The source tier, whose root bounds the walk.
 */
async function pruneEmptySource(
  cwd: string,
  fs: BacklogMoveFs,
  leafDir: string,
  tier: "provisional" | "planned",
): Promise<void> {
  const belowTier = `${resolveArcPath({ kind: "placement-root", tier })}/`;
  let dir = leafDir;
  while (dir.startsWith(belowTier)) {
    const abs = join(cwd, dir);
    let remaining: string[];
    try {
      remaining = await fs.readdir(abs);
    } catch {
      break; // already gone — nothing to prune above it.
    }
    if (remaining.length > 0) break; // a sibling or other content remains — stop.
    try {
      await fs.rmdir(abs);
    } catch {
      break; // best-effort — leave the rest to the operator.
    }
    dir = posix.dirname(dir);
  }
}

/**
 * Run `promote` (`provisional → planned`): locate the stub via the index, read
 * its realized `Class`, and dispatch the relocation into the matching cohort
 * segment — the class-resolved guard refuses when the Class is still `[TBD]`.
 * Prunes the emptied source dirs on success.
 *
 * @param ctx - The executor seams plus the prune fs.
 * @param params - The target stub's WU name.
 * @returns A rejection (not a provisional stub, or unresolved Class) or the relocated meta path.
 */
export async function runPromote(ctx: BacklogMoveContext, params: BacklogMoveParams): Promise<BacklogMoveResult> {
  const { name } = params;
  const { executor, fs } = ctx;

  const index = await buildLifecycleIndex({ cwd: executor.cwd, fs: executor.indexFs });
  const entry = index.get(name);
  if (entry === undefined || entry.location !== "provisional") {
    return { status: "rejected", reason: `\`${name}\` is not a provisional stub — \`promote\` needs one to raise.` };
  }

  const fromDir = posix.dirname(entry.path);
  const cls = parseMetaRecord(await executor.indexFs.readFile(join(executor.cwd, entry.path))).workClass;
  const destination = projectBacklogDestination(entry, "planned");
  if ("reason" in destination) return { status: "rejected", reason: destination.reason };
  const { toDir, metaPath } = destination;

  const outcome = await executeTransition(executor, {
    verb: "promote",
    slug: name,
    inputs: { class: cls ?? "TBD", toDir },
  });

  if (outcome.status !== "ok") return { status: "rejected", reason: outcome.message };
  await pruneEmptySource(executor.cwd, fs, fromDir, "provisional");
  return { status: "moved", outcome, metaPath };
}

/**
 * Run `demote` (`planned → provisional`): locate the stub via the index and
 * dispatch the inverse relocation into the matching cohort segment. No Class
 * gate, and the relocate preserves the realized Class untouched. Prunes the
 * emptied source dirs on success.
 *
 * @param ctx - The executor seams plus the prune fs.
 * @param params - The target stub's WU name.
 * @returns A rejection (not a planned stub) or the relocated meta path.
 */
export async function runDemote(ctx: BacklogMoveContext, params: BacklogMoveParams): Promise<BacklogMoveResult> {
  const { name } = params;
  const { executor, fs } = ctx;

  const index = await buildLifecycleIndex({ cwd: executor.cwd, fs: executor.indexFs });
  const entry = index.get(name);
  if (entry === undefined || entry.location !== "planned") {
    return { status: "rejected", reason: `\`${name}\` is not a planned stub — \`demote\` needs one to lower.` };
  }

  const fromDir = posix.dirname(entry.path);
  const destination = projectBacklogDestination(entry, "provisional");
  if ("reason" in destination) return { status: "rejected", reason: destination.reason };
  const { toDir, metaPath } = destination;

  const outcome = await executeTransition(executor, { verb: "demote", slug: name, inputs: { toDir } });

  if (outcome.status !== "ok") return { status: "rejected", reason: outcome.message };
  await pruneEmptySource(executor.cwd, fs, fromDir, "planned");
  return { status: "moved", outcome, metaPath };
}
