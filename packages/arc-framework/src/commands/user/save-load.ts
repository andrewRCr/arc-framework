import { rm } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";

import { atomicWriteJson } from "../../lib/fs.js";
import { deserialize, isSafeManifestPath, serialize, shortHash, type SyncManifest } from "../../lib/git/index.js";
import { ensureDir } from "../../lib/template/index.js";
import { classifyUserSyncPath, wuNameOfPath } from "../../lib/user-sync/index.js";
import {
  listChangedNotePaths,
  notePathToCommit,
  readNoteContentAtHistoryCommit,
  readNotesRefHistory,
} from "../../lib/user-sync/notes-ref.js";
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
} from "./types.js";

const BACKUP_TIMESTAMPED_PREFIX = ".pre-load-backup-";
const BACKUP_TIMESTAMPED_SUFFIX = ".json";
const BACKUP_RETENTION = 3;
const LOCAL_SYNC_STATE_FILENAME = ".sync-state.json";
const USER_INTERNAL_DIRNAME = ".internal";

interface LocalSyncState {
  version: 3;
  materializedManifestHash: string;
  sourceCommit: string;
  sourceOperation: "save" | "load";
  /**
   * ISO-8601 timestamp when this record was written. Optional in memory because
   * v2 records on disk predate the field — they hydrate with `savedAt: undefined`
   * and pick up a populated value on the next save.
   */
  savedAt?: string;
  verifiedAt?: string;
  partialPush?: PartialPushMarker;
}

interface PartialPushMarker {
  localRefHash: string;
  sourceCommit: string;
}

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

  const json = JSON.stringify(result.manifest);
  await io.writeNote(notesRef(identity), json, commit);
  await verifySavedNote(io, identity, commit, result.manifest);
  await writeLocalSyncState(cwd, io, identity, result.manifest, commit, "save", commit);

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
  if (!search.note) {
    if (search.capped) {
      return {
        kind: "walk-exhausted",
        walked: search.walked,
        maxWalk: search.maxWalk,
      };
    }
    return null;
  }
  const { content: noteContent, commit: foundCommit, fromAncestor } = search.note;

  let parsed: unknown;
  try {
    parsed = JSON.parse(noteContent) as unknown;
  } catch {
    throw new Error(
      `Corrupt git note on ${await shortHash(io.exec, foundCommit)} — JSON parse failed. ` +
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
      `Unsupported note format on ${await shortHash(io.exec, foundCommit)} ` +
      `(version ${JSON.stringify(raw.version ?? "unknown")}). ` +
      "This note may have been created by a newer version of ARC. " +
      "Update the CLI and try again, or `arc user save` to overwrite.",
    );
  }
  const manifest = parsed as SyncManifest;
  const loadManifest = filterManifestForWu(manifest, options.currentWuName);

  let staleWarnings: string[] = [];
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

      const manifestNames = new Set(Object.keys(loadManifest.files));
      staleWarnings = Object.keys(localFiles)
        .filter((name) => !manifestNames.has(name))
        .map((name) => `Local file "${name}" not in saved manifest — preserved in .internal/${backupFilename}`);
    }
  } catch {
    // User dir doesn't exist yet — nothing to back up, skip gracefully
  }

  await ensureDir(userDir, io.mkdir);
  await deserialize(userDir, loadManifest, io.writeFile, io.mkdir);
  await verifyMaterializedUserDir(userDir, io, foundCommit, loadManifest);
  await writeLocalSyncState(cwd, io, identity, loadManifest, foundCommit, "load", foundCommit);

  return {
    kind: "loaded",
    identity,
    commit: await shortHash(io.exec, foundCommit),
    fileCount: Object.keys(loadManifest.files).length,
    fromAncestor,
    ancestorDistance: search.note.ancestorDistance,
    noteHistoryDistance: search.note.noteHistoryDistance,
    reachableFromHead: search.note.reachableFromHead,
    warnings: staleWarnings,
  };
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

export async function readLocalSyncState(
  cwd: string,
  io: UserIOContext,
  identity: string,
): Promise<LocalSyncState | null> {
  for (const syncStatePath of [
    join(getUserInternalDir(cwd, identity), LOCAL_SYNC_STATE_FILENAME),
    join(cwd, ".arc", "user", identity, LOCAL_SYNC_STATE_FILENAME),
  ]) {
    let raw: string;
    try {
      raw = await io.readFile(syncStatePath);
    } catch {
      continue;
    }

    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== "object" || parsed === null) {
        continue;
      }
      const record = parsed as Record<string, unknown>;

      if (
        (record.version === 2 || record.version === 3)
        && typeof record.materializedManifestHash === "string"
        && record.materializedManifestHash.length > 0
        && typeof record.sourceCommit === "string"
        && record.sourceCommit.length > 0
        && (record.sourceOperation === "save" || record.sourceOperation === "load")
      ) {
        const partialPush = parsePartialPushMarker(record.partialPush);
        return {
          version: 3,
          materializedManifestHash: record.materializedManifestHash,
          sourceCommit: record.sourceCommit,
          sourceOperation: record.sourceOperation,
          ...(typeof record.savedAt === "string" && record.savedAt.length > 0
            ? { savedAt: record.savedAt }
            : {}),
          ...(typeof record.verifiedAt === "string" && record.verifiedAt.length > 0
            ? { verifiedAt: record.verifiedAt }
            : {}),
          ...(partialPush ? { partialPush } : {}),
        };
      }
    } catch {
      return null;
    }
  }

  return null;
}

function parsePartialPushMarker(value: unknown): PartialPushMarker | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.localRefHash !== "string" ||
    record.localRefHash.length === 0 ||
    typeof record.sourceCommit !== "string" ||
    record.sourceCommit.length === 0
  ) {
    return null;
  }
  return {
    localRefHash: record.localRefHash,
    sourceCommit: record.sourceCommit,
  };
}

async function writeLocalSyncState(
  cwd: string,
  io: UserIOContext,
  identity: string,
  manifest: SyncManifest,
  sourceCommit: string,
  sourceOperation: "save" | "load",
  verifiedAt?: string,
): Promise<void> {
  const internalDir = getUserInternalDir(cwd, identity);
  const syncStatePath = join(internalDir, LOCAL_SYNC_STATE_FILENAME);
  await ensureDir(internalDir, io.mkdir);
  const state: LocalSyncState = {
    version: 3,
    materializedManifestHash: hashSyncManifest(manifest),
    sourceCommit,
    sourceOperation,
    savedAt: new Date().toISOString(),
    ...(verifiedAt ? { verifiedAt } : {}),
  };
  await atomicWriteJson(syncStatePath, state);
}

async function writeLocalSyncStateRecord(
  cwd: string,
  io: UserIOContext,
  identity: string,
  state: LocalSyncState,
): Promise<void> {
  const internalDir = getUserInternalDir(cwd, identity);
  const syncStatePath = join(internalDir, LOCAL_SYNC_STATE_FILENAME);
  await ensureDir(internalDir, io.mkdir);
  await atomicWriteJson(syncStatePath, state);
}

export async function recordPartialPushMarker(
  cwd: string,
  io: UserIOContext,
  identity: string,
): Promise<boolean> {
  const state = await readLocalSyncState(cwd, io, identity);
  if (!state) return false;

  const localRefHash = await readLocalNotesRefHash(io, identity);
  if (!localRefHash) return false;

  await writeLocalSyncStateRecord(cwd, io, identity, {
    ...state,
    partialPush: { localRefHash, sourceCommit: state.sourceCommit },
  });
  return true;
}

export async function clearPartialPushMarker(
  cwd: string,
  io: UserIOContext,
  identity: string,
): Promise<void> {
  const state = await readLocalSyncState(cwd, io, identity);
  if (!state?.partialPush) return;

  await writeLocalSyncStateRecord(cwd, io, identity, {
    version: state.version,
    materializedManifestHash: state.materializedManifestHash,
    sourceCommit: state.sourceCommit,
    sourceOperation: state.sourceOperation,
    ...(state.savedAt ? { savedAt: state.savedAt } : {}),
    ...(state.verifiedAt ? { verifiedAt: state.verifiedAt } : {}),
  });
}

async function readLocalNotesRefHash(
  io: UserIOContext,
  identity: string,
): Promise<string | null> {
  try {
    const { stdout } = await io.exec("git", [
      "rev-parse",
      "--verify",
      `refs/notes/${notesRef(identity)}`,
    ]);
    return stdout.trim() || null;
  } catch {
    return null;
  }
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

function getUserInternalDir(cwd: string, identity: string): string {
  return join(cwd, ".arc", "user", identity, USER_INTERNAL_DIRNAME);
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
