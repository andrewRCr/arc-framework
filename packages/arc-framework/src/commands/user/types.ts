import type {
  AccessFn,
  DirEntry,
  PushabilityCondition,
  SkipWarning,
  WorktreeSyncState,
} from "../../lib/git/index.js";
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

/** Error thrown when a saved git note cannot be verified against its readback. */
export class UserSaveVerificationError extends UserSaveError {
  constructor(message: string) {
    super(message);
    this.name = "UserSaveVerificationError";
  }
}

/**
 * Error thrown when a loaded note's materialized files do not match the
 * manifest. Symmetric to {@link UserSaveVerificationError} on the load
 * boundary — guards against torn writes during materialization, partial
 * permissions, and disk-full mid-write so `LocalSyncState` cannot advance
 * past an actually-incomplete materialization.
 */
export class UserLoadVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserLoadVerificationError";
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
  /** Number of note-ref history entries walked before finding this note. */
  noteHistoryDistance?: number;
  /** Whether the annotated commit is reachable from current HEAD. */
  reachableFromHead?: boolean;
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

/** A note discovered by walking the notes ref's own history. */
export interface NearestUserNoteRef {
  content: string;
  /** Commit annotated by the user note. */
  commit: string;
  /** Whether the annotated commit is reachable from current HEAD. */
  reachableFromHead: boolean;
  fromAncestor: boolean;
  /** Number of commits between HEAD and the annotated commit when reachable. */
  ancestorDistance: number;
  /** Number of note-ref history entries walked before finding this note. */
  noteHistoryDistance: number;
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
  /** Repository root, used to clear local recovery markers after a successful push. */
  cwd?: string;
  /** Force-push even when remote and local notes conflict. */
  force?: boolean;
  /**
   * Path-existence check for the pushability pre-check matrix. When omitted,
   * the pre-check is skipped (legacy callers without an access seam continue
   * to work). Real wirings inject `fs.access` from `node:fs/promises`.
   */
  access?: AccessFn;
  /**
   * Current worktree branch name. When provided, the pushability matrix runs
   * the notes-vs-worktree alignment probe (HEAD vs. `origin/<branch>`) so
   * notes push refuses to publish against an unpushed or stale base. `force`
   * does not bypass — force is scoped to notes-ref divergence recovery.
   */
  worktreeBranch?: string;
}

/**
 * Thrown by `runUserPush` when the pushability pre-check matrix detects one
 * or more `block`-disposition conditions. Carries the conditions so callers
 * can render structured guidance.
 */
export class UserPushBlockedError extends Error {
  readonly conditions: PushabilityCondition[];
  constructor(conditions: PushabilityCondition[]) {
    super(buildBlockedMessage(conditions));
    this.name = "UserPushBlockedError";
    this.conditions = conditions;
  }
}

function buildBlockedMessage(conditions: PushabilityCondition[]): string {
  const blocking = conditions.filter((c) => c.disposition === "block");
  if (blocking.length === 0) {
    return "Push blocked by pre-check matrix.";
  }
  const lines = blocking.map((c) => `- ${c.guidance}`);
  return `Push blocked — resolve before retrying:\n${lines.join("\n")}`;
}

/**
 * Outcome of `runUserPush`.
 *
 * - `pushed`: a push was sent to remote.
 * - `noop`: remote ref already matched local; nothing to push (partial-push
 *   marker is still cleared, since the recovery condition is resolved).
 */
export type UserPushResult = { kind: "pushed" } | { kind: "noop" };

/** Reason a paired-push leg was skipped without firing. */
export type PairedPushSkipReason =
  | "blocked-by-precheck"
  | "preceding-leg-failed"
  | "save-failed";

/** Outcome of the local save boundary that precedes a paired push. */
export type PairedPushSaveOutcome =
  | { status: "success"; result: UserSaveResult }
  | { status: "failed"; error: Error }
  | { status: "skipped"; reason: "blocked-by-precheck" };

/**
 * Outcome of the worktree leg in a paired worktree+notes push.
 *
 * - `success`: the push fired and completed.
 * - `failed`: the push fired but git returned an error. Underlying error preserved.
 * - `skipped`: the push did not fire. `reason` records why.
 */
export type PairedPushLegOutcome =
  | { status: "success" }
  | { status: "failed"; error: Error }
  | { status: "skipped"; reason: PairedPushSkipReason };

/**
 * Outcome surface of the injected notes-leg pusher delegate.
 *
 * Mirrors the discriminated `PushResult` surface of
 * `pushWithInteractiveRecovery` so the paired flow preserves the
 * single-leg recovery taxonomy (cancellation, conflict, blocked, no-remote)
 * for downstream rendering. The skip variants are added by
 * `runPairedPush` itself when an upstream leg short-circuits the flow.
 */
export type PairedPushNotesPusherResult =
  | { status: "success" }
  | { status: "noop" }
  | { status: "ok-recovered"; via: "force" | "merge" }
  | { status: "cancelled" }
  | { status: "no-remote" }
  | { status: "failed-nontty-conflict" }
  | { status: "blocked"; conditions: PushabilityCondition[] }
  | { status: "failed"; error: Error };

/** Outcome of the notes leg as reported in {@link PairedPushResult}. */
export type PairedPushNotesOutcome =
  | PairedPushNotesPusherResult
  | { status: "skipped"; reason: PairedPushSkipReason };

/** Context handed to the injected notes-leg pusher. */
export interface PairedPushNotesContext {
  io: UserIOContext;
  identity: string;
  cwd: string;
  access: AccessFn;
  /** Worktree branch the paired flow just pushed; threaded into the matrix. */
  worktreeBranch: string;
}

/**
 * Pluggable notes-leg pusher injected into {@link RunPairedPushOptions}.
 *
 * Production wires `pushWithInteractiveRecovery` so paired and single-leg
 * pushes share conflict-recovery prompts, idempotent no-op detection, and
 * pre-check refusal. Tests inject a stub that emits a chosen outcome.
 */
export type PairedPushNotesPusher = (
  context: PairedPushNotesContext,
) => Promise<PairedPushNotesPusherResult>;

/**
 * Discriminated result of a paired worktree+notes push.
 *
 * The push-ordering invariant is fixed: worktree always lands before notes,
 * so `notes` is `skipped` with `preceding-leg-failed` whenever `worktree`
 * fails. `exitCode` reflects the worst outcome — 0 only when both legs
 * succeed, 1 in every other case (including pre-check block).
 */
export interface PairedPushResult {
  /** Save result for the local user directory before either push leg fires. */
  save: PairedPushSaveOutcome;
  worktree: PairedPushLegOutcome;
  notes: PairedPushNotesOutcome;
  /** Pushability conditions surfaced by the pre-check matrix. */
  conditions: PushabilityCondition[];
  /** Worst-outcome exit code: 0 iff both legs succeeded. */
  exitCode: number;
}

/** Options for the paired-push helper. */
export interface RunPairedPushOptions {
  io: UserIOContext;
  identity: string;
  /** Repository root, used to record/clear the partial-push marker. */
  cwd: string;
  /** Path-existence check for the pushability pre-check matrix. */
  access: AccessFn;
  /** Worktree branch name to push. */
  branch: string;
  /** Pre-resolved worktree sync state for force-push detection. */
  worktreeSyncState?: WorktreeSyncState;
  /**
   * Notes-leg pusher delegate. Production wires
   * `pushWithInteractiveRecovery` so the paired flow inherits its
   * conflict-recovery and idempotent-noop semantics; tests inject a stub.
   */
  pushNotes: PairedPushNotesPusher;
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

/**
 * Coherence conditions layered on top of raw notes-ref topology.
 *
 * These are not additional `UserSyncRefState` or `UserSessionInitState`
 * values; they explain recovery context for an existing spine verdict.
 */
export type UserSyncCoherenceState = "partial-push" | "partial-push-unverified";

export type UserSessionInitState =
  | "disabled"
  | "clean"
  | "remote-ahead"
  | "conflict"
  | "remote-unavailable";

/**
 * Shared remote-sync decision spine used by full status, session-init status,
 * and direction-aware sync orchestration.
 */
export interface UserSyncSpine {
  /** Session-init-compatible five-state verdict. */
  state: UserSessionInitState;
  /** Raw notes-ref topology feeding the spine, or `null` when remote probing is disabled. */
  refState: UserSyncRefState | null;
  /** Coherence condition layered on the ref topology, when recovery context exists. */
  coherenceState?: UserSyncCoherenceState;
  /** Full-mode remote-status projection derived from the same ref topology. */
  remoteStatus: UserRemoteStatus;
  /** Whether session init should ask before pulling user notes. */
  shouldPromptToPull: boolean;
}

export interface UserSyncState {
  /** Session-init-compatible five-state verdict for the inspected refs. */
  spineState: UserSessionInitState;
  refState: UserSyncRefState;
  coherenceState?: UserSyncCoherenceState;
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
 * - `behind`   — note advanced past the materialized snapshot's `sourceCommit`
 *                while disk still matches the materialized manifest. The disk
 *                is older than the latest local note (typically because a fetch
 *                brought a newer note from another machine); a load reconciles.
 */
export type UserUnsavedDirection = "edits" | "missing" | "modified" | "mixed" | "behind";

export interface UserStatusResult {
  identity: string;
  /** Session-init-compatible five-state verdict shared with `runUserSessionInitStatus`. */
  spineState: UserSessionInitState;
  coherenceState?: UserSyncCoherenceState;
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
  /** Number of note-ref history entries walked before finding this note, when known. */
  noteHistoryDistance?: number;
  /** Whether the saved note's annotated commit is reachable from current HEAD, when known. */
  savedReachableFromHead?: boolean;
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
  /**
   * Inferred cause of user-notes-ref divergence — populated only when the
   * helper was invoked (i.e., when a divergent ref state was detected). JSON
   * consumers (`arc status --json`) inherit this field for downstream tooling.
   */
  userSyncCause?: import("../../lib/user-sync/index.js").UserSyncCause;
  /** Confidence of the inferred cause, when {@link userSyncCause} is present. */
  userSyncCauseConfidence?: import("../../lib/user-sync/index.js").UserSyncCauseConfidence;
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
  /**
   * Render the verbose three-tier (refs / disk / working files) detail block.
   *
   * The default (`true`) preserves the verbose detail block for callers that
   * haven't migrated to the action-oriented presentation (composite `arc
   * status`, programmatic consumers). The `arc user status` CLI handler
   * passes `false` unless `--verbose` is set.
   */
  verbose?: boolean;
}

/**
 * Optional qualifier on `UserSessionInitStatusResult.qualifier`.
 *
 * - `clean-at-current-head` — notes match local HEAD, but local HEAD itself is
 *   behind origin (worktree probe says `remote-ahead`). The "clean" verdict
 *   is true only with respect to the reachable ancestor, not the full remote
 *   ref. Set by the session-init composite when both signals coincide.
 */
export type UserSessionInitQualifier = "clean-at-current-head";

export type UserSessionLocalNoteFreshnessState =
  | "missing"
  | "current-head"
  | "ancestor"
  | "outside-head-ancestry";

export interface UserSessionLocalNoteFreshness {
  state: UserSessionLocalNoteFreshnessState;
  commit: string | null;
  ancestorDistance: number;
  noteHistoryDistance?: number;
  reachableFromHead?: boolean;
}

export interface UserSessionInitStatusResult {
  identity: string;
  state: UserSessionInitState;
  /** Coherence detail preserved without expanding the five-state session-init surface. */
  coherenceState?: UserSyncCoherenceState;
  summary: string;
  detailLines: string[];
  actionHint: string | null;
  shouldPromptToPull: boolean;
  /**
   * Freshness of the newest local user note relative to current HEAD. Present
   * on remote-enabled session probes so workflows can distinguish "refs
   * match" from "current-HEAD note exists" without overloading `state`.
   */
  localNoteFreshness?: UserSessionLocalNoteFreshness;
  /**
   * Optional qualifier carrying cross-channel context (e.g., the worktree
   * sync state limits what the notes-clean verdict really means). Omitted
   * when not applicable; do not write `null`.
   */
  qualifier?: UserSessionInitQualifier;
  /**
   * Cross-machine resume hint for the `clean` arm: when `refState === "same"`,
   * `true` means the on-disk user files lag behind the latest local note (a
   * fresh note arrived via a worktree pull but was never materialized) and
   * `arc user load` would surface that content non-destructively; `false`
   * means the disk already matches the latest note. Omitted on the
   * `local-ahead` arm (no cross-machine gap) and on every non-clean spine
   * state. Workflow consumers use a truthy check
   * (`if (user.value.loadNeeded)`) so absent and explicit-false collapse
   * symmetrically.
   */
  loadNeeded?: boolean;
}

export interface UserSessionInitStatusOptions {
  cwd: string;
  io: UserIOContext;
  identity: string;
  remoteSyncEnabled: boolean;
}
