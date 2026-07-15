/**
 * Worktree roster — enumerates `git worktree list` and resolves each
 * worktree's per-checkout WU meta file into a structured entry.
 *
 * The result is one dataset describing every branched worktree: those
 * with a meta file (WU worktrees) and those without (admin / main
 * checkouts). Callers filter on `metaFilePath` to select between views.
 * Detached-HEAD worktrees are excluded — no branch identity to act on.
 *
 * @module
 */

import { validateState, type WorkUnitState } from "../../commands/active/types.js";
import { parseIdentifierList, parseMetaRecord, type MetaRecord } from "../active/meta-reader.js";

import type { GitExec } from "./exec.js";

/**
 * Roster-entry state — codified `WorkUnitState` plus an `"unknown"`
 * sentinel for meta files whose `**State:**` value falls outside the
 * recognized set. Preserves worktree-roster's degraded-tuple semantic
 * (the roster surfaces every branched worktree, including ones with
 * malformed or unrecognized State).
 */
export type WorktreeRosterState = WorkUnitState | "unknown";

/**
 * One worktree-roster entry. `branch` is always populated — detached-HEAD
 * worktrees are excluded from the result entirely. Meta-derived fields
 * (`identity`, `metaFilePath`, `state`, `cohort`, `class`, `priority`,
 * `dependsOn`) are absent when no meta file resolves for the worktree.
 */
export interface WorktreeRosterEntry {
  worktreePath: string;
  branch: string;
  identity?: string;
  metaFilePath?: string;
  state?: WorktreeRosterState;
  cohort?: string;
  class?: string;
  priority?: string;
  dependsOn?: readonly string[];
}

/**
 * Filesystem adapter — injected for unit testability. Production callers
 * pass `node:fs/promises` bindings; tests pass in-memory stubs.
 */
export interface WorktreeRosterFs {
  readdir(path: string): Promise<string[]>;
  readFile(path: string): Promise<string>;
}

export interface WorktreeRosterResult {
  entries: WorktreeRosterEntry[];
  warnings: string[];
}

/** Registered worktree topology without meta or lifecycle resolution. */
export interface RegisteredWorktree {
  /** Filesystem root registered with Git. */
  path: string;
  /** Exact commit currently checked out. */
  head: string;
  /** Local branch name, or `null` for a detached worktree. */
  branch: string | null;
  /** Whether Git reports the worktree at detached HEAD. */
  detached: boolean;
  /** Whether this is Git's primary worktree (the first porcelain stanza). */
  primary: boolean;
}

/** Result of reading registered worktree topology. */
export type RegisteredWorktreeScanResult =
  | { ok: true; worktrees: RegisteredWorktree[] }
  | { ok: false; message: string };

export interface RunWorktreeRosterOptions {
  exec: GitExec;
  fs: WorktreeRosterFs;
}

export async function runWorktreeRoster(
  options: RunWorktreeRosterOptions,
): Promise<WorktreeRosterResult> {
  const { exec, fs } = options;
  const worktrees = parseWorktreeList(await exec("git", ["worktree", "list", "--porcelain"]));
  const branched = worktrees.filter(
    (wt): wt is RawWorktree & { branch: string } => wt.branch !== null,
  );

  const resolutions = await Promise.all(branched.map((wt) => resolveEntry(fs, wt)));
  const entries = resolutions.map((r) => r.entry);
  const warnings = resolutions.flatMap((r) => r.warnings);

  // Empty when no worktree's active/ contains any meta files — distinct
  // from the "metas exist but failed branch-match" case, which surfaces
  // degraded entries + warnings.
  if (!resolutions.some((r) => r.metaFilesPresent)) {
    return { entries: [], warnings };
  }

  return { entries, warnings };
}

/**
 * Identity-filter a roster for session-init's branch-gone / no-WU recovery.
 *
 * Team mode only: drops entries owned by a *different* identity, keeping the
 * current identity's WU worktrees plus every unattributed worktree. Admin,
 * main, and meta-less checkouts carry no `**Owner:**`, so they have no
 * `identity` and always survive — they are the "stranded in main" recovery
 * signal the cascade reads, not someone else's WU. In solo mode, or when no
 * identity is configured, the roster passes through unchanged: a single
 * developer owns everything, so there is nothing to filter against. Warnings
 * always pass through untouched.
 */
export function filterRosterByIdentity(
  roster: WorktreeRosterResult,
  options: { identity: string | null; teamMode: boolean },
): WorktreeRosterResult {
  const { identity, teamMode } = options;
  if (!teamMode || identity === null) return roster;
  return {
    entries: roster.entries.filter(
      (entry) => entry.identity === undefined || entry.identity === identity,
    ),
    warnings: roster.warnings,
  };
}

/**
 * Resolve the primary (main) worktree's absolute path. `git worktree list`
 * always lists the main worktree first, so the first stanza's path is the
 * primary — the base-branch launchpad an errand writes its queue entry into,
 * regardless of which linked worktree the session currently occupies.
 *
 * @param exec - Injectable command executor (local only — no remote).
 * @returns The primary worktree path, or `null` when it can't be resolved.
 */
export async function resolvePrimaryWorktreePath(exec: GitExec): Promise<string | null> {
  try {
    const worktrees = parseWorktreeList(await exec("git", ["worktree", "list", "--porcelain"]));
    return worktrees[0]?.path ?? null;
  } catch {
    return null;
  }
}

/**
 * Map each branched worktree to its local filesystem path, keyed by branch.
 *
 * One `git worktree list --porcelain` read, no meta resolution — the cheap
 * branch→path lookup the in-flight oracle uses to tell a locally-checked-out
 * WU from a remote-only (materializable) one. Detached-HEAD worktrees carry no
 * branch and are omitted; a read failure degrades to an empty map.
 *
 * @param exec - Injectable command executor (local only — no remote).
 * @returns Branch → worktree path for every branched worktree.
 */
export async function resolveWorktreePathsByBranch(exec: GitExec): Promise<Map<string, string>> {
  return (await resolveWorktreePathsByBranchResult(exec)).paths;
}

/** Result-bearing branch→worktree path lookup for callers that surface degraded reads. */
export interface WorktreePathsByBranchResult {
  ok: boolean;
  paths: Map<string, string>;
}

/**
 * Map each branched worktree to its local filesystem path, preserving whether
 * the `git worktree list` read succeeded.
 *
 * @param exec - Injectable command executor (local only — no remote).
 * @returns The branch map plus an `ok` bit for warning/marking consumers.
 */
export async function resolveWorktreePathsByBranchResult(
  exec: GitExec,
): Promise<WorktreePathsByBranchResult> {
  let worktrees: RawWorktree[];
  try {
    worktrees = parseWorktreeList(await exec("git", ["worktree", "list", "--porcelain"]));
  } catch {
    return { ok: false, paths: new Map() };
  }
  const byBranch = new Map<string, string>();
  for (const wt of worktrees) {
    if (wt.branch !== null) byBranch.set(wt.branch, wt.path);
  }
  return { ok: true, paths: byBranch };
}

/**
 * Read Git's registered worktree topology without resolving managed metadata.
 *
 * @param exec - Injectable command executor (local only — no remote)
 * @returns A bounded topology snapshot or an explicit read/parse failure
 */
export async function scanRegisteredWorktrees(exec: GitExec): Promise<RegisteredWorktreeScanResult> {
  let worktrees: RawWorktree[];
  try {
    worktrees = parseWorktreeList(await exec("git", ["worktree", "list", "--porcelain"]));
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }

  const missingHead = worktrees.find((worktree) => worktree.head === null);
  if (missingHead !== undefined) {
    return { ok: false, message: `worktree listing omitted HEAD for ${missingHead.path}` };
  }

  return {
    ok: true,
    worktrees: worktrees.map((worktree, index) => ({
      path: worktree.path,
      head: worktree.head as string,
      branch: worktree.branch,
      detached: worktree.detached,
      primary: index === 0,
    })),
  };
}

interface EntryResolution {
  entry: WorktreeRosterEntry;
  warnings: string[];
  metaFilesPresent: boolean;
}

interface MetaCandidate {
  name: string;
  metaFilePath: string;
  /** Parsed record — present iff the meta was read and parsed without error. */
  record?: MetaRecord;
  /** Set when the meta file could not be read. */
  readError?: string;
  /** Set when the meta was read but its core-block table is malformed. */
  parseError?: string;
}

async function resolveEntry(
  fs: WorktreeRosterFs,
  wt: { path: string; branch: string },
): Promise<EntryResolution> {
  const degraded: WorktreeRosterEntry = { worktreePath: wt.path, branch: wt.branch };
  const metaFiles = await listMetaFiles(fs, wt.path);
  if (metaFiles.length === 0) {
    return { entry: degraded, warnings: [], metaFilesPresent: false };
  }

  const candidates = await Promise.all(
    metaFiles.map((name) => readCandidate(fs, wt.path, name)),
  );

  // Single-meta: use it unconditionally (no branch verification — the lone
  // file in active/ is treated as authoritative for this worktree).
  if (candidates.length === 1) {
    const c = candidates[0];
    if (c === undefined) return { entry: degraded, warnings: [], metaFilesPresent: true };
    if (c.record === undefined) {
      return {
        entry: degraded,
        warnings: [unreadableWarning(c)],
        metaFilesPresent: true,
      };
    }
    return {
      entry: buildEntry(wt, c.metaFilePath, c.record),
      warnings: [],
      metaFilesPresent: true,
    };
  }

  // Multi-meta: require `**Branch:**` field match against the worktree's
  // branch. Disambiguates active/ states where stale or unrelated meta files
  // coexist with the live one.
  const readable = candidates.filter(
    (c): c is MetaCandidate & { record: MetaRecord } => c.record !== undefined,
  );
  const candidateWarnings = candidates
    .filter((c) => c.record === undefined)
    .map(unreadableWarning);
  const matches = readable.filter((c) => c.record.Branch === wt.branch);
  const activeDir = `${wt.path}/.arc/active`;
  const inventory = metaFiles.join(", ");

  if (matches.length === 0) {
    return {
      entry: degraded,
      warnings: [
        ...candidateWarnings,
        `Multiple meta files in ${activeDir}/ (${inventory}); none match branch ${wt.branch}`,
      ],
      metaFilesPresent: true,
    };
  }

  if (matches.length > 1) {
    const picked = matches[0];
    if (picked === undefined) {
      return { entry: degraded, warnings: [], metaFilesPresent: true };
    }
    const names = matches.map((m) => m.name).join(", ");
    return {
      entry: buildEntry(wt, picked.metaFilePath, picked.record),
      warnings: [
        ...candidateWarnings,
        `Multiple meta files in ${activeDir}/ match branch ${wt.branch}: ${names}; using ${picked.name}`,
      ],
      metaFilesPresent: true,
    };
  }

  const match = matches[0];
  if (match === undefined) return { entry: degraded, warnings: [], metaFilesPresent: true };
  return {
    entry: buildEntry(wt, match.metaFilePath, match.record),
    warnings: candidateWarnings,
    metaFilesPresent: true,
  };
}

async function readCandidate(
  fs: WorktreeRosterFs,
  worktreePath: string,
  name: string,
): Promise<MetaCandidate> {
  const metaFilePath = `${worktreePath}/.arc/active/${name}`;
  let content: string;
  try {
    content = await fs.readFile(metaFilePath);
  } catch (err) {
    return {
      name,
      metaFilePath,
      readError: err instanceof Error ? err.message : String(err),
    };
  }
  try {
    return { name, metaFilePath, record: parseMetaRecord(content) };
  } catch (err) {
    return {
      name,
      metaFilePath,
      parseError: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Warning text for a candidate that could not be read or parsed. */
function unreadableWarning(c: MetaCandidate): string {
  return c.parseError !== undefined
    ? `Malformed meta ${c.metaFilePath}: ${c.parseError}`
    : `Failed to read ${c.metaFilePath}: ${c.readError ?? "unknown error"}`;
}

/**
 * Build a roster entry from a parsed meta record. The shared reader has already
 * stripped inline backticks and read the core-block table, so `Owner` / `State`
 * / `Cohort` arrive in bare form regardless of the meta's rendered shape.
 */
function buildEntry(
  wt: { path: string; branch: string },
  metaFilePath: string,
  record: MetaRecord,
): WorktreeRosterEntry {
  const identity = record.Owner;
  const stateRaw = record.State;
  const cohortRaw = record.Cohort;
  const classRaw = record.Class;
  const priorityRaw = record.Priority;
  const dependsOn = parseIdentifierList(record["Depends On"]);
  return {
    worktreePath: wt.path,
    branch: wt.branch,
    metaFilePath,
    ...(identity !== null ? { identity } : {}),
    ...(stateRaw !== null ? { state: validateState(stateRaw) } : {}),
    ...(cohortRaw !== null && cohortRaw !== "[none]" ? { cohort: cohortRaw } : {}),
    ...(classRaw !== null ? { class: classRaw } : {}),
    ...(priorityRaw !== null && priorityRaw !== "[none]" ? { priority: priorityRaw } : {}),
    ...(dependsOn.length > 0 ? { dependsOn } : {}),
  };
}

interface RawWorktree {
  path: string;
  head: string | null;
  branch: string | null;
  detached: boolean;
}

function parseWorktreeList(result: { stdout: string }): RawWorktree[] {
  const stanzas = result.stdout.split(/\n\n+/u);
  const worktrees: RawWorktree[] = [];
  for (const stanza of stanzas) {
    if (stanza.trim() === "") continue;
    let path: string | null = null;
    let head: string | null = null;
    let branch: string | null = null;
    let detached = false;
    for (const line of stanza.split("\n")) {
      if (line.startsWith("worktree ")) {
        path = line.slice("worktree ".length);
      } else if (line.startsWith("HEAD ")) {
        head = line.slice("HEAD ".length);
      } else if (line.startsWith("branch refs/heads/")) {
        branch = line.slice("branch refs/heads/".length);
      } else if (line === "detached") {
        detached = true;
      }
    }
    if (path !== null) worktrees.push({ path, head, branch, detached });
  }
  return worktrees;
}

async function listMetaFiles(fs: WorktreeRosterFs, worktreePath: string): Promise<string[]> {
  const activeDir = `${worktreePath}/.arc/active`;
  try {
    const entries = await fs.readdir(activeDir);
    return entries
      .filter((name) => name.startsWith("meta-") && name.endsWith(".md"))
      .sort();
  } catch {
    return [];
  }
}
