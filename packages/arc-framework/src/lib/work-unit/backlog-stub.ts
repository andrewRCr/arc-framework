/**
 * Minimal backlog-stub resolver — locates a planning stub by slug across the two
 * backlog state-dirs (`backlog/planned/`, `backlog/provisional/`), returning its
 * directory, state-dir, meta path, and draft path (when present).
 *
 * Backlog stubs nest at variable depth —
 * `backlog/{state}/[{cohort}/[{subcohort}/]]{slug}/` — so a slug → stub lookup is
 * a depth-aware walk across both state trees. This primitive gives deterministic
 * call sites (draft-presence, `--plan` sufficiency / disambiguation) a real
 * resolver instead of agent-globbing the nested dirs.
 *
 * Deliberately backlog-stub-scoped: it carries directory/draft facts only, never
 * lifecycle state. The lifecycle index ({@link ./lifecycle-index.ts}) remains the
 * authority for phase/location; a later canonical `slug → artifact` resolver
 * absorbs and extends this one.
 *
 * @module
 */

import { readdir } from "node:fs/promises";
import { join } from "node:path";

/** `meta-<slug>.md` filename shape; capture group 1 is the canonical slug. */
const META_FILE_RE = /^meta-(.+)\.md$/;

/** The backlog state-dirs a stub may live under, in resolution precedence order. */
export type BacklogStateDir = "planned" | "provisional";
const STATE_DIRS: readonly BacklogStateDir[] = ["planned", "provisional"];

/** A resolved backlog stub — its location and companion artifact paths. */
export interface BacklogStub {
  /** Canonical WU-name slug, from the `meta-<slug>.md` filename. */
  slug: string;
  /** Absolute path to the stub's directory (holds the meta and any draft). */
  dir: string;
  /** Which backlog state-dir the stub lives under. */
  stateDir: BacklogStateDir;
  /** Absolute path to the stub's `meta-<slug>.md`. */
  metaPath: string;
  /** Absolute path to the stub's `draft-<slug>.md`, or `null` when absent. */
  draftPath: string | null;
}

/**
 * Recursively collect every stub under one backlog state-dir. A missing or
 * unreadable directory yields none — backlog state-dirs are optional. Cohort
 * docs (`cohort-*.md`) and other non-`meta-` files fall away naturally; the
 * sibling `draft-<slug>.md` is resolved from the same directory listing.
 */
async function collectStubs(root: string, stateDir: BacklogStateDir): Promise<BacklogStub[]> {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }

  const fileNames = new Set(entries.filter((e) => e.isFile()).map((e) => e.name));
  const out: BacklogStub[] = [];
  for (const entry of entries) {
    const full = join(root, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await collectStubs(full, stateDir)));
      continue;
    }
    const slug = META_FILE_RE.exec(entry.name)?.[1];
    if (slug === undefined) continue;
    const draftName = `draft-${slug}.md`;
    out.push({
      slug,
      dir: root,
      stateDir,
      metaPath: full,
      draftPath: fileNames.has(draftName) ? join(root, draftName) : null,
    });
  }
  return out;
}

/**
 * Resolve a backlog stub by slug, searching `planned` then `provisional`.
 *
 * @param cwd - Repository root (the directory containing `.arc/`).
 * @param slug - The WU-name slug to resolve.
 * @returns The first matching stub, or `null` when no stub matches in either
 *   state-dir (or the slug is blank).
 */
export async function resolveBacklogStub(cwd: string, slug: string): Promise<BacklogStub | null> {
  const target = slug.trim();
  if (!target) return null;
  for (const stateDir of STATE_DIRS) {
    const stubs = await collectStubs(join(cwd, ".arc", "backlog", stateDir), stateDir);
    const match = stubs.find((s) => s.slug === target);
    if (match) return match;
  }
  return null;
}

/**
 * List every backlog stub across both state-dirs — the disambiguation surface a
 * bare `--plan` (no slug) presents.
 *
 * @param cwd - Repository root (the directory containing `.arc/`).
 * @returns Every stub found under `planned` and `provisional`.
 */
export async function listBacklogStubs(cwd: string): Promise<BacklogStub[]> {
  const out: BacklogStub[] = [];
  for (const stateDir of STATE_DIRS) {
    out.push(...(await collectStubs(join(cwd, ".arc", "backlog", stateDir), stateDir)));
  }
  return out;
}
