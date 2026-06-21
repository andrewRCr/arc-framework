/**
 * `relocate-artifacts` — the location-axis encoding mutator.
 *
 * Performs the `git mv` of a work unit's full artifact set (`meta-*`, `spec-*`,
 * `tasks-*`, `draft-*`, and any companions) between two lifecycle directories,
 * so no transition re-authors relocation inline. This is the *move-existing*
 * primitive — distinct from create-new's `scaffold`, which writes a fresh set
 * from template: graduate relocates, create-new scaffolds.
 *
 * The destination directory is supplied by the caller; the dated/numbered
 * `completed/{YYYY-qN}/{NN}_{name}/` path is computed at the `archive` sweep,
 * never here. The set is discovered from the source directory by slug, so a
 * missing optional artifact is a no-op (it simply is not in the listing) and a
 * file that merely shares the directory but not the slug — another WU's meta, a
 * `cohort-*.md` — is never moved.
 *
 * Filesystem + git seams are injected (three-layer architecture); production
 * binds `node:fs/promises` `readdir`/`mkdir` and the real git executor.
 *
 * @module
 */

import { join, posix } from "node:path";

import type { GitExec } from "../../git/exec.js";
import { ensureDir, type MkdirFn } from "../../template/files.js";

/** Filesystem seam for {@link relocateArtifacts} — injected for unit testing. */
export interface RelocateArtifactsFs {
  /** List entry names directly under a directory (matches `fs.readdir(p)`). */
  readdir(path: string): Promise<string[]>;
  /** Create a directory and any parents (matches `fs.mkdir(p, { recursive })`). */
  mkdir: MkdirFn;
  /** Remove an emptied directory (matches `fs.rmdir(p)`); best-effort. */
  rmdir(path: string): Promise<void>;
}

/**
 * The backlog tiers whose member / cohort subdirs a relocate prunes when emptied.
 * A `git mv` of the last member out of `backlog/planned/<cohort>/<member>/` leaves
 * the subdir (and, when it was the last, its cohort parent) empty; the prune walks
 * up removing each empty level while it stays *strictly below* one of these roots,
 * so the tier root itself — and any source outside the backlog tree (`active/` on
 * the archive sweep) — is never removed.
 */
const PRUNE_BOUNDARY_TIERS = [".arc/backlog/planned", ".arc/backlog/provisional"] as const;

/** Dependencies for {@link relocateArtifacts}. */
export interface RelocateArtifactsContext {
  /** Git executor — runs `git mv`. */
  exec: GitExec;
  fs: RelocateArtifactsFs;
}

/** Parameters for {@link relocateArtifacts}. */
export interface RelocateArtifactsParams {
  /** Work-unit slug — selects which `<prefix>-<slug>.md` files form the set. */
  slug: string;
  /** Directory currently holding the artifact set. */
  fromDir: string;
  /** Destination directory (caller-computed; created if absent). */
  toDir: string;
}

/** Outcome of a relocation — the artifact filenames moved, in listing order. */
export interface RelocateArtifactsResult {
  /** The moved filenames, sorted for deterministic ordering. */
  moved: string[];
}

/**
 * A WU artifact filename matcher — `<prefix>-<slug>.md` for an exact slug. The
 * prefix is a hyphen-free token (`meta` / `spec` / `tasks` / `draft` / `notes` /
 * a companion), so the hyphenated slug anchors unambiguously: a foreign WU whose
 * name merely ends with this slug cannot match, nor can a `cohort-<name>.md`.
 *
 * Exported so the `remove`-disposition runner (`abandon`) selects the same set
 * this `relocate` mutator moves — one definition of "a WU's artifact set".
 */
export function artifactMatcher(slug: string): RegExp {
  const escaped = slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^[a-z]+-${escaped}\\.md$`);
}

/**
 * Relocate a work unit's full artifact set between two lifecycle directories via
 * `git mv`, creating the destination directory if absent.
 *
 * The set is discovered from `fromDir` by slug, so missing optional artifacts
 * are no-ops and foreign files are left untouched; an empty match makes no move
 * and creates no directory.
 *
 * @param ctx - Injected git + filesystem seams.
 * @param params - Slug and the source / destination directories.
 * @returns The filenames moved, sorted for deterministic ordering.
 */
export async function relocateArtifacts(
  ctx: RelocateArtifactsContext,
  params: RelocateArtifactsParams,
): Promise<RelocateArtifactsResult> {
  const { slug, fromDir, toDir } = params;
  const matcher = artifactMatcher(slug);
  const names = (await ctx.fs.readdir(fromDir)).filter((name) => matcher.test(name)).sort();

  if (names.length === 0) return { moved: [] };

  await ensureDir(toDir, ctx.fs.mkdir);
  for (const name of names) {
    await ctx.exec("git", ["mv", join(fromDir, name), join(toDir, name)]);
  }

  await pruneEmptyBacklogSource(ctx.fs, fromDir);
  return { moved: names };
}

/** The directory seam {@link pruneEmptyBacklogSource} drives — list to test emptiness, remove. */
export interface PruneBacklogFs {
  /** List entry names directly under a directory (matches `fs.readdir(p)`). */
  readdir(path: string): Promise<string[]>;
  /** Remove an emptied directory (matches `fs.rmdir(p)`); best-effort. */
  rmdir(path: string): Promise<void>;
}

/**
 * Resolve the backlog-tier root `dir` sits under — the level the prune stops at —
 * or `null` when `dir` is outside the backlog tree. Matches the tier as a full
 * path segment in either form the callers pass: repo-relative (`.arc/backlog/…`,
 * the relocate mutator) or absolute (`/repo/.arc/backlog/…`, the `decompose`
 * origin-remove runner).
 */
function backlogTierRoot(dir: string): string | null {
  for (const tier of PRUNE_BOUNDARY_TIERS) {
    const at = dir.indexOf(`/${tier}/`);
    if (at !== -1) return dir.slice(0, at) + `/${tier}`;
    if (dir === tier || dir.startsWith(`${tier}/`)) return tier;
  }
  return null;
}

/**
 * Prune the now-emptied backlog source subdir(s) after a relocation or removal —
 * the shared counterpart to the `promote` / `demote` / `abandon` verb-level prune,
 * so the graduate path (which runs through the relocate mutator) and the
 * `decompose` origin-teardown (which removes a retired stub in place) no longer
 * leave an orphaned member / cohort subdir behind. Walks up from `fromDir`
 * removing each empty level while it stays *strictly below* the {@link
 * PRUNE_BOUNDARY_TIERS} root, stopping at the first occupied dir (a sibling member,
 * the `cohort-*.md` doc) or the tier root. Best-effort and bounded to the backlog
 * tree: an `active/` source (the archive sweep, a `Planning`-origin decompose) is
 * outside any tier, so the prune is a no-op there. Git does not track empty dirs,
 * so this is a local-cosmetic cleanup, never a staged change.
 *
 * @param fs - The list / remove directory seam.
 * @param fromDir - The vacated source directory (relative or absolute).
 */
export async function pruneEmptyBacklogSource(fs: PruneBacklogFs, fromDir: string): Promise<void> {
  let dir = fromDir.split("\\").join("/");
  const root = backlogTierRoot(dir);
  if (root === null) return;
  while (dir !== root && dir.startsWith(`${root}/`)) {
    let remaining: string[];
    try {
      remaining = await fs.readdir(dir);
    } catch {
      break; // already gone — nothing to prune above it.
    }
    if (remaining.length > 0) break; // a sibling member / the cohort doc remains.
    try {
      await fs.rmdir(dir);
    } catch {
      break; // best-effort — leave the rest to the operator.
    }
    dir = posix.dirname(dir);
  }
}
