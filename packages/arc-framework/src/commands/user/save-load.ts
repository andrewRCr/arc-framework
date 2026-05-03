import { rm } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";

import { deserialize, serialize, type SyncManifest } from "../../lib/git/index.js";
import { ensureDir } from "../../lib/template/index.js";
import { notesRef } from "./shared.js";
import {
  BACKUP_FILENAME,
  UserSaveError,
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
  version: 2;
  materializedManifestHash: string;
  sourceCommit: string;
  sourceOperation: "save" | "load";
}

/** Default ancestor-walk cap. Aligns with common shallow-clone depth conventions. */
export const DEFAULT_MAX_ANCESTOR_WALK = 1000;

/**
 * Save the user directory to a git note on HEAD.
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
  await writeLocalSyncState(cwd, io, identity, result.manifest, commit, "save");

  return {
    identity,
    commit: commit.slice(0, 7),
    fileCount: Object.keys(result.manifest.files).length,
    warnings: result.warnings,
  };
}

/**
 * Load the user directory from a git note.
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
      `Corrupt git note on ${foundCommit.slice(0, 7)} — JSON parse failed. ` +
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
      `Unsupported note format on ${foundCommit.slice(0, 7)} (version ${JSON.stringify(raw.version ?? "unknown")}). ` +
      "This note may have been created by a newer version of ARC. " +
      "Update the CLI and try again, or `arc user save` to overwrite.",
    );
  }
  const manifest = parsed as SyncManifest;

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

      const manifestNames = new Set(Object.keys(manifest.files));
      staleWarnings = Object.keys(localFiles)
        .filter((name) => !manifestNames.has(name))
        .map((name) => `Local file "${name}" not in saved manifest — preserved in .internal/${backupFilename}`);
    }
  } catch {
    // User dir doesn't exist yet — nothing to back up, skip gracefully
  }

  await ensureDir(userDir, io.mkdir);
  await deserialize(userDir, manifest, io.writeFile, io.mkdir);
  await writeLocalSyncState(cwd, io, identity, manifest, foundCommit, "load");

  return {
    kind: "loaded",
    identity,
    commit: foundCommit.slice(0, 7),
    fileCount: Object.keys(manifest.files).length,
    fromAncestor,
    ancestorDistance: search.note.ancestorDistance,
    noteHistoryDistance: search.note.noteHistoryDistance,
    reachableFromHead: search.note.reachableFromHead,
    warnings: staleWarnings,
  };
}

export function hashSyncManifest(
  manifest: SyncManifest,
): string {
  const normalized = normalizeManifest(manifest);
  return createHash("sha256")
    .update(JSON.stringify(normalized))
    .digest("hex");
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
        record.version === 2
        && typeof record.materializedManifestHash === "string"
        && record.materializedManifestHash.length > 0
        && typeof record.sourceCommit === "string"
        && record.sourceCommit.length > 0
        && (record.sourceOperation === "save" || record.sourceOperation === "load")
      ) {
        return {
          version: 2,
          materializedManifestHash: record.materializedManifestHash,
          sourceCommit: record.sourceCommit,
          sourceOperation: record.sourceOperation,
        };
      }

      if (
        record.version === 1
        && typeof record.materializedManifestHash === "string"
        && record.materializedManifestHash.length > 0
      ) {
        return {
          version: 2,
          materializedManifestHash: record.materializedManifestHash,
          sourceCommit: "",
          sourceOperation: "load",
        };
      }
    } catch {
      return null;
    }
  }

  return null;
}

async function writeLocalSyncState(
  cwd: string,
  io: UserIOContext,
  identity: string,
  manifest: SyncManifest,
  sourceCommit: string,
  sourceOperation: "save" | "load",
): Promise<void> {
  const internalDir = getUserInternalDir(cwd, identity);
  const syncStatePath = join(internalDir, LOCAL_SYNC_STATE_FILENAME);
  await ensureDir(internalDir, io.mkdir);
  const state: LocalSyncState = {
    version: 2,
    materializedManifestHash: hashSyncManifest(manifest),
    sourceCommit,
    sourceOperation,
  };
  await io.writeFile(syncStatePath, `${JSON.stringify(state, null, 2)}\n`);
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
  const { io, identity } = options;
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

  const notesHistory = await readNotesRefHistory(io, fullRef, maxWalk);
  if (notesHistory.length === 0) {
    return { note: null, walked: 0, maxWalk, capped: false };
  }

  for (const [index, noteHistoryCommit] of notesHistory.entries()) {
    const changedPaths = await listChangedNotePaths(io, noteHistoryCommit);
    for (const path of changedPaths) {
      const annotatedCommit = notePathToCommit(path);
      if (!annotatedCommit) continue;

      const content = await readNoteContentAtHistoryCommit(io, noteHistoryCommit, path);
      if (!content) continue;

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

async function readNotesRefHistory(
  io: UserIOContext,
  fullRef: string,
  maxWalk: number,
): Promise<string[]> {
  try {
    const { stdout } = await io.exec("git", [
      "log",
      "--format=%H",
      "--max-count",
      String(maxWalk),
      fullRef,
    ]);
    return stdout.split("\n").map((entry) => entry.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

async function listChangedNotePaths(
  io: UserIOContext,
  noteHistoryCommit: string,
): Promise<string[]> {
  try {
    const { stdout } = await io.exec("git", [
      "diff-tree",
      "--no-commit-id",
      "--name-only",
      "-r",
      "--root",
      noteHistoryCommit,
    ]);
    return stdout.split("\n").map((entry) => entry.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function notePathToCommit(path: string): string | null {
  const commit = path.replaceAll("/", "");
  return /^[0-9a-f]{40}$/u.test(commit) ? commit : null;
}

async function readNoteContentAtHistoryCommit(
  io: UserIOContext,
  noteHistoryCommit: string,
  path: string,
): Promise<string | null> {
  try {
    const { stdout } = await io.exec("git", ["show", `${noteHistoryCommit}:${path}`]);
    return stdout;
  } catch {
    return null;
  }
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
