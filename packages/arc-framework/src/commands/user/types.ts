import type { DirEntry, SkipWarning } from "../../lib/git/index.js";
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

/** Options for the load operation. */
export interface UserLoadOptions {
  cwd: string;
  io: UserIOContext;
  identity: string;
  /** Maximum number of ancestor commits to walk. Defaults to DEFAULT_MAX_ANCESTOR_WALK. */
  maxAncestorWalk?: number;
  /** Invoked when the ancestor walk hit its cap without finding a note. */
  onWalkExhausted?: (walked: number, maxWalk: number) => void;
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
  /** Force-push even when remote has diverged. */
  force?: boolean;
}

/** Options for the fetch operation. */
export interface UserFetchOptions {
  io: UserIOContext;
  /** Identity whose notes to fetch (may differ from caller's identity for cross-user pull). */
  identity: string;
  /** Force-fetch even when local ref has diverged from remote. */
  force?: boolean;
}

/** Options for the pull operation. */
export interface UserPullOptions extends UserFetchOptions {
  cwd: string;
  maxAncestorWalk?: number;
  /** Invoked when the ancestor walk hit its cap without finding a note. */
  onWalkExhausted?: (walked: number, maxWalk: number) => void;
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

export type UserSessionInitState =
  | "disabled"
  | "clean"
  | "remote-ahead"
  | "conflict"
  | "remote-unavailable";

export interface UserSessionInitStatusResult {
  identity: string;
  state: UserSessionInitState;
  summary: string;
  detailLines: string[];
  actionHint: string | null;
  shouldPromptToPull: boolean;
}

export interface UserSessionInitStatusOptions {
  cwd: string;
  io: UserIOContext;
  identity: string;
  remoteSyncEnabled: boolean;
}
