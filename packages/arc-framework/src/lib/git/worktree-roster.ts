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
 * (`identity`, `metaFilePath`, `state`, `cohort`) are absent when no
 * meta file resolves for the worktree.
 */
export interface WorktreeRosterEntry {
  worktreePath: string;
  branch: string;
  identity?: string;
  metaFilePath?: string;
  state?: WorktreeRosterState;
  cohort?: string;
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

interface EntryResolution {
  entry: WorktreeRosterEntry;
  warnings: string[];
  metaFilesPresent: boolean;
}

interface MetaCandidate {
  name: string;
  metaFilePath: string;
  content?: string;
  readError?: string;
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
    if (c.content === undefined) {
      return {
        entry: degraded,
        warnings: [`Failed to read ${c.metaFilePath}: ${c.readError ?? "unknown error"}`],
        metaFilesPresent: true,
      };
    }
    return {
      entry: buildEntry(wt, c.metaFilePath, c.content),
      warnings: [],
      metaFilesPresent: true,
    };
  }

  // Multi-meta: require `**Branch:**` field match against the worktree's
  // branch. Disambiguates active/ states where stale or unrelated meta files
  // coexist with the live one.
  const readable = candidates.filter(
    (c): c is MetaCandidate & { content: string } => c.content !== undefined,
  );
  const matches = readable.filter(
    (c) => extractField(c.content, "Branch") === wt.branch,
  );
  const activeDir = `${wt.path}/.arc/active`;
  const inventory = metaFiles.join(", ");

  if (matches.length === 0) {
    return {
      entry: degraded,
      warnings: [
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
      entry: buildEntry(wt, picked.metaFilePath, picked.content),
      warnings: [
        `Multiple meta files in ${activeDir}/ match branch ${wt.branch}: ${names}; using ${picked.name}`,
      ],
      metaFilesPresent: true,
    };
  }

  const match = matches[0];
  if (match === undefined) return { entry: degraded, warnings: [], metaFilesPresent: true };
  return {
    entry: buildEntry(wt, match.metaFilePath, match.content),
    warnings: [],
    metaFilesPresent: true,
  };
}

async function readCandidate(
  fs: WorktreeRosterFs,
  worktreePath: string,
  name: string,
): Promise<MetaCandidate> {
  const metaFilePath = `${worktreePath}/.arc/active/${name}`;
  try {
    const content = await fs.readFile(metaFilePath);
    return { name, metaFilePath, content };
  } catch (err) {
    return {
      name,
      metaFilePath,
      readError: err instanceof Error ? err.message : String(err),
    };
  }
}

function buildEntry(
  wt: { path: string; branch: string },
  metaFilePath: string,
  content: string,
): WorktreeRosterEntry {
  const fields = parseMetaFields(content);
  return {
    worktreePath: wt.path,
    branch: wt.branch,
    metaFilePath,
    ...(fields.identity !== undefined ? { identity: fields.identity } : {}),
    ...(fields.state !== undefined ? { state: fields.state } : {}),
    ...(fields.cohort !== undefined ? { cohort: fields.cohort } : {}),
  };
}

interface ParsedMetaFields {
  identity?: string;
  state?: WorktreeRosterState;
  cohort?: string;
}

function parseMetaFields(content: string): ParsedMetaFields {
  const ownerRaw = extractField(content, "Owner");
  const stateRaw = extractField(content, "State");
  const cohortRaw = extractField(content, "Cohort");
  return {
    ...(ownerRaw !== null ? { identity: ownerRaw } : {}),
    ...(stateRaw !== null ? { state: validateState(stateRaw) } : {}),
    ...(cohortRaw !== null && cohortRaw !== "[none]" ? { cohort: cohortRaw } : {}),
  };
}

function extractField(content: string, label: string): string | null {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^[ \\t>*+-]*\\*\\*${escaped}:\\*\\*[ \\t]*(.*)$`, "m");
  const m = re.exec(content);
  if (!m || m[1] === undefined) return null;
  const raw = m[1].trim();
  if (raw === "") return null;
  return raw;
}

interface RawWorktree {
  path: string;
  branch: string | null;
}

function parseWorktreeList(result: { stdout: string }): RawWorktree[] {
  const stanzas = result.stdout.split(/\n\n+/u);
  const worktrees: RawWorktree[] = [];
  for (const stanza of stanzas) {
    if (stanza.trim() === "") continue;
    let path: string | null = null;
    let branch: string | null = null;
    for (const line of stanza.split("\n")) {
      if (line.startsWith("worktree ")) {
        path = line.slice("worktree ".length);
      } else if (line.startsWith("branch refs/heads/")) {
        branch = line.slice("branch refs/heads/".length);
      }
    }
    if (path !== null) worktrees.push({ path, branch });
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
