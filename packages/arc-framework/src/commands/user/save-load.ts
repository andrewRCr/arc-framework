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
  type NearestUserNoteRef,
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
  version: 1;
  materializedManifestHash: string;
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
  await writeLocalSyncState(cwd, io, identity, result.manifest);

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
 * Reads the note from HEAD first. If not found, walks up to `maxAncestorWalk`
 * ancestors looking for a note (the common case after switching branches or
 * making new commits since the last save).
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
  await writeLocalSyncState(cwd, io, identity, manifest);

  return {
    kind: "loaded",
    identity,
    commit: foundCommit.slice(0, 7),
    fileCount: Object.keys(manifest.files).length,
    fromAncestor,
    ancestorDistance: search.note.ancestorDistance,
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
      const parsed = JSON.parse(raw) as Partial<LocalSyncState>;
      if (
        parsed.version === 1
        && typeof parsed.materializedManifestHash === "string"
        && parsed.materializedManifestHash.length > 0
      ) {
        return {
          version: 1,
          materializedManifestHash: parsed.materializedManifestHash,
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
): Promise<void> {
  const internalDir = getUserInternalDir(cwd, identity);
  const syncStatePath = join(internalDir, LOCAL_SYNC_STATE_FILENAME);
  await ensureDir(internalDir, io.mkdir);
  const state: LocalSyncState = {
    version: 1,
    materializedManifestHash: hashSyncManifest(manifest),
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

/**
 * Walk HEAD's ancestors (up to the configured cap) looking for a note.
 *
 * Returns a structured result so callers can distinguish "no notes exist at
 * all", "notes exist but not reachable within cap" (cap-hit), and "found" —
 * and render the right diagnostic for each case.
 */
export async function findNearestUserNote(
  options: UserLoadOptions,
): Promise<NearestNoteSearch> {
  const { io, identity } = options;
  const maxWalk = options.maxAncestorWalk ?? DEFAULT_MAX_ANCESTOR_WALK;
  const ref = notesRef(identity);

  const { stdout: head } = await io.exec("git", ["rev-parse", "HEAD"]);
  const headHash = head;

  const notedCommits = new Set<string>();
  try {
    const { stdout: notesList } = await io.exec("git", [
      "notes", "--ref", ref, "list",
    ]);
    for (const line of notesList.split("\n")) {
      const commit = line.split(" ")[1];
      if (commit) notedCommits.add(commit);
    }
  } catch {
    // No notes ref exists — no notes at all
  }

  if (notedCommits.size === 0) {
    return { note: null, walked: 0, maxWalk, capped: false };
  }

  try {
    const walkResult = await walkAncestorsForNote(
      io,
      ref,
      notedCommits,
      headHash,
      maxWalk,
    );

    if (walkResult.note) {
      return { note: walkResult.note, walked: walkResult.walked, maxWalk, capped: false };
    }

    return {
      note: null,
      walked: walkResult.walked,
      maxWalk,
      capped: walkResult.walked >= maxWalk,
    };
  } catch {
    // rev-list failure (shouldn't happen after successful rev-parse)
    return { note: null, walked: 0, maxWalk, capped: false };
  }
}

async function walkAncestorsForNote(
  io: UserIOContext,
  ref: string,
  notedCommits: Set<string>,
  headHash: string,
  maxWalk: number,
): Promise<{ note: NearestUserNoteRef | null; walked: number }> {
  const revListArgs = ["rev-list", "--max-count", String(maxWalk), "HEAD"];
  const { stdout: ancestorList } = await io.exec("git", revListArgs);
  const commits = ancestorList.split("\n").filter((commit) => commit.length > 0);

  for (const [index, commit] of commits.entries()) {
    if (!notedCommits.has(commit)) {
      continue;
    }

    const content = await io.readNote(ref, commit);
    if (!content) {
      continue;
    }

    return {
      note: {
        content,
        commit,
        fromAncestor: commit !== headHash,
        ancestorDistance: index,
      },
      walked: index + 1,
    };
  }

  return { note: null, walked: commits.length };
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
