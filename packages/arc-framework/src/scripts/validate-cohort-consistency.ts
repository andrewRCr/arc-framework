/**
 * Cohort-consistency validator — pre-commit hook entry point.
 *
 * Given a list of staged file paths, selects the backlog-scoped cohort artifacts
 * — `.arc/backlog/planned/.../meta-*.md` work-unit metas and `.../cohort-*.md`
 * cohort docs — and runs the three-condition cohort-consistency invariant over
 * them: (a) each meta's `**Cohort:**` field path-matches its filed dir; (b) every
 * grouping dir carries a `cohort-<leaf>.md` with a `Purpose` floor; (c) a cohort
 * doc's per-member section slugs are a subset of its derived members. The check
 * doubles as the cohort doc's schema validator (Purpose floor + orphan sections).
 *
 * The supplied path set is the universe — doc presence and membership derive only
 * from the files passed in, so the validator reasons over a staged delta without
 * auditing the live backlog. Non-cohort paths are skipped silently.
 *
 * @module
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  checkCohortConsistency,
  cohortDocLocation,
  type BacklogFile,
} from "../lib/active/cohort-consistency.js";
import { buildLifecycleIndexFromMetas } from "../lib/work-unit/lifecycle-index.js";
import { buildCohortMembership } from "../lib/work-unit/lifecycle-membership.js";
import { runPathListScript } from "./cli-runner.js";

/** Path classifications the validator dispatches on. */
export type PathClassification = "meta" | "cohort-doc" | "other";

/** Aggregate validation outcome. */
export interface ValidationResult {
  pass: boolean;
  diagnostics: string[];
}

/**
 * Lifecycle-complete cohort context resolved from the live tree — membership and
 * cohort-doc presence across every lifecycle state, not just the staged delta.
 * Feeds {@link checkCohortConsistency}'s conditions (b)/(c) so graduated members
 * and unstaged ancestor docs are not mistaken for orphans.
 */
export interface LiveCohortContext {
  liveMembersByDir: Map<string, Set<string>>;
  existingCohortDocDirs: Set<string>;
}

const META_FILENAME_RE = /^meta-(.+)\.md$/;
const COHORT_DOC_FILENAME_RE = /^cohort-.+\.md$/;

const META_PATH = /(?:^|\/)\.arc\/backlog\/planned\/(?:[^/]+\/)*meta-[^/]+\.md$/;
const COHORT_DOC_PATH = /(?:^|\/)\.arc\/backlog\/planned\/(?:[^/]+\/)*cohort-[^/]+\.md$/;

/**
 * Classify a path — `meta` for a backlog work-unit meta, `cohort-doc` for a
 * backlog cohort doc, `other` for everything else (skipped).
 */
export function classifyPath(path: string): PathClassification {
  const posix = path.replace(/\\/g, "/");
  if (META_PATH.test(posix)) return "meta";
  if (COHORT_DOC_PATH.test(posix)) return "cohort-doc";
  return "other";
}

/**
 * Build the live-tree cohort context from a flat artifact set spanning every
 * lifecycle state. `metas` carries every WU `meta-*.md` (across `active/`,
 * `backlog/planned/`, `completed/`) as path+content; `cohortDocPaths` lists every
 * backlog cohort doc. Pure over its inputs — the filesystem walk that gathers
 * them lives in {@link buildLiveCohortContextFromDisk} — so the mapping is
 * unit-testable without a real tree.
 *
 * Membership is the work-unit lifecycle index's cohort projection
 * ({@link buildCohortMembership} over {@link buildLifecycleIndexFromMetas}) — the
 * one membership source, keying on each meta's `**Cohort:**` field value (the
 * position-independent source of truth), so an activated member in flat `active/`
 * or a shipped member under `completed/` still resolves to its cohort. A malformed
 * or unresolvable meta is skipped there, never thrown, preserving best-effort.
 */
export function buildLiveCohortContext(
  metas: BacklogFile[],
  cohortDocPaths: string[],
): LiveCohortContext {
  const liveMembersByDir = buildCohortMembership(buildLifecycleIndexFromMetas(metas));
  const existingCohortDocDirs = new Set<string>();
  for (const path of cohortDocPaths) {
    const location = cohortDocLocation(path);
    if (location !== null) existingCohortDocDirs.add(location.cohortDir);
  }
  return { liveMembersByDir, existingCohortDocDirs };
}

/** Recursively yield every file path under `dir`; a missing dir yields nothing. */
function* walkFiles(dir: string): Generator<string> {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of names) {
    const full = join(dir, name);
    let isDirectory: boolean;
    try {
      isDirectory = statSync(full).isDirectory();
    } catch {
      continue;
    }
    if (isDirectory) yield* walkFiles(full);
    else yield full;
  }
}

/**
 * Walk the live `.arc/` tree under `cwd` — `active/`, `backlog/planned/`, and
 * `completed/` — collecting every WU meta and backlog cohort doc, then build the
 * {@link LiveCohortContext}. Read errors on individual files are skipped: the
 * context is a best-effort augmentation, never a hard gate.
 */
export function buildLiveCohortContextFromDisk(cwd: string): LiveCohortContext {
  const roots = [
    join(cwd, ".arc", "active"),
    join(cwd, ".arc", "backlog", "planned"),
    join(cwd, ".arc", "completed"),
  ];
  const metas: BacklogFile[] = [];
  const cohortDocPaths: string[] = [];
  for (const root of roots) {
    for (const file of walkFiles(root)) {
      const base = basename(file);
      const rel = relative(cwd, file).split(sep).join("/");
      if (META_FILENAME_RE.test(base)) {
        try {
          metas.push({ path: rel, content: readFileSync(file, "utf8") });
        } catch {
          // Skip unreadable meta — best-effort augmentation.
        }
      } else if (COHORT_DOC_FILENAME_RE.test(base)) {
        cohortDocPaths.push(rel);
      }
    }
  }
  return buildLiveCohortContext(metas, cohortDocPaths);
}

/**
 * Validate a set of staged paths. Backlog metas and cohort docs are read and
 * handed to {@link checkCohortConsistency}; `other` paths are skipped silently —
 * the hook may invoke this with a broader set than the cohort scope. When a
 * {@link LiveCohortContext} is supplied, lifecycle-complete membership and
 * cohort-doc presence augment the staged delta so graduated members and unstaged
 * ancestor docs are not flagged as orphans; absent, the check is staged-delta-only.
 */
export function validateFiles(
  paths: string[],
  readFile: (path: string) => string,
  liveContext?: LiveCohortContext,
): ValidationResult {
  const metas: BacklogFile[] = [];
  const cohortDocs: BacklogFile[] = [];
  for (const path of paths) {
    const classification = classifyPath(path);
    if (classification === "other") continue;
    const content = readFile(path);
    if (classification === "meta") metas.push({ path, content });
    else cohortDocs.push({ path, content });
  }
  const diagnostics = checkCohortConsistency({
    metas,
    cohortDocs,
    liveMembersByDir: liveContext?.liveMembersByDir,
    existingCohortDocDirs: liveContext?.existingCohortDocDirs,
  });
  return { pass: diagnostics.length === 0, diagnostics };
}

/**
 * The repo root to walk for live context — the prefix of a staged path before
 * its `.arc/` segment, so the scan roots at the tree the staged files belong to
 * regardless of `process.cwd()`. Relative staged paths (the hook's normal form)
 * carry no prefix and fall back to `process.cwd()`.
 */
export function deriveScanRoot(paths: string[]): string {
  for (const raw of paths) {
    const posix = raw.replace(/\\/g, "/");
    if (posix.startsWith(".arc/")) return process.cwd();
    const marker = posix.indexOf("/.arc/");
    if (marker !== -1) return posix.slice(0, marker);
  }
  return process.cwd();
}

// --- CLI entry ---

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const argvPaths = process.argv.slice(2);
  const liveContext = buildLiveCohortContextFromDisk(deriveScanRoot(argvPaths));
  runPathListScript((paths, readFile) => validateFiles(paths, readFile, liveContext));
}
