/**
 * User subcommand — manage ARC user directory and portability.
 *
 * Subcommands: add, save, load, push, pull. Uses git notes for cross-machine
 * portability of the `user/{identity}/` directory.
 */

import { join } from "node:path";
import {
  ensureDir,
} from "../lib/template/index.js";
import {
  serialize, deserialize,
  type SyncManifest, type DirEntry, type SkipWarning,
} from "../lib/git/index.js";
import { PM_MODE_ARC_IN_GIT } from "../lib/constants.js";
import type { CoreIO } from "../lib/types.js";

// --- Types ---

/** I/O dependencies for the user command. */
export interface UserIOContext extends CoreIO {
  /** Read directory entries (name + size) from a user directory. */
  readDir: (dirPath: string) => Promise<DirEntry[]>;
  /** Write content to a git note ref on a commit. */
  writeNote: (ref: string, content: string, commit: string) => Promise<void>;
  /** Read content from a git note ref on a commit. Returns null if no note. */
  readNote: (ref: string, commit: string) => Promise<string | null>;
}

/** Notes ref prefix for ARC user directories. */
const NOTES_REF_PREFIX = "arc/user";

/** Build the notes ref for a given identity. */
function notesRef(identity: string): string {
  return `${NOTES_REF_PREFIX}/${identity}`;
}

// --- Save ---

/** Result of a user save operation. */
export interface UserSaveResult {
  identity: string;
  commit: string;
  fileCount: number;
  warnings: SkipWarning[];
}

/** Options for the save operation. */
export interface UserSaveOptions {
  cwd: string;
  io: UserIOContext;
  identity: string;
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

  // Get HEAD commit
  const { stdout: commit } = await io.exec("git", ["rev-parse", "HEAD"]);

  // Serialize user directory
  const result = await serialize(userDir, io.readDir, io.readFile);

  if (Object.keys(result.manifest.files).length === 0) {
    throw new UserSaveError("No eligible files found in user directory to save.");
  }

  // Write manifest as git note
  const json = JSON.stringify(result.manifest);
  await io.writeNote(notesRef(identity), json, commit);

  return {
    identity,
    commit: commit.slice(0, 7),
    fileCount: Object.keys(result.manifest.files).length,
    warnings: result.warnings,
  };
}

/** Error specific to user save operations. */
export class UserSaveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserSaveError";
  }
}

// --- Load ---

/** Backup filename for pre-load snapshot of local state. */
export const BACKUP_FILENAME = ".pre-load-backup.json";

/** Result of a user load operation. */
export interface UserLoadResult {
  identity: string;
  commit: string;
  fileCount: number;
  /** Whether the note was found on an ancestor rather than HEAD. */
  fromAncestor: boolean;
  /** Warnings about local files not present in the loaded manifest. */
  warnings: string[];
}

/** Options for the load operation. */
export interface UserLoadOptions {
  cwd: string;
  io: UserIOContext;
  identity: string;
  /** Maximum number of ancestor commits to walk. */
  maxAncestorWalk?: number;
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
  const maxWalk = options.maxAncestorWalk ?? 20;
  const userDir = join(cwd, ".arc", "user", identity);
  const ref = notesRef(identity);

  // Find the nearest ancestor with a note using batched git calls:
  // 1. List all commits with notes (single call)
  // 2. Walk ancestors from HEAD in topological order (single call, follows merges)
  // 3. First intersection = nearest noted ancestor
  let noteContent: string | null = null;
  let foundCommit = "";
  let fromAncestor = false;

  // Get HEAD
  const { stdout: head } = await io.exec("git", ["rev-parse", "HEAD"]);
  const headHash = head;

  // 1. Get all commits that have notes for this identity
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

  // 2. Walk ancestors from HEAD (includes HEAD) in topological order
  // rev-list follows all parent paths (handles merge commits) and
  // stops naturally at shallow clone boundaries
  try {
    const { stdout: ancestorList } = await io.exec("git", [
      "rev-list", "--max-count", String(maxWalk), "HEAD",
    ]);
    for (const commit of ancestorList.split("\n")) {
      if (commit && notedCommits.has(commit)) {
        noteContent = await io.readNote(ref, commit);
        if (noteContent) {
          foundCommit = commit;
          fromAncestor = commit !== headHash;
          break;
        }
      }
    }
  } catch {
    // rev-list failure (shouldn't happen after successful rev-parse)
  }

  if (!noteContent) {
    return null;
  }

  // Parse and validate — noteContent is external data, so validate before narrowing
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

  // Backup existing local files before overwriting
  let staleWarnings: string[] = [];
  try {
    const localResult = await serialize(userDir, io.readDir, io.readFile);
    const localFiles = localResult.manifest.files;

    if (Object.keys(localFiles).length > 0) {
      // Write backup as dotfile (excluded from serialization by dotfile convention)
      await io.writeFile(
        join(userDir, BACKUP_FILENAME),
        JSON.stringify(localResult.manifest),
      );

      // Detect stale files: local files not present in the incoming manifest
      const manifestNames = new Set(Object.keys(manifest.files));
      staleWarnings = Object.keys(localFiles)
        .filter((name) => !manifestNames.has(name))
        .map((name) => `Local file "${name}" not in saved manifest — preserved in ${BACKUP_FILENAME}`);
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
    warnings: staleWarnings,
  };
}

// --- Add ---

/** Options for the add operation. */
export interface UserAddOptions {
  cwd: string;
  io: UserIOContext;
  identity: string;
  internalTemplateDir: string;
  pmMode: string;
}

/**
 * Create a new user directory for a team member.
 *
 * Populates with templates (SESSION-NOTES.md, ATOMIC-INBOX.md if arc-in-git)
 * and adds gitignore entry. Used for adding developers post-init.
 *
 * @param options - Add options
 */
export async function runUserAdd(
  options: UserAddOptions,
): Promise<void> {
  const { cwd, io, identity, internalTemplateDir, pmMode } = options;
  const userDir = join(cwd, ".arc", "user", identity);

  await ensureDir(userDir, io.mkdir);

  const sessionNotes = await io.readFile(
    join(internalTemplateDir, "user", "SESSION-NOTES.md"),
  );
  await io.writeFile(join(userDir, "SESSION-NOTES.md"), sessionNotes);

  if (pmMode === PM_MODE_ARC_IN_GIT) {
    const atomicInbox = await io.readFile(
      join(internalTemplateDir, "user", "ATOMIC-INBOX.md"),
    );
    await io.writeFile(join(userDir, "ATOMIC-INBOX.md"), atomicInbox);
  }

  // Note: .arc/user/*/ is covered by the managed ARC gitignore block
  // written during arc init. No per-identity entry needed.
}

// --- Push ---

/** Options for the push operation. */
export interface UserPushOptions {
  io: UserIOContext;
  identity: string;
  /** Force-push even when remote has diverged. */
  force?: boolean;
}

/**
 * Push user notes ref to remote origin.
 *
 * @param options - Push options
 */
export async function runUserPush(options: UserPushOptions): Promise<void> {
  const { io, identity, force } = options;
  const ref = `refs/notes/${notesRef(identity)}`;
  const args = force ? ["push", "--force", "origin", ref] : ["push", "origin", ref];
  await io.exec("git", args);
}

/**
 * Check whether the remote has the notes ref for a given identity.
 * Returns true if remote ref exists, false otherwise.
 */
export async function hasRemoteNotes(
  io: UserIOContext,
  identity: string,
): Promise<boolean> {
  try {
    const ref = `refs/notes/${notesRef(identity)}`;
    const { stdout } = await io.exec("git", ["ls-remote", "origin", ref]);
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Check whether local notes ref exists for a given identity.
 * Returns true if the local ref has at least one note.
 */
export async function hasLocalNotes(
  io: UserIOContext,
  identity: string,
): Promise<boolean> {
  try {
    const { stdout } = await io.exec("git", ["notes", "--ref", notesRef(identity), "list"]);
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

// --- Pull ---

/** Options for the pull operation. */
export interface UserPullOptions {
  io: UserIOContext;
  /** Identity whose notes to fetch (may differ from caller's identity for cross-user pull). */
  identity: string;
  /** Force-fetch even when local ref has diverged from remote. */
  force?: boolean;
}

/**
 * Fetch user notes ref from remote origin.
 *
 * @param options - Pull options
 */
export async function runUserPull(options: UserPullOptions): Promise<void> {
  const { io, identity, force } = options;
  const ref = `refs/notes/${notesRef(identity)}`;
  // '+' prefix forces local ref update even if not fast-forward
  const refspec = force ? `+${ref}:${ref}` : `${ref}:${ref}`;
  await io.exec("git", ["fetch", "origin", refspec]);
}

// --- Result Formatting ---

/**
 * Build user-facing summary for a save result.
 *
 * @param result - Save result
 * @returns Formatted message for terminal display
 */
export function buildSaveSummary(result: UserSaveResult): string {
  const lines: string[] = [];
  lines.push(`Saved ${result.fileCount} file(s) to git note on ${result.commit}`);
  lines.push(`Identity: ${result.identity}`);

  if (result.warnings.length > 0) {
    lines.push("");
    lines.push("Skipped files:");
    for (const w of result.warnings) {
      lines.push(`  - ${w.path} (${w.detail})`);
    }
  }

  return lines.join("\n");
}

/**
 * Build user-facing summary for a load result.
 *
 * @param result - Load result
 * @returns Formatted message for terminal display
 */
export function buildLoadSummary(result: UserLoadResult): string {
  const lines: string[] = [];
  lines.push(`Restored ${result.fileCount} file(s) from git note on ${result.commit}`);
  lines.push(`Identity: ${result.identity}`);

  if (result.fromAncestor) {
    lines.push("Note: loaded from an ancestor commit (no note on HEAD).");
  }

  if (result.warnings.length > 0) {
    lines.push("");
    lines.push("Warnings:");
    for (const w of result.warnings) {
      lines.push(`  - ${w}`);
    }
  }

  return lines.join("\n");
}
