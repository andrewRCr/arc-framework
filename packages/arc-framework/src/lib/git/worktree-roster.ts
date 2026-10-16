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

import type { Store } from "../store/contract.js";
import { createStore } from "../store/create.js";
import { createDefaultStorePorts } from "../store/default-ports.js";
import { ParsedMetaRecordSchema } from "../active/meta-schema.js";
import { decodeWorktreeMarkerOwnership, readWorktreeMarkerGeneration } from "./worktree-marker.js";
import { SlugSchema } from "../kernel/index.js";
import { lstat } from "node:fs/promises";

import { validateState } from "../kernel/schema/vocabulary.js";
import { z } from "zod";
import { WorkUnitStateSchema } from "../kernel/index.js";
import { parseMetaRecord } from "../active/meta-reader.js";
import { type ParsedMetaRecord } from "../active/meta-schema.js";

import type { GitExec } from "./exec.js";
import {
  parseGitWorktreePorcelainZ,
  type GitWorktreePorcelainRecord,
} from "./worktree-porcelain.js";

/**
 * Roster-entry state — codified `WorkUnitState` plus an `"unknown"`
 * sentinel for meta files whose `**State:**` value falls outside the
 * recognized set. Preserves worktree-roster's degraded-tuple semantic
 * (the roster surfaces every branched worktree, including ones with
 * malformed or unrecognized State).
 */
export const WorktreeRosterStateSchema = z.union([WorkUnitStateSchema, z.literal("unknown")]);
export type WorktreeRosterState = z.infer<typeof WorktreeRosterStateSchema>;

/**
 * One worktree-roster entry. `branch` is always populated — detached-HEAD
 * worktrees are excluded from the result entirely. Meta-derived fields
 * (`identity`, `metaFilePath`, `state`, `cohort`, `class`, `priority`,
 * `dependsOn`) are absent when no meta file resolves for the worktree.
 */
export const WorktreeRosterEntrySchema = z.strictObject({
  worktreePath: z.string(),
  branch: z.string().optional(),
  workUnit: z.string().optional(),
  identity: z.string().optional(),
  metaFilePath: z.string().optional(),
  state: WorktreeRosterStateSchema.optional(),
  cohort: z.string().optional(),
  class: z.string().optional(),
  priority: z.string().optional(),
  dependsOn: z.array(z.string()).readonly().optional(),
});
export type WorktreeRosterEntry = z.infer<typeof WorktreeRosterEntrySchema>;

/**
 * Filesystem adapter — injected for unit testability. Production callers
 * pass `node:fs/promises` bindings; tests pass in-memory stubs.
 */
export interface WorktreeRosterFs {
  readdir(path: string): Promise<string[]>;
  readFile(path: string): Promise<string>;
}

/** Full emitted roster, including degraded entries and read warnings. */
export const WorktreeRosterResultSchema = z.strictObject({
  entries: z.array(WorktreeRosterEntrySchema),
  warnings: z.array(z.string()),
});
export type WorktreeRosterResult = z.infer<typeof WorktreeRosterResultSchema>;

/** Registered worktree topology without meta or lifecycle resolution. */
export const RegisteredWorktreeSchema = z.strictObject({
  path: z.string(), head: z.string(), branch: z.string().nullable(),
  detached: z.boolean(), primary: z.boolean(), folderPresent: z.boolean(),
  /** Absent when unlocked; null for a bare lock, or its reason. */
  locked: z.string().nullable().optional(),
});
/** Registered topology inferred from its runtime wire contract. */
export type RegisteredWorktree = z.infer<typeof RegisteredWorktreeSchema>;

/** Result of reading registered worktree topology. */
export type RegisteredWorktreeScanResult =
  | { ok: true; worktrees: RegisteredWorktree[] }
  | { ok: false; message: string };

export interface RunWorktreeRosterOptions {
  cwd?: string;
  store?: Store;
  exec: GitExec;
  fs: WorktreeRosterFs;
}

export async function runWorktreeRoster(
  options: RunWorktreeRosterOptions,
): Promise<WorktreeRosterResult> {
  const { exec, fs } = options;
  const worktrees = parseWorktreeList(await exec("git", ["worktree", "list", "--porcelain", "-z"]));
  const store = options.store ?? createStore(createDefaultStorePorts({ checkoutRoot: options.cwd ?? process.cwd(), exec }));
  if (store.capabilities.stateOffBranch) return runStoreRoster(store, worktrees);
  const branched = worktrees.filter(
    (wt): wt is GitWorktreePorcelainRecord & { branch: string } => wt.branch !== null,
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
 * Read and identity-filter a roster without crossing the team-mode identity boundary.
 *
 * When team mode has no resolved identity, the roster is not read at all: there is
 * no safe ownership predicate with which to select another checkout's metadata.
 */
export async function runIdentityScopedWorktreeRoster(
  options: RunWorktreeRosterOptions & { identity: string | null; teamMode: boolean },
): Promise<WorktreeRosterResult> {
  const { identity, teamMode, ...rosterOptions } = options;
  if (teamMode && identity === null) return { entries: [], warnings: [] };
  return filterRosterByIdentity(
    await runWorktreeRoster(rosterOptions),
    { identity, teamMode },
  );
}

/**
 * Identity-filter a roster for session-init's branch-gone / no-WU recovery.
 *
 * Team mode only: drops entries owned by a *different* identity, keeping the
 * current identity's WU worktrees plus every unattributed worktree. Admin,
 * main, and meta-less checkouts carry no `**Owner:**`, so they have no
 * `identity` and always survive — they are the "stranded in main" recovery
 * signal the cascade reads, not someone else's WU. In solo mode the roster
 * passes through unchanged. Callers that may lack an identity in team mode
 * must use {@link runIdentityScopedWorktreeRoster} so the private roster is
 * not read. Warnings always pass through untouched.
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
    const worktrees = parseWorktreeList(await exec("git", ["worktree", "list", "--porcelain", "-z"]));
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
 * @param cwd - Repository root the read runs against. Omitted, the executor's own
 * directory applies, which for the production executor is the process directory.
 * @returns The branch map plus an `ok` bit for warning/marking consumers.
 */
export async function resolveWorktreePathsByBranchResult(
  exec: GitExec,
  cwd?: string,
): Promise<WorktreePathsByBranchResult> {
  let worktrees: GitWorktreePorcelainRecord[];
  try {
    worktrees = parseWorktreeList(await exec(
      "git",
      ["worktree", "list", "--porcelain", "-z"],
      cwd === undefined ? {} : { cwd },
    ));
  } catch {
    return { ok: false, paths: new Map() };
  }
  const byBranch = new Map<string, string>();
  for (const wt of worktrees) {
    if (wt.branch !== null) byBranch.set(wt.branch, wt.path);
  }
  return { ok: true, paths: byBranch };
}

type FolderStat = (path: string) => Promise<unknown>;

/**
 * Read registered topology and observe each registration's physical folder once.
 *
 * Missing paths read absent; other observation failures retain presence.
 * @param exec - Injectable command executor (local only — no remote)
 * @param lstatPath - Folder observation boundary, defaulting to Node lstat
 * @returns A bounded topology snapshot or an explicit read/parse failure
 */
export async function scanRegisteredWorktrees(
  exec: GitExec,
  lstatPath: FolderStat = lstat,
): Promise<RegisteredWorktreeScanResult> {
  let worktrees: GitWorktreePorcelainRecord[];
  try {
    worktrees = parseWorktreeList(await exec("git", ["worktree", "list", "--porcelain", "-z"]));
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }

  const missingHead = worktrees.find((worktree) => worktree.head === null);
  if (missingHead !== undefined) {
    return { ok: false, message: `worktree listing omitted HEAD for ${missingHead.path}` };
  }

  return {
    ok: true,
    worktrees: await Promise.all(worktrees.map(async (worktree, index) => ({
      path: worktree.path,
      head: worktree.head as string,
      branch: worktree.branch,
      detached: worktree.detached,
      primary: index === 0,
      folderPresent: await registeredFolderPresent(worktree.path, lstatPath),
      ...(worktree.locked === undefined ? {} : { locked: worktree.locked }),
    }))),
  };
}

async function registeredFolderPresent(path: string, lstatPath: FolderStat): Promise<boolean> {
  try {
    await lstatPath(path);
    return true;
  } catch (error) {
    if (typeof error !== "object" || error === null || !("code" in error)) return true;
    return error.code !== "ENOENT" && error.code !== "ENOTDIR";
  }
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
  record?: ParsedMetaRecord;
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
    (c): c is MetaCandidate & { record: ParsedMetaRecord } => c.record !== undefined,
  );
  const candidateWarnings = candidates
    .filter((c) => c.record === undefined)
    .map(unreadableWarning);
  const matches = readable.filter((c) => c.record.branch === wt.branch);
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
  record: ParsedMetaRecord,
): WorktreeRosterEntry {
  const { owner: identity, state: stateRaw, cohort: cohortRaw, dependsOn } = record;
  const classRaw = record.workClass === "TBD" ? "[TBD]" : record.workClass;
  const priorityRaw = record.priority === "TBD" ? "[TBD]" : record.priority;
  return {
    worktreePath: wt.path,
    branch: wt.branch,
    metaFilePath,
    ...(identity !== null ? { identity } : {}),
    ...(stateRaw !== null ? { state: validateState(stateRaw) } : {}),
    ...(cohortRaw !== null ? { cohort: cohortRaw } : {}),
    ...(classRaw !== null ? { class: classRaw } : {}),
    ...(priorityRaw !== null ? { priority: priorityRaw } : {}),
    ...(dependsOn.length > 0 ? { dependsOn } : {}),
  };
}

function parseWorktreeList(result: { stdout: string }): GitWorktreePorcelainRecord[] {
  return parseGitWorktreePorcelainZ(result.stdout);
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

async function runStoreRoster(store: Store, worktrees: readonly GitWorktreePorcelainRecord[]): Promise<WorktreeRosterResult> {
  const warnings: string[] = [];
  const entries = await Promise.all(worktrees.map(async worktree => {
    const entry: WorktreeRosterEntry = { worktreePath: worktree.path,
      ...(worktree.branch === null ? {} : { branch: worktree.branch }) };
    try {
      const marker = await readWorktreeMarkerGeneration(worktree.path);
      if (marker.kind === "absent") return entry;
      if (marker.kind === "malformed") { warnings.push(`${marker.path}: ${marker.message}`); return entry; }
      const ownership = decodeWorktreeMarkerOwnership(marker.marker);
      if (ownership.kind !== "current" || ownership.subject.kind !== "work-unit") return entry;
      entry.workUnit = ownership.subject.name;
      const lookup = await store.lookup({ kind: "claim", claim: { kind: "work-unit", slug: SlugSchema.parse(entry.workUnit) } });
      if (lookup.status === "refused") { warnings.push(`${worktree.path}: ${lookup.refusal.condition}`); return entry; }
      const read = await store.read({ reference: lookup.result.reference });
      if (read.status === "refused") { warnings.push(`${worktree.path}: ${read.refusal.condition}`); return entry; }
      Object.assign(entry, storeRosterFields(ParsedMetaRecordSchema.parse(read.result.fields)));
    } catch (error) { warnings.push(`${worktree.path}: ${error instanceof Error ? error.message : String(error)}`); }
    return entry;
  }));
  return { entries, warnings };
}

function storeRosterFields(fields: ParsedMetaRecord): Partial<WorktreeRosterEntry> {
  return {
    ...(fields.owner === null ? {} : { identity: fields.owner }),
    ...(fields.state === null ? {} : { state: validateState(fields.state) }),
    ...(fields.cohort === null ? {} : { cohort: fields.cohort }),
    ...(fields.workClass === null ? {} : { class: fields.workClass }),
    ...(fields.priority === null ? {} : { priority: fields.priority }),
    ...(fields.dependsOn.length === 0 ? {} : { dependsOn: fields.dependsOn }),
  };
}
