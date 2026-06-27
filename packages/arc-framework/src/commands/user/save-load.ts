import { rm } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";

import {
  deserialize, getCurrentBranch, isSafeManifestPath, serialize, shortHash, type SyncManifest,
} from "../../lib/git/index.js";
import { ensureDir } from "../../lib/template/index.js";
import {
  appendRemovalTombstones,
  classifyOrphans,
  classifyUserSyncPath,
  getUserInternalDir,
  mergeCrossWuFile,
  planRetiredSubdirReconcile,
  projectManifest,
  subdirsFromPaths,
  writeLocalSyncState,
  wuNameOfPath,
  type MergeNote,
  type OrphanClassification,
} from "../../lib/user-sync/index.js";
import { readShippedWorkUnitsFromRef } from "../../lib/work-unit/completed-index.js";
import { readConfigSettings } from "../../lib/config/status-reader.js";
import type { GitExec } from "../../lib/git/exec.js";
import { computeDriftingSubdirs } from "./drift.js";
import {
  listChangedNotePaths,
  notePathToCommit,
  readNoteContentAtHistoryCommit,
  readNotesRefHistory,
  readRecentUserNotes,
  type RecentNote,
} from "../../lib/user-sync/notes-ref.js";
import { removeStaleUserWuSubdir } from "./open.js";
import { notesRef } from "./shared.js";
import {
  BACKUP_FILENAME,
  UserLoadVerificationError,
  UserSaveError,
  UserSaveVerificationError,
  type UserLoadOutcome,
  type NearestNoteSearch,
  type UserIOContext,
  type UserLoadOptions,
  type UserSaveOptions,
  type UserSaveResult,
  type LoadMessage,
} from "./types.js";

const BACKUP_TIMESTAMPED_PREFIX = ".pre-load-backup-";
const BACKUP_TIMESTAMPED_SUFFIX = ".json";
const BACKUP_RETENTION = 3;

/** Default ancestor-walk cap. Aligns with common shallow-clone depth conventions. */
export const DEFAULT_MAX_ANCESTOR_WALK = 1000;

/**
 * Save the user directory to user notes on HEAD.
 *
 * Serializes eligible files from `user/{identity}/` and stores the JSON
 * manifest as a git note on the current HEAD commit.
 *
 * @param options - Save options
 * @returns Save result with file count and warnings
 */
export async function runUserSave(
  options: UserSaveOptions,
): Promise<UserSaveResult> {
  const { cwd, io, identity } = options;
  const userDir = join(cwd, ".arc", "user", identity);

  const { stdout: commit } = await io.exec("git", ["rev-parse", "HEAD"]);
  const result = await serialize(userDir, io.readDir, io.readFile);

  if (Object.keys(result.manifest.files).length === 0) {
    throw new UserSaveError("No eligible files found in user directory to save.");
  }

  const recentNotes = await readRecentUserNotes(io.exec, identity);
  applyRemovalTombstones(result.manifest, recentNotes, new Date().toISOString());

  const json = JSON.stringify(result.manifest);
  await io.writeNote(notesRef(identity), json, commit);
  await verifySavedNote(io, identity, commit, result.manifest);
  const projectedSave = projectManifest(result.manifest);
  await writeLocalSyncState(
    cwd, io, identity, hashSyncManifest(projectedSave), commit, "save", commit,
    Object.keys(projectedSave.files),
  );

  return {
    identity,
    commit: await shortHash(io.exec, commit),
    fileCount: Object.keys(result.manifest.files).length,
    warnings: result.warnings,
  };
}

/**
 * Load the user directory from user notes.
 *
 * Walks the user notes ref's own history looking for the newest note
 * attachment. This finds notes even when their annotated commits are outside
 * current HEAD ancestry.
 *
 * @param options - Load options
 * @returns Load result, or null if no note found
 */
export async function runUserLoad(
  options: UserLoadOptions,
): Promise<UserLoadOutcome | null> {
  const { cwd, io, identity } = options;
  const userDir = join(cwd, ".arc", "user", identity);
  const search = await findNearestUserNote(options);
  const recentNotes = await readRecentUserNotes(io.exec, identity);

  // Per-WU subdir restores from the note carrying the current WU; cross-WU flat
  // files merge across the recent-note window, so a brand-new WU still loads
  // shared context before its own note exists. There is nothing to load only
  // when both sources are empty.
  if (!search.note && recentNotes.length === 0) {
    if (search.capped) {
      return {
        kind: "walk-exhausted",
        walked: search.walked,
        maxWalk: search.maxWalk,
      };
    }
    return null;
  }

  let version: SyncManifest["version"] = 2;
  let sourceCommit = recentNotes[0]?.historyCommit ?? "";
  let fromAncestor = false;
  const perWuFiles: Record<string, string> = {};

  if (search.note) {
    const manifest = await parseResolvedNoteManifest(search.note.content, search.note.commit, io);
    version = manifest.version;
    sourceCommit = search.note.commit;
    fromAncestor = search.note.fromAncestor;
    for (const [path, content] of Object.entries(filterManifestForWu(manifest, options.currentWuName).files)) {
      if (classifyUserSyncPath(path) !== "cross-wu") perWuFiles[path] = content;
    }
  }

  const { files: crossWuFiles, warnings: mergeWarnings } = mergeCrossWuFromNotes(recentNotes);
  const loadManifest: SyncManifest = { version, files: { ...perWuFiles, ...crossWuFiles } };

  let notices: LoadMessage[] = [];
  let cleanups: LoadMessage[] = [];
  try {
    const localResult = await serialize(userDir, io.readDir, io.readFile);
    const localFiles = localResult.manifest.files;

    if (Object.keys(localFiles).length > 0) {
      const backupFilename = createTimestampedBackupFilename();
      const internalDir = getUserInternalDir(cwd, identity);
      await ensureDir(internalDir, io.mkdir);
      await io.writeFile(
        join(internalDir, backupFilename),
        JSON.stringify(localResult.manifest),
      );
      await pruneTimestampedBackups(internalDir, io.readDir);

      // Retired-subdir reconcile: a per-WU subdir that has shipped and is no
      // longer carried in the recent-notes window is removed. Its files were
      // just captured in the pre-load backup, so the removal is recoverable.
      // Runs before the stale-file scan so a reconciled subdir's files aren't
      // also reported as "preserved".
      const reconciled = await reconcileRetiredSubdirs({ cwd, identity, exec: io.exec, localFiles, recentNotes });

      notices = classifyOrphans({
        localFiles,
        manifestFiles: loadManifest.files,
        reconciledSubdirs: reconciled,
        currentWuName: options.currentWuName,
      }).map((classification) => ({
        level: "notice",
        text: renderOrphanNotice(classification, backupFilename),
      }));
      cleanups = [...reconciled].map((subdir) => ({
        level: "cleanup",
        text: `Retired WU subdir "${subdir}" (shipped) — removed; backed up to .internal/${backupFilename}`,
      }));
    }
  } catch {
    // User dir doesn't exist yet — nothing to back up, skip gracefully
  }

  await ensureDir(userDir, io.mkdir);
  await deserialize(userDir, loadManifest, io.writeFile, io.mkdir);
  await verifyMaterializedUserDir(userDir, io, sourceCommit, loadManifest);
  const projectedLoad = projectManifest(loadManifest);
  await writeLocalSyncState(
    cwd, io, identity, hashSyncManifest(projectedLoad), sourceCommit, "load", sourceCommit,
    Object.keys(projectedLoad.files),
  );

  return {
    kind: "loaded",
    identity,
    commit: await shortHash(io.exec, sourceCommit),
    fileCount: Object.keys(loadManifest.files).length,
    fromAncestor,
    ancestorDistance: search.note?.ancestorDistance ?? 0,
    noteHistoryDistance: search.note?.noteHistoryDistance ?? 0,
    reachableFromHead: search.note?.reachableFromHead ?? false,
    currentBranch: search.note?.reachableFromHead === false ? await getCurrentBranch(io.exec) : null,
    messages: [
      ...cleanups,
      ...notices,
      ...mergeWarnings.map((text): LoadMessage => ({ level: "warning", text })),
    ],
  };
}

/**
 * Parse and validate a resolved note's serialized manifest, throwing a
 * diagnostic on corrupt JSON or an unsupported version.
 */
async function parseResolvedNoteManifest(
  noteContent: string,
  commit: string,
  io: UserIOContext,
): Promise<SyncManifest> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(noteContent) as unknown;
  } catch {
    throw new Error(
      `Corrupt git note on ${await shortHash(io.exec, commit)} — JSON parse failed. ` +
      "The note may have been manually edited or partially written. " +
      "Try a different ancestor with `arc user load`, or `arc user save` to overwrite.",
    );
  }

  const raw = parsed as Record<string, unknown>;
  if (
    (raw.version !== 1 && raw.version !== 2) ||
    typeof raw.files !== "object" ||
    raw.files === null
  ) {
    throw new Error(
      `Unsupported note format on ${await shortHash(io.exec, commit)} ` +
      `(version ${JSON.stringify(raw.version ?? "unknown")}). ` +
      "This note may have been created by a newer version of ARC. " +
      "Update the CLI and try again, or `arc user save` to overwrite.",
    );
  }
  return parsed as SyncManifest;
}

/**
 * Merge cross-WU flat files across the recent-note window. Each cross-WU file
 * present in any note is merged from its content in every note that carries it
 * (recency order preserved), so entries authored in parallel worktrees survive
 * rather than being clobbered by the most-recent note.
 */
function mergeCrossWuFromNotes(
  recentNotes: readonly RecentNote[],
): { files: Record<string, string>; warnings: string[] } {
  const perNoteFiles = recentNotes.map((note) => parseManifestFiles(note.content) ?? {});

  const crossWuNames: string[] = [];
  const seen = new Set<string>();
  for (const noteFiles of perNoteFiles) {
    for (const path of Object.keys(noteFiles)) {
      if (!seen.has(path) && classifyUserSyncPath(path) === "cross-wu") {
        seen.add(path);
        crossWuNames.push(path);
      }
    }
  }

  const files: Record<string, string> = {};
  const warnings: string[] = [];
  for (const name of crossWuNames) {
    const notesForFile: MergeNote[] = [];
    for (const noteFiles of perNoteFiles) {
      const content = noteFiles[name];
      if (typeof content === "string") notesForFile.push({ content });
    }
    const merged = mergeCrossWuFile(name, notesForFile);
    files[name] = merged.content;
    warnings.push(...merged.malformed);
  }
  return { files, warnings };
}

/**
 * Stamp removal tombstones into the cross-WU files of a to-be-saved manifest.
 *
 * Each cross-WU flat file is diffed against its prior merged state across the
 * recent-note window: an entry present before and absent now earns a
 * `## Removed:` marker (see {@link appendRemovalTombstones}). Per-WU subdir
 * files and files absent from the window are left untouched. Mutates the
 * manifest in place — the augmented content is what gets noted and verified.
 */
function applyRemovalTombstones(
  manifest: SyncManifest,
  recentNotes: readonly RecentNote[],
  now: string,
): void {
  const perNoteFiles = recentNotes.map((note) => parseManifestFiles(note.content) ?? {});
  for (const [name, content] of Object.entries(manifest.files)) {
    if (classifyUserSyncPath(name) !== "cross-wu") continue;

    const priorNotes: MergeNote[] = [];
    for (const noteFiles of perNoteFiles) {
      const prior = noteFiles[name];
      if (typeof prior === "string") priorNotes.push({ content: prior });
    }
    if (priorNotes.length === 0) continue;

    manifest.files[name] = appendRemovalTombstones(name, content, priorNotes, now);
  }
}

async function verifyMaterializedUserDir(
  userDir: string,
  io: UserIOContext,
  commit: string,
  manifest: SyncManifest,
): Promise<void> {
  const shortCommit = await shortHash(io.exec, commit);
  const expectedFiles: Record<string, string> = {};
  const readbackFiles: Record<string, string> = {};

  for (const [name, content] of Object.entries(manifest.files)) {
    if (!isSafeManifestPath(name)) continue;
    expectedFiles[name] = content;

    let actual: string;
    try {
      actual = await io.readFile(`${userDir}/${name}`);
    } catch {
      throw new UserLoadVerificationError(
        `Load verification failed for note ${shortCommit}: materialized file "${name}" was missing or unreadable.`,
      );
    }
    readbackFiles[name] = actual;
  }

  const expectedHash = hashSyncManifest({ version: manifest.version, files: expectedFiles });
  const actualHash = hashSyncManifest({ version: manifest.version, files: readbackFiles });
  if (expectedHash !== actualHash) {
    throw new UserLoadVerificationError(
      `Load verification failed for note ${shortCommit}: materialized file content did not match the loaded manifest.`,
    );
  }
}

async function verifySavedNote(
  io: UserIOContext,
  identity: string,
  commit: string,
  expectedManifest: SyncManifest,
): Promise<void> {
  const ref = notesRef(identity);
  const readback = await io.readNote(ref, commit);
  const shortCommit = await shortHash(io.exec, commit);

  if (readback === null) {
    throw new UserSaveVerificationError(
      `Save verification failed on ${shortCommit}: git note readback was missing.`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readback);
  } catch {
    throw new UserSaveVerificationError(
      `Save verification failed on ${shortCommit}: git note readback was not valid JSON.`,
    );
  }

  if (!isSyncManifest(parsed)) {
    throw new UserSaveVerificationError(
      `Save verification failed on ${shortCommit}: git note readback had an unsupported manifest shape.`,
    );
  }

  const expectedHash = hashSyncManifest(expectedManifest);
  const actualHash = hashSyncManifest(parsed);
  if (actualHash !== expectedHash) {
    throw new UserSaveVerificationError(
      `Save verification failed on ${shortCommit}: git note readback did not match the saved manifest.`,
    );
  }
}

export function hashSyncManifest(
  manifest: SyncManifest,
): string {
  const normalized = normalizeManifest(manifest);
  return createHash("sha256")
    .update(JSON.stringify(normalized))
    .digest("hex");
}

function isSyncManifest(value: unknown): value is SyncManifest {
  if (typeof value !== "object" || value === null) return false;

  const record = value as Record<string, unknown>;
  if (record.version !== 1 && record.version !== 2) return false;
  if (
    typeof record.files !== "object" ||
    record.files === null ||
    Array.isArray(record.files)
  ) {
    return false;
  }

  return Object.values(record.files as Record<string, unknown>)
    .every((content) => typeof content === "string");
}

function normalizeManifest(
  manifest: SyncManifest,
): SyncManifest {
  const sortedEntries = Object.entries(manifest.files)
    .sort(([a], [b]) => a.localeCompare(b));
  return {
    version: manifest.version,
    files: Object.fromEntries(sortedEntries),
  };
}

/** Walk the user notes ref history (up to the configured cap) looking for a note. */
export async function findNearestUserNote(
  options: UserLoadOptions,
): Promise<NearestNoteSearch> {
  const { io, identity, currentWuName } = options;
  const maxWalk = options.maxAncestorWalk ?? DEFAULT_MAX_ANCESTOR_WALK;
  const ref = notesRef(identity);
  const fullRef = `refs/notes/${ref}`;

  let headHash: string;
  try {
    const { stdout } = await io.exec("git", ["rev-parse", "HEAD"]);
    headHash = stdout.trim();
  } catch {
    headHash = "";
  }

  const notesHistory = await readNotesRefHistory(io.exec, fullRef, maxWalk);
  if (notesHistory.length === 0) {
    return { note: null, walked: 0, maxWalk, capped: false };
  }

  for (const [index, noteHistoryCommit] of notesHistory.entries()) {
    const changedPaths = await listChangedNotePaths(io.exec, noteHistoryCommit);
    for (const path of changedPaths) {
      const annotatedCommit = notePathToCommit(path);
      if (!annotatedCommit) continue;

      const content = await readNoteContentAtHistoryCommit(io.exec, noteHistoryCommit, path);
      if (!content) continue;

      // Per-WU isolation: when a current WU is in play, skip notes that don't
      // carry its subdir so the walk resolves to that WU's own save, not an
      // older sibling's. Absent a WU (existing non-load callers), take the
      // first readable note as before.
      if (currentWuName !== undefined && !noteManifestContainsWu(content, currentWuName)) {
        continue;
      }

      const reachableFromHead = headHash.length > 0
        ? await isCommitReachableFromHead(io, annotatedCommit)
        : false;
      const ancestorDistance = reachableFromHead
        ? await countCommitsSince(io, annotatedCommit)
        : 0;

      return {
        note: {
          content,
          commit: annotatedCommit,
          reachableFromHead,
          fromAncestor: reachableFromHead && annotatedCommit !== headHash,
          ancestorDistance,
          noteHistoryDistance: index,
        },
        walked: index + 1,
        maxWalk,
        capped: false,
      };
    }
  }

  return {
    note: null,
    walked: notesHistory.length,
    maxWalk,
    capped: notesHistory.length >= maxWalk,
  };
}

/**
 * Best-effort extraction of a manifest's `files` map. Returns `null` when the
 * content isn't valid JSON or lacks a `files` object — callers treat that as
 * "not a usable manifest" without throwing (the note walk continues past it).
 */
function parseManifestFiles(noteContent: string): Record<string, unknown> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(noteContent);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const files = (parsed as { files?: unknown }).files;
  if (typeof files !== "object" || files === null) return null;
  return files as Record<string, unknown>;
}

/** Whether a note's serialized manifest carries any file under the given WU's subdir. */
function noteManifestContainsWu(noteContent: string, wuName: string): boolean {
  const files = parseManifestFiles(noteContent);
  if (!files) return false;
  return Object.keys(files).some((path) => wuNameOfPath(path) === wuName);
}

/**
 * Resolve which present per-WU subdirs are reconcilable: those whose WU has
 * shipped (read from the `origin/<base>` `completed/` tree — the canonical,
 * branch-independent oracle) and which carry no unpushed local drift. Detection
 * is {@link planRetiredSubdirReconcile}; the drift gate is
 * {@link computeDriftingSubdirs} over the disk manifest and the recent-notes
 * window. Pure planning — performs no removal, so a caller can gate its backup
 * on a non-empty result.
 *
 * @returns The reconcilable subdir names, in `localFiles` subdir order.
 */
async function resolveReconcilableSubdirs(params: {
  cwd: string;
  exec: GitExec;
  localFiles: Record<string, string>;
  recentNotes: RecentNote[];
}): Promise<string[]> {
  const localSubdirs = subdirsFromPaths(Object.keys(params.localFiles));
  if (localSubdirs.length === 0) return [];

  const { settings } = await readConfigSettings(params.cwd);
  const shipped = await readShippedWorkUnitsFromRef(params.exec, `origin/${settings["branch.base"]}`);
  const driftingSubdirs = computeDriftingSubdirs({
    localSubdirs,
    diskManifest: { version: 2, files: params.localFiles },
    recentNotes: params.recentNotes,
  });
  return planRetiredSubdirReconcile({ localSubdirs, shipped, driftingSubdirs }).reconcile;
}

/** Recursively remove each reconciled subdir; returns the removed set. */
async function removeReconciledSubdirs(params: {
  cwd: string;
  identity: string;
  reconcile: readonly string[];
}): Promise<Set<string>> {
  for (const subdir of params.reconcile) {
    await removeStaleUserWuSubdir({ cwd: params.cwd, identity: params.identity, subdir });
  }
  return new Set(params.reconcile);
}

/**
 * Reconcile retired per-WU subdirs at load time — resolve the reconcilable set
 * ({@link resolveReconcilableSubdirs}) and remove each. Removal is recoverable:
 * the caller has already written the pre-load backup capturing these files.
 *
 * @returns The set of reconciled (removed) subdir names.
 */
async function reconcileRetiredSubdirs(params: {
  cwd: string;
  identity: string;
  exec: GitExec;
  localFiles: Record<string, string>;
  recentNotes: RecentNote[];
}): Promise<Set<string>> {
  const reconcile = await resolveReconcilableSubdirs({
    cwd: params.cwd,
    exec: params.exec,
    localFiles: params.localFiles,
    recentNotes: params.recentNotes,
  });
  return removeReconciledSubdirs({ cwd: params.cwd, identity: params.identity, reconcile });
}

/**
 * Reconcile the local user tree's retired per-WU subdirs — the reversible cleanup
 * `arc user open` runs *before* its stale-subdir prompt, so a shipped, drift-free
 * subdir is removed (recoverable from the backup) with no confirm: its shipped
 * status is proof, not a decision the operator must make.
 *
 * The same reconcile the load path performs inline, minus the note
 * materialization — usable from any entry point that holds only `cwd` / `io` /
 * `identity`. The pre-removal backup is written only once a removal is actually
 * pending, so a no-op open (nothing reconcilable) leaves no snapshot behind.
 * No-ops cleanly when the user dir is absent or empty.
 *
 * @returns Names of the reconciled (removed) subdirs; empty when nothing qualified.
 */
export async function reconcileRetiredSubdirsStandalone(params: {
  cwd: string;
  io: UserIOContext;
  identity: string;
}): Promise<Set<string>> {
  const { cwd, io, identity } = params;
  const userDir = join(cwd, ".arc", "user", identity);

  let localManifest: SyncManifest;
  try {
    localManifest = (await serialize(userDir, io.readDir, io.readFile)).manifest;
  } catch {
    return new Set();
  }
  const localFiles = localManifest.files;
  if (Object.keys(localFiles).length === 0) return new Set();

  const recentNotes = await readRecentUserNotes(io.exec, identity);
  const reconcile = await resolveReconcilableSubdirs({ cwd, exec: io.exec, localFiles, recentNotes });
  if (reconcile.length === 0) return new Set();

  // Back up only once a removal is pending: the snapshot exists to make the
  // reconcile recoverable, so a no-op open writes nothing.
  const internalDir = getUserInternalDir(cwd, identity);
  await ensureDir(internalDir, io.mkdir);
  await io.writeFile(join(internalDir, createTimestampedBackupFilename()), JSON.stringify(localManifest));
  await pruneTimestampedBackups(internalDir, io.readDir);

  return removeReconciledSubdirs({ cwd, identity, reconcile });
}

/**
 * Render one orphan classification to a user-facing notice string. The seam where
 * the structured classification ({@link classifyOrphans}) flattens to a string;
 * a later drift tier adds classification kinds, not new call sites.
 */
function renderOrphanNotice(classification: OrphanClassification, backupFilename: string): string {
  const backedUp = `backed up to .internal/${backupFilename}`;
  switch (classification.kind) {
    case "grouped-retirement":
      return (
        `User subdir "${classification.subdir}/" (${classification.files.length} file(s)) not in saved ` +
        `manifest — left in place; ${backedUp}. Remove the subdir if its work unit is retired.`
      );
    case "rename-candidate":
      return (
        `Local file "${classification.from}" not in saved manifest — looks like a rename to ` +
        `"${classification.to}" (content matches); ${backedUp}`
      );
    case "generic":
      return `Local file "${classification.name}" not in saved manifest — ${backedUp}`;
  }
}

/**
 * Restrict a manifest to what the current load should materialize: cross-WU
 * flat files plus the current WU's own subdir, dropping other WUs' subdirs.
 * With no current WU the per-WU restore no-ops (only cross-WU flat survives);
 * an all-flat pre-isolation manifest is unaffected, since every entry is
 * cross-WU.
 */
function filterManifestForWu(
  manifest: SyncManifest,
  currentWuName: string | undefined,
): SyncManifest {
  const files: Record<string, string> = {};
  for (const [path, content] of Object.entries(manifest.files)) {
    if (classifyUserSyncPath(path) === "cross-wu" || wuNameOfPath(path) === currentWuName) {
      files[path] = content;
    }
  }
  return { version: manifest.version, files };
}

async function isCommitReachableFromHead(
  io: UserIOContext,
  commit: string,
): Promise<boolean> {
  try {
    await io.exec("git", ["merge-base", "--is-ancestor", commit, "HEAD"]);
    return true;
  } catch {
    return false;
  }
}

async function countCommitsSince(
  io: UserIOContext,
  commit: string,
): Promise<number> {
  try {
    const { stdout } = await io.exec("git", ["rev-list", "--count", `${commit}..HEAD`]);
    return Number.parseInt(stdout.trim(), 10) || 0;
  } catch {
    return 0;
  }
}

export async function listBackupFiles(
  cwd: string,
  io: UserIOContext,
  identity: string,
): Promise<string[]> {
  const legacyFiles = await readBackupNames(join(cwd, ".arc", "user", identity), io.readDir);
  const internalFiles = await readBackupNames(getUserInternalDir(cwd, identity), io.readDir);
  const backupFiles = [...internalFiles, ...legacyFiles];
  const legacy = backupFiles.filter((name) => name === BACKUP_FILENAME);
  const timestamped = backupFiles
    .filter((name) => isTimestampedBackupFile(name))
    .sort((left, right) => right.localeCompare(left));
  return [...timestamped, ...legacy];
}

function createTimestampedBackupFilename(): string {
  const timestamp = new Date().toISOString().replaceAll(":", "-");
  return `${BACKUP_TIMESTAMPED_PREFIX}${timestamp}${BACKUP_TIMESTAMPED_SUFFIX}`;
}

function isTimestampedBackupFile(name: string): boolean {
  return name.startsWith(BACKUP_TIMESTAMPED_PREFIX) && name.endsWith(BACKUP_TIMESTAMPED_SUFFIX);
}

async function pruneTimestampedBackups(
  backupDir: string,
  readDir: UserIOContext["readDir"],
): Promise<void> {
  const entries = await readDir(backupDir);
  const timestamped = entries
    .map((entry) => entry.name)
    .filter(isTimestampedBackupFile)
    .sort((left, right) => right.localeCompare(left));

  const toDelete = timestamped.slice(BACKUP_RETENTION);
  for (const filename of toDelete) {
    try {
      await rm(join(backupDir, filename), { force: true });
    } catch {
      // Best-effort pruning; backup creation already succeeded.
    }
  }
}

async function readBackupNames(
  dir: string,
  readDir: UserIOContext["readDir"],
): Promise<string[]> {
  try {
    return (await readDir(dir))
      .map((entry) => entry.name)
      .filter((name) => name === BACKUP_FILENAME || isTimestampedBackupFile(name));
  } catch {
    return [];
  }
}
