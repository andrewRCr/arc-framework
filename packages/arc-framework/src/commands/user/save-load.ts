import { rm } from "node:fs/promises";
import { join } from "node:path";

import { deserialize, serialize, type SyncManifest } from "../../lib/git/index.js";
import { ensureDir } from "../../lib/template/index.js";
import { notesRef } from "./shared.js";
import {
  BACKUP_FILENAME,
  UserSaveError,
  type UserIOContext,
  type UserLoadOptions,
  type UserLoadResult,
  type UserSaveOptions,
  type UserSaveResult,
} from "./types.js";

const BACKUP_TIMESTAMPED_PREFIX = ".pre-load-backup-";
const BACKUP_TIMESTAMPED_SUFFIX = ".json";
const BACKUP_RETENTION = 3;

interface NearestUserNote {
  content: string;
  commit: string;
  fromAncestor: boolean;
  ancestorDistance: number;
}

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
): Promise<UserLoadResult | null> {
  const { cwd, io, identity } = options;
  const userDir = join(cwd, ".arc", "user", identity);
  const note = await findNearestUserNote(options);
  if (!note) {
    return null;
  }
  const { content: noteContent, commit: foundCommit, fromAncestor } = note;

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
      await io.writeFile(
        join(userDir, backupFilename),
        JSON.stringify(localResult.manifest),
      );
      await pruneTimestampedBackups(userDir, io.readDir);

      const manifestNames = new Set(Object.keys(manifest.files));
      staleWarnings = Object.keys(localFiles)
        .filter((name) => !manifestNames.has(name))
        .map((name) => `Local file "${name}" not in saved manifest — preserved in ${backupFilename}`);
    }
  } catch {
    // User dir doesn't exist yet — nothing to back up, skip gracefully
  }

  await ensureDir(userDir, io.mkdir);
  await deserialize(userDir, manifest, io.writeFile, io.mkdir);

  return {
    identity,
    commit: foundCommit.slice(0, 7),
    fileCount: Object.keys(manifest.files).length,
    fromAncestor,
    ancestorDistance: note.ancestorDistance,
    warnings: staleWarnings,
  };
}

export async function findNearestUserNote(
  options: UserLoadOptions,
): Promise<NearestUserNote | null> {
  const { io, identity } = options;
  const ref = notesRef(identity);

  let foundCommit = "";
  let noteContent: string | null = null;

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
    return null;
  }

  try {
    const revListArgs = options.maxAncestorWalk === undefined
      ? ["rev-list", "HEAD"]
      : ["rev-list", "--max-count", String(options.maxAncestorWalk), "HEAD"];
    const { stdout: ancestorList } = await io.exec("git", revListArgs);
    const commits = ancestorList.split("\n").filter((commit) => commit.length > 0);
    for (const [index, commit] of commits.entries()) {
      if (commit && notedCommits.has(commit)) {
        noteContent = await io.readNote(ref, commit);
        if (noteContent) {
          foundCommit = commit;
          return {
            content: noteContent,
            commit: foundCommit,
            fromAncestor: foundCommit !== headHash,
            ancestorDistance: index,
          };
          break;
        }
      }
    }
  } catch {
    // rev-list failure (shouldn't happen after successful rev-parse)
  }

  if (!noteContent || !foundCommit) {
    return null;
  }
  return null;
}

export async function listBackupFiles(
  cwd: string,
  io: UserIOContext,
  identity: string,
): Promise<string[]> {
  const userDir = join(cwd, ".arc", "user", identity);

  try {
    const entries = await io.readDir(userDir);
    const backupFiles = entries
      .map((entry) => entry.name)
      .filter((name) => name === BACKUP_FILENAME || isTimestampedBackupFile(name));
    const legacy = backupFiles.filter((name) => name === BACKUP_FILENAME);
    const timestamped = backupFiles
      .filter((name) => isTimestampedBackupFile(name))
      .sort((left, right) => right.localeCompare(left));
    return [...timestamped, ...legacy];
  } catch {
    return [];
  }
}

function createTimestampedBackupFilename(): string {
  const timestamp = new Date().toISOString().replaceAll(":", "-");
  return `${BACKUP_TIMESTAMPED_PREFIX}${timestamp}${BACKUP_TIMESTAMPED_SUFFIX}`;
}

function isTimestampedBackupFile(name: string): boolean {
  return name.startsWith(BACKUP_TIMESTAMPED_PREFIX) && name.endsWith(BACKUP_TIMESTAMPED_SUFFIX);
}

async function pruneTimestampedBackups(
  userDir: string,
  readDir: UserIOContext["readDir"],
): Promise<void> {
  const entries = await readDir(userDir);
  const timestamped = entries
    .map((entry) => entry.name)
    .filter(isTimestampedBackupFile)
    .sort((left, right) => right.localeCompare(left));

  const toDelete = timestamped.slice(BACKUP_RETENTION);
  for (const filename of toDelete) {
    try {
      await rm(join(userDir, filename), { force: true });
    } catch {
      // Best-effort pruning; backup creation already succeeded.
    }
  }
}
