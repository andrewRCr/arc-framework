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

/** Exact fixed-set resolution for a grooming claim. */
export type GroomStubSetResult =
  | { kind: "resolved"; anchor: BacklogStub; members: BacklogStub[] }
  | { kind: "refused"; reason: string };

/**
 * Recursively collect every stub under one backlog state-dir. A missing
 * directory yields none — backlog state-dirs are optional. Cohort docs
 * (`cohort-*.md`) and other non-`meta-` files fall away naturally; the sibling
 * `draft-<slug>.md` is resolved from the same directory listing.
 */
async function collectStubs(root: string, stateDir: BacklogStateDir): Promise<BacklogStub[]> {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (err) {
    // Only an absent state-dir yields none — backlog state-dirs are optional;
    // real errors (EACCES, etc.) must fail fast rather than masking a problem.
    const code =
      typeof err === "object" && err !== null && "code" in err
        ? String((err as { code?: unknown }).code)
        : undefined;
    if (code !== "ENOENT") throw err;
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
 * Resolve a backlog stub by slug, searching `planned` then `provisional` (that
 * precedence resolves a slug present in both — `planned` wins).
 *
 * @param cwd - Repository root (the directory containing `.arc/`).
 * @param slug - The WU-name slug to resolve.
 * @returns The unique matching stub, or `null` when no stub matches in either
 *   state-dir (or the slug is blank).
 * @throws If a slug matches more than one stub within a single state-dir — a
 *   malformed backlog (slugs must be unique), surfaced rather than resolved
 *   arbitrarily by traversal order.
 */
export async function resolveBacklogStub(cwd: string, slug: string): Promise<BacklogStub | null> {
  const target = slug.trim();
  if (!target) return null;
  for (const stateDir of STATE_DIRS) {
    const stubs = await collectStubs(join(cwd, ".arc", "backlog", stateDir), stateDir);
    const matches = stubs.filter((s) => s.slug === target);
    if (matches.length > 1) {
      throw new Error(
        `Ambiguous backlog stub "${target}" — ${matches.length} matches under ` +
          `backlog/${stateDir}/ (${matches.map((m) => m.dir).join(", ")}). ` +
          `Stub slugs must be unique within a state-dir.`,
      );
    }
    const [match] = matches;
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

/** Resolve a unique, branchless backlog-only fixed set without precedence. */
export async function resolveGroomStubSet(
  cwd: string,
  anchorSlug: string,
  included: readonly string[],
): Promise<GroomStubSetResult> {
  const requested = [anchorSlug, ...included].map((value) => value.trim());
  if (requested.some((value) => value === "")) return { kind: "refused", reason: "Groom members must be non-empty" };
  if (new Set(requested).size !== requested.length) {
    return { kind: "refused", reason: "Groom members must not repeat" };
  }
  const [planned, provisional, active] = await Promise.all([
    collectStubs(join(cwd, ".arc", "backlog", "planned"), "planned"),
    collectStubs(join(cwd, ".arc", "backlog", "provisional"), "provisional"),
    collectActiveSlugs(join(cwd, ".arc", "active")),
  ]);
  const all = [...planned, ...provisional];
  const resolved: BacklogStub[] = [];
  for (const slug of requested) {
    if (active.has(slug)) return { kind: "refused", reason: `Groom member '${slug}' is already active` };
    const matches = all.filter((stub) => stub.slug === slug);
    if (matches.length === 0) return { kind: "refused", reason: `Groom member '${slug}' is absent` };
    if (matches.length !== 1) {
      return { kind: "refused", reason: `Groom member '${slug}' is ambiguous across backlog states` };
    }
    const match = matches[0];
    if (match === undefined) return { kind: "refused", reason: `Groom member '${slug}' is absent` };
    resolved.push(match);
  }
  const anchor = resolved[0];
  if (anchor === undefined) return { kind: "refused", reason: "A grooming anchor is required" };
  return {
    kind: "resolved",
    anchor,
    members: [...resolved].sort((left, right) => Buffer.compare(Buffer.from(left.slug), Buffer.from(right.slug))),
  };
}

async function collectActiveSlugs(root: string): Promise<Set<string>> {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code)
      : undefined;
    if (code === "ENOENT") return new Set();
    throw error;
  }
  return new Set(entries.flatMap((entry) => {
    if (!entry.isFile()) return [];
    const slug = META_FILE_RE.exec(entry.name)?.[1];
    return slug === undefined ? [] : [slug];
  }));
}
