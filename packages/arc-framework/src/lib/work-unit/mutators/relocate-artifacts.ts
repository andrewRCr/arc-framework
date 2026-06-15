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

import { join } from "node:path";

import type { GitExec } from "../../git/exec.js";
import { ensureDir, type MkdirFn } from "../../template/files.js";

/** Filesystem seam for {@link relocateArtifacts} — injected for unit testing. */
export interface RelocateArtifactsFs {
  /** List entry names directly under a directory (matches `fs.readdir(p)`). */
  readdir(path: string): Promise<string[]>;
  /** Create a directory and any parents (matches `fs.mkdir(p, { recursive })`). */
  mkdir: MkdirFn;
}

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
 */
function artifactMatcher(slug: string): RegExp {
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
  return { moved: names };
}
