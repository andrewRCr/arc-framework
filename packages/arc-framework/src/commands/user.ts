/**
 * User subcommand — manage ARC user directory and portability.
 *
 * Subcommands: add, save, load, push, fetch, pull. Uses git notes for cross-machine
 * portability of the `user/{identity}/` directory.
 */

import { rm } from "node:fs/promises";
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
const BACKUP_TIMESTAMPED_PREFIX = ".pre-load-backup-";
const BACKUP_TIMESTAMPED_SUFFIX = ".json";
const BACKUP_RETENTION = 3;

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
  const userDir = join(cwd, ".arc", "user", identity);
  const note = await findNearestUserNote(options);
  if (!note) {
    return null;
  }
  const { content: noteContent, commit: foundCommit, fromAncestor } = note;

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
      const backupFilename = createTimestampedBackupFilename();
      await io.writeFile(
        join(userDir, backupFilename),
        JSON.stringify(localResult.manifest),
      );
      await pruneTimestampedBackups(userDir, io.readDir);

      // Detect stale files: local files not present in the incoming manifest
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
    warnings: staleWarnings,
  };
}

interface NearestUserNote {
  content: string;
  commit: string;
  fromAncestor: boolean;
}

async function findNearestUserNote(
  options: UserLoadOptions,
): Promise<NearestUserNote | null> {
  const { io, identity } = options;
  const maxWalk = options.maxAncestorWalk ?? 20;
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
    const { stdout: ancestorList } = await io.exec("git", [
      "rev-list", "--max-count", String(maxWalk), "HEAD",
    ]);
    for (const commit of ancestorList.split("\n")) {
      if (commit && notedCommits.has(commit)) {
        noteContent = await io.readNote(ref, commit);
        if (noteContent) {
          foundCommit = commit;
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

  return {
    content: noteContent,
    commit: foundCommit,
    fromAncestor: foundCommit !== headHash,
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

/** Options for the fetch operation. */
export interface UserFetchOptions {
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
export async function runUserFetch(options: UserFetchOptions): Promise<void> {
  const { io, identity, force } = options;
  const ref = `refs/notes/${notesRef(identity)}`;
  // '+' prefix forces local ref update even if not fast-forward
  const refspec = force ? `+${ref}:${ref}` : `${ref}:${ref}`;
  await io.exec("git", ["fetch", "origin", refspec]);
}

/** Options for the pull operation. */
export interface UserPullOptions extends UserFetchOptions {
  cwd: string;
  maxAncestorWalk?: number;
}

/**
 * Fetch user notes from remote and restore them to disk.
 *
 * @param options - Pull options
 * @returns Load result, or null if no note was found after fetch
 */
export async function runUserPull(
  options: UserPullOptions,
): Promise<UserLoadResult | null> {
  const { cwd, io, identity, force, maxAncestorWalk } = options;
  await runUserFetch({ io, identity, force });
  return runUserLoad({ cwd, io, identity, maxAncestorWalk });
}

export type UserSyncRefState =
  | "same"
  | "local-ahead"
  | "remote-ahead"
  | "diverged"
  | "remote-unavailable";

export type UserSyncDiskState = "same" | "different";

export interface UserSyncState {
  refState: UserSyncRefState;
  diskState: UserSyncDiskState;
}

export interface InspectUserSyncOptions {
  cwd: string;
  io: UserIOContext;
  identity: string;
}

const TEMP_SYNC_REF_PREFIX = "refs/arc-sync-temp";

export type UserStatusHeadline =
  | "in sync"
  | "remote ahead"
  | "disk ahead"
  | "conflict"
  | "remote unavailable";

export interface UserStatusRemoteIdentity {
  identity: string;
  ref: string;
  hash: string;
}

export interface UserStatusResult {
  identity: string;
  headline: UserStatusHeadline;
  summary: string;
  actionHint: string | null;
  detailLines: string[];
  remoteChecked: boolean;
  refState: UserSyncRefState | null;
  diskState: UserSyncDiskState;
  savedCommit: string | null;
  savedFromAncestor: boolean;
  backupFiles: string[];
  remoteIdentities: UserStatusRemoteIdentity[];
}

export interface UserStatusOptions {
  cwd: string;
  io: UserIOContext;
  identity: string;
  offline?: boolean;
  all?: boolean;
}

/**
 * Inspect local/remote note refs and on-disk state for sync direction decisions.
 *
 * @param options - Inspection options
 * @returns Ref relation and whether disk differs from the current local snapshot
 */
export async function inspectUserSyncState(
  options: InspectUserSyncOptions,
): Promise<UserSyncState> {
  const { cwd, io, identity } = options;
  const [refState, diskState] = await Promise.all([
    inspectUserSyncRefs(io, identity),
    inspectDiskVsLocalSnapshot(cwd, io, identity),
  ]);

  return { refState, diskState };
}

/**
 * Inspect the current user portability state and shape it for `arc user status`.
 *
 * @param options - Status options
 * @returns User status summary plus actionable detail lines
 */
export async function runUserStatus(
  options: UserStatusOptions,
): Promise<UserStatusResult> {
  const { cwd, io, identity, offline = false, all = false } = options;
  const [diskState, note, backupFiles, remoteIdentities, refInspection] = await Promise.all([
    inspectDiskVsLocalSnapshot(cwd, io, identity),
    findNearestUserNote({ cwd, io, identity }),
    listBackupFiles(cwd, io, identity),
    all ? listRemoteUserIdentities(io) : Promise.resolve([]),
    offline ? Promise.resolve(null) : inspectUserSyncRefsDetailed(io, identity),
  ]);

  return buildUserStatusResult({
    identity,
    diskState,
    refState: refInspection?.state ?? null,
    remoteChecked: !offline,
    savedCommit: note ? note.commit.slice(0, 7) : null,
    savedFromAncestor: note ? note.fromAncestor : false,
    backupFiles,
    remoteIdentities,
  });
}

async function inspectUserSyncRefs(
  io: UserIOContext,
  identity: string,
): Promise<UserSyncRefState> {
  const result = await inspectUserSyncRefsDetailed(io, identity);
  return result.state;
}

interface UserSyncRefInspection {
  state: UserSyncRefState;
}

async function inspectUserSyncRefsDetailed(
  io: UserIOContext,
  identity: string,
): Promise<UserSyncRefInspection> {
  const localRef = `refs/notes/${notesRef(identity)}`;
  const tempRef = `${TEMP_SYNC_REF_PREFIX}/${identity}`;

  const localHash = await readRefHash(io, localRef);

  try {
    await io.exec("git", ["fetch", "origin", `+${localRef}:${tempRef}`]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("couldn't find remote ref")) {
      return { state: localHash ? "local-ahead" : "same" };
    }
    return { state: "remote-unavailable" };
  }

  try {
    const remoteHash = await readRefHash(io, tempRef);

    if (!localHash && !remoteHash) return { state: "same" };
    if (!localHash && remoteHash) return { state: "remote-ahead" };
    if (localHash && !remoteHash) return { state: "local-ahead" };
    if (!localHash || !remoteHash) return { state: "same" };
    if (localHash === remoteHash) return { state: "same" };

    if (await isAncestor(io, localHash, remoteHash)) return { state: "remote-ahead" };
    if (await isAncestor(io, remoteHash, localHash)) return { state: "local-ahead" };
    return { state: "diverged" };
  } finally {
    await deleteRef(io, tempRef);
  }
}

async function inspectDiskVsLocalSnapshot(
  cwd: string,
  io: UserIOContext,
  identity: string,
): Promise<UserSyncDiskState> {
  const userDir = join(cwd, ".arc", "user", identity);
  let diskManifest: SyncManifest | null = null;

  try {
    const diskResult = await serialize(userDir, io.readDir, io.readFile);
    if (Object.keys(diskResult.manifest.files).length > 0) {
      diskManifest = diskResult.manifest;
    }
  } catch {
    diskManifest = null;
  }

  const note = await findNearestUserNote({ cwd, io, identity });
  if (!note) {
    return diskManifest ? "different" : "same";
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(note.content) as unknown;
  } catch {
    return "different";
  }

  if (!diskManifest) {
    return "different";
  }

  return manifestsEqual(parsed as SyncManifest, diskManifest) ? "same" : "different";
}

async function readRefHash(
  io: UserIOContext,
  ref: string,
): Promise<string | null> {
  try {
    const { stdout } = await io.exec("git", ["rev-parse", "--verify", ref]);
    return stdout || null;
  } catch {
    return null;
  }
}

async function isAncestor(
  io: UserIOContext,
  maybeAncestor: string,
  maybeDescendant: string,
): Promise<boolean> {
  try {
    await io.exec("git", ["merge-base", "--is-ancestor", maybeAncestor, maybeDescendant]);
    return true;
  } catch {
    return false;
  }
}

async function deleteRef(
  io: UserIOContext,
  ref: string,
): Promise<void> {
  try {
    await io.exec("git", ["update-ref", "-d", ref]);
  } catch {
    // Best-effort cleanup for temp refs.
  }
}

function manifestsEqual(
  left: SyncManifest,
  right: SyncManifest,
): boolean {
  return JSON.stringify(normalizeManifest(left)) === JSON.stringify(normalizeManifest(right));
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

async function listBackupFiles(
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

async function listRemoteUserIdentities(
  io: UserIOContext,
): Promise<UserStatusRemoteIdentity[]> {
  try {
    const { stdout } = await io.exec("git", ["ls-remote", "origin"]);
    return stdout
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => line.split(/\s+/u))
      .filter((parts): parts is [string, string] => parts.length >= 2)
      .filter(([, ref]) => ref.startsWith("refs/notes/arc/user/"))
      .map(([hash, ref]) => ({
        identity: ref.slice("refs/notes/arc/user/".length),
        ref,
        hash: hash.slice(0, 7),
      }))
      .sort((left, right) => left.identity.localeCompare(right.identity));
  } catch {
    return [];
  }
}

interface BuildUserStatusInput {
  identity: string;
  diskState: UserSyncDiskState;
  refState: UserSyncRefState | null;
  remoteChecked: boolean;
  savedCommit: string | null;
  savedFromAncestor: boolean;
  backupFiles: string[];
  remoteIdentities: UserStatusRemoteIdentity[];
}

export function buildUserStatusResult(
  input: BuildUserStatusInput,
): UserStatusResult {
  const {
    identity,
    diskState,
    refState,
    remoteChecked,
    savedCommit,
    savedFromAncestor,
    backupFiles,
    remoteIdentities,
  } = input;

  const headline = determineUserStatusHeadline(refState, diskState);
  const summary = remoteChecked
    ? `${identity}: ${headline}`
    : `${identity}: ${headline} (offline)`;

  const detailLines: string[] = [];
  const actionHint = determineUserStatusAction(headline, diskState, remoteChecked);

  if (!remoteChecked) {
    detailLines.push("Remote check skipped (`--offline`).");
  }

  if (savedCommit) {
    if (savedFromAncestor) {
      detailLines.push(`Saved snapshot is from ${savedCommit}, not current HEAD.`);
    }
  } else if (diskState === "different") {
    detailLines.push("No saved snapshot exists yet for this identity.");
  }

  if (backupFiles.length > 0) {
    detailLines.push(`Pre-load backup present: ${backupFiles.join(", ")}`);
  }

  if (remoteIdentities.length > 0) {
    const identities = remoteIdentities
      .map((entry) => `${entry.identity} (${entry.hash})`)
      .join(", ");
    detailLines.push(`Remote identities: ${identities}`);
  }

  if (actionHint) {
    detailLines.push(`Next step: ${actionHint}`);
  }

  return {
    identity,
    headline,
    summary,
    actionHint,
    detailLines,
    remoteChecked,
    refState,
    diskState,
    savedCommit,
    savedFromAncestor,
    backupFiles,
    remoteIdentities,
  };
}

function determineUserStatusHeadline(
  refState: UserSyncRefState | null,
  diskState: UserSyncDiskState,
): UserStatusHeadline {
  if (refState === "remote-unavailable") return "remote unavailable";
  if (refState === "diverged") return "conflict";
  if (refState === "remote-ahead") return "remote ahead";
  if (diskState === "different" || refState === "local-ahead") return "disk ahead";
  return "in sync";
}

function determineUserStatusAction(
  headline: UserStatusHeadline,
  diskState: UserSyncDiskState,
  remoteChecked: boolean,
): string | null {
  switch (headline) {
    case "remote ahead":
      return "run `arc user pull`";
    case "disk ahead":
      return "run `arc user save`";
    case "conflict":
      return "run `arc user fetch` for non-destructive inspection";
    case "remote unavailable":
      return diskState === "different"
        ? "run `arc user save`, then retry online when the remote is reachable"
        : "retry online to confirm remote status";
    case "in sync":
      return remoteChecked ? null : "rerun without `--offline` to confirm remote status";
  }
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

/**
 * Build user-facing summary for `arc user status`.
 *
 * @param result - Status result
 * @returns Formatted message for terminal display
 */
export function buildUserStatusSummary(result: UserStatusResult): string {
  const lines = [result.summary, ...result.detailLines];
  return lines.join("\n");
}
