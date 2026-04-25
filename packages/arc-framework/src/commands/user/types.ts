import type { DirEntry, SkipWarning } from "../../lib/git/index.js";
import type { WorktreeSyncStatusResult } from "../../lib/git/worktree-sync.js";
import type { CoreIO } from "../../lib/types.js";

/** I/O dependencies for the user command. */
export interface UserIOContext extends CoreIO {
  /** Read directory entries (name + size) from a user directory. */
  readDir: (dirPath: string) => Promise<DirEntry[]>;
  /** Write content to a git note ref on a commit. */
  writeNote: (ref: string, content: string, commit: string) => Promise<void>;
  /** Read content from a git note ref on a commit. Returns null if no note. */
  readNote: (ref: string, commit: string) => Promise<string | null>;
}

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

/** Error specific to user save operations. */
export class UserSaveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserSaveError";
  }
}

/** Backup filename for pre-load snapshot of local state. */
export const BACKUP_FILENAME = ".pre-load-backup.json";

/** Result of a user load operation. */
export interface UserLoadResult {
  kind: "loaded";
  identity: string;
  commit: string;
  fileCount: number;
  /** Whether the note was found on an ancestor rather than HEAD. */
  fromAncestor: boolean;
  /** Number of commits between HEAD and the loaded ancestor note (0 when on HEAD). */
  ancestorDistance: number;
  /** Warnings about local files not present in the loaded manifest. */
  warnings: string[];
}

/** Returned when ancestor walking hit its configured cap without finding a reachable note. */
export interface UserLoadWalkExhausted {
  kind: "walk-exhausted";
  walked: number;
  maxWalk: number;
}

/** Discriminated outcome of a user load or pull attempt. */
export type UserLoadOutcome = UserLoadResult | UserLoadWalkExhausted;

/** Options for the load operation. */
export interface UserLoadOptions {
  cwd: string;
  io: UserIOContext;
  identity: string;
  /** Maximum number of ancestor commits to walk. Defaults to DEFAULT_MAX_ANCESTOR_WALK. */
  maxAncestorWalk?: number;
}

/** Structured return from the ancestor walk helper. */
export interface NearestNoteSearch {
  note: NearestUserNoteRef | null;
  walked: number;
  maxWalk: number;
  capped: boolean;
}

/** A reachable note discovered by the ancestor walk. */
export interface NearestUserNoteRef {
  content: string;
  commit: string;
  fromAncestor: boolean;
  ancestorDistance: number;
}

/** Options for the add operation. */
export interface UserAddOptions {
  cwd: string;
  io: UserIOContext;
  identity: string;
  internalTemplateDir: string;
  pmMode: string;
}

/** Options for the push operation. */
export interface UserPushOptions {
  io: UserIOContext;
  identity: string;
  /** Force-push even when remote and local notes conflict. */
  force?: boolean;
}

/** Options for the fetch operation. */
export interface UserFetchOptions {
  io: UserIOContext;
  /** Identity whose notes to fetch (may differ from caller's identity for cross-user pull). */
  identity: string;
  /** Force-fetch even when local and remote refs conflict. */
  force?: boolean;
}

/** Options for the pull operation. */
export interface UserPullOptions extends UserFetchOptions {
  cwd: string;
  maxAncestorWalk?: number;
}

/**
 * Internal ref-relation state between local and remote notes.
 *
 * The `"diverged"` variant names the git-level topology (both refs moved from a
 * common ancestor) and is mapped to `"conflict"` at every presentation layer —
 * see {@link UserStatusHeadline} for canonical user-facing vocabulary. Never
 * surface `diverged` directly to users; keep it as a code-level type name.
 */
export type UserSyncRefState =
  | "same"
  | "local-ahead"
  | "remote-ahead"
  | "diverged"
  | "remote-unavailable";

export type UserSyncDiskState = "same" | "different";

export type UserRemoteStatus =
  | "in sync"
  | "local ahead"
  | "remote ahead"
  | "conflict"
  | "remote unavailable";

export type UserDiskStatus =
  | "current"
  | "stale"
  | "local unsaved"
  | "mixed";

export interface UserSyncState {
  refState: UserSyncRefState;
  diskState: UserSyncDiskState;
  remoteStatus: UserRemoteStatus;
  diskStatus: UserDiskStatus;
  unsavedDirection: UserUnsavedDirection | null;
}

export interface InspectUserSyncOptions {
  cwd: string;
  io: UserIOContext;
  identity: string;
}

/**
 * Canonical user-facing status vocabulary.
 *
 * - `git note up to date` — local git note and working files are current, and remote matches.
 * - `remote note ahead` — remote has newer notes that local doesn't have yet.
 * - `local note ahead`  — local git note is newer than remote.
 * - `git note out of date` — working files do not match the latest local git note.
 * - `notes conflict`    — local and remote notes both moved from a common ancestor.
 * - `remote unavailable` — remote could not be reached for comparison.
 *
 * These terms must round-trip cleanly from user mental model to behavior — if
 * a new condition needs a headline, extend this union rather than overloading
 * an existing term.
 */
export type UserStatusHeadline =
  | "git note up to date"
  | "remote note ahead"
  | "local note ahead"
  | "git note out of date"
  | "notes conflict"
  | "remote unavailable";

export interface UserStatusRemoteIdentity {
  identity: string;
  ref: string;
  hash: string;
}

/**
 * Direction of mismatch between the disk manifest and the saved note when
 * headline is `local unsaved`.
 *
 * - `edits`    — disk has new files the saved note doesn't.
 * - `missing`  — saved note has files the disk doesn't.
 * - `modified` — the same file exists on both sides but with different content.
 * - `mixed`    — multiple mismatch kinds apply simultaneously.
 */
export type UserUnsavedDirection = "edits" | "missing" | "modified" | "mixed";

export interface UserStatusResult {
  identity: string;
  headline: UserStatusHeadline;
  remoteStatus: UserRemoteStatus;
  diskStatus: UserDiskStatus;
  summary: string;
  actionHint: string | null;
  detailLines: string[];
  remoteChecked: boolean;
  refState: UserSyncRefState | null;
  diskState: UserSyncDiskState;
  savedCommit: string | null;
  savedFromAncestor: boolean;
  /** Commits between HEAD and the saved note (0 when the note is at HEAD). */
  ancestorDistance: number;
  /** Human-readable "N ago" phrasing for the note commit's author date, when known. */
  savedAtRelative: string | null;
  /** Direction hint for `local unsaved`; null when not applicable. */
  unsavedDirection: UserUnsavedDirection | null;
  backupFiles: string[];
  remoteIdentities: UserStatusRemoteIdentity[];
  /**
   * Worktree sync probe result, when `session.remote_sync` is enabled and the
   * caller did not pass `--offline`. Omitted when no probe was run.
   */
  worktree?: WorktreeSyncStatusResult;
}

export interface UserStatusOptions {
  cwd: string;
  io: UserIOContext;
  identity: string;
  offline?: boolean;
  all?: boolean;
  /**
   * Whether `session.remote_sync` is enabled. Gates the worktree-sync probe.
   * Defaults to `false` (no probe, no qualifier line).
   */
  remoteSyncEnabled?: boolean;
}

export type UserSessionInitState =
  | "disabled"
  | "clean"
  | "remote-ahead"
  | "conflict"
  | "remote-unavailable";

/**
 * Optional qualifier on `UserSessionInitStatusResult.qualifier`.
 *
 * - `clean-at-current-head` — notes match local HEAD, but local HEAD itself is
 *   behind origin (worktree probe says `remote-ahead`). The "clean" verdict
 *   is true only with respect to the reachable ancestor, not the full remote
 *   ref. Set by the session-init composite when both signals coincide.
 */
export type UserSessionInitQualifier = "clean-at-current-head";

export interface UserSessionInitStatusResult {
  identity: string;
  state: UserSessionInitState;
  summary: string;
  detailLines: string[];
  actionHint: string | null;
  shouldPromptToPull: boolean;
  /**
   * Optional qualifier carrying cross-channel context (e.g., the worktree
   * sync state limits what the notes-clean verdict really means). Omitted
   * when not applicable; do not write `null`.
   */
  qualifier?: UserSessionInitQualifier;
}

export interface UserSessionInitStatusOptions {
  cwd: string;
  io: UserIOContext;
  identity: string;
  remoteSyncEnabled: boolean;
}
