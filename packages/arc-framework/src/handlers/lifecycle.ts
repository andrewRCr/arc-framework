/**
 * The shared CLI binding shape for the work-unit lifecycle verbs.
 *
 * Every transition-targeting verb (`park` / `resume` / `activate` / … ) opens the
 * same way: resolve *which* work unit it acts on, or — when that can't be answered
 * non-interactively — print the actionable candidates and bail. {@link resolveVerbTargetOrReport}
 * is that shared opening: each verb handler calls it to obtain its target slug, and
 * returns early when it gets `null` (the candidate list has already been surfaced).
 *
 * The decision logic is the pure {@link selectVerbTarget} core; this layer adds only
 * the I/O the core can't own — building the lifecycle index, reading the current
 * worktree's WU for the context-defaulting fallback, and printing the
 * **non-interactive** candidate surface (a `p.log.error` line plus a non-zero exit,
 * never a TTY-blocking `select` — the same precedent as `start`'s usage refusal).
 *
 * @module
 */

import { readFile, readdir } from "node:fs/promises";

import * as p from "@clack/prompts";

import { readActiveMetaCandidates } from "../lib/active/meta-reader.js";
import { buildLifecycleIndex, type LifecycleIndexFs } from "../lib/work-unit/lifecycle-index.js";
import {
  DISPATCH_MODE,
  findVerbCandidates,
  formatVerbCandidates,
  selectVerbTarget,
  type TransitionVerb,
} from "../lib/work-unit/verbs/dispatch.js";

/** The production filesystem seam for the lifecycle-index scan (mirrors `start`). */
const lifecycleFs: LifecycleIndexFs = {
  readdir: (path) => readdir(path, { withFileTypes: true }),
  readFile: (path) => readFile(path, "utf8"),
};

/** `meta-<slug>.md` → `<slug>`, or `null` when the filename is not a meta file. */
function slugFromMetaFilename(filename: string): string | null {
  return /^meta-(.+)\.md$/u.exec(filename)?.[1] ?? null;
}

/**
 * The current worktree's WU slug for the context-defaulting fallback — the single
 * active meta's slug, or `null` when zero or more than one resolved (no unambiguous
 * default to act on).
 */
async function resolveCurrentWuSlug(cwd: string): Promise<string | null> {
  const { candidates } = await readActiveMetaCandidates(cwd);
  const [only] = candidates;
  if (candidates.length !== 1 || only === undefined) return null;
  return slugFromMetaFilename(only.filename);
}

/**
 * Resolve the work unit a verb acts on, or surface the candidate list and bail. The
 * shared opening every lifecycle verb handler runs first: an explicit slug resolves
 * directly; a context-defaulting verb with no slug falls back to the current
 * worktree's WU; anything unresolved prints the verb's actionable candidates
 * (non-interactively) and returns `null` after setting a non-zero exit code.
 *
 * @param verb - The dispatched verb.
 * @param slugArg - The explicit slug argument, if any.
 * @param cwd - Repository root containing `.arc/`.
 * @returns The resolved target slug, or `null` when the candidate list was surfaced.
 */
export async function resolveVerbTargetOrReport(
  verb: TransitionVerb,
  slugArg: string | undefined,
  cwd: string,
): Promise<string | null> {
  const needsCurrentWu = !slugArg?.trim() && DISPATCH_MODE[verb] === "context-defaulting";
  const currentWuSlug = needsCurrentWu ? await resolveCurrentWuSlug(cwd) : null;

  const target = selectVerbTarget(verb, slugArg, currentWuSlug);
  if (target.kind === "resolved") return target.slug;

  const index = await buildLifecycleIndex({ cwd, fs: lifecycleFs });
  p.log.error(formatVerbCandidates(verb, findVerbCandidates(index, verb)));
  process.exitCode = 1;
  return null;
}
