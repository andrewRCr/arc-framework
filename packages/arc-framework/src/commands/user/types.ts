import { isRefusalCondition } from "../../lib/git/index.js";
import type { NotesPushRetryConfig, NotesPushRetryOffer } from "./notes-push-retry.js";
import type {
  AccessFn,
  DirEntry,
  GitExecInput,
  PushabilityCondition,
  SkipWarning,
  WorktreeSyncState,
} from "../../lib/git/index.js";
import type { WorktreeSyncStatusResult } from "../../lib/git/worktree-sync.js";
import type { CoreIO } from "../../lib/types.js";
import type {
  BranchBoundedNotesExportRefusalReason,
  BranchBoundedNotesExportTarget,
  PlanBranchBoundedNotesExportResult,
} from "../../lib/user-sync/branch-bounded-notes-export.js";
import type { NotesCompactionAdvisory } from "../../lib/user-sync/index.js";
import type { NoteSetRelation } from "../../lib/user-sync/note-set-relation.js";

/** I/O dependencies for the user command. */
export interface UserIOContext extends CoreIO {
  /** Read directory entries (name + size) from a user directory. */
  readDir: (dirPath: string) => Promise<DirEntry[]>;
  /** Write content to a git note ref on a commit. */
  writeNote: (ref: string, content: string, commit: string) => Promise<void>;
  /** Read content from a git note ref on a commit. Returns null if no note. */
  readNote: (ref: string, commit: string) => Promise<string | null>;
  /**
   * Stdin-fed git executor for batch object reads, reachability proofs, and
   * orphan-state-ref blob/tree plumbing. Optional — callers that omit it must
   * explicitly handle proof-unavailable or skip additive state-ref work.
   */
  execInput?: GitExecInput;
}

/** Result of a user save operation. */
export interface UserSaveResult {
  identity: string;
  commit: string;
  fileCount: number;
  warnings: SkipWarning[];
  /** Non-fatal bookkeeping issues after the verified note write succeeded. */
  bookkeepingWarnings?: string[];
}

/** Options for the save operation. */
export interface UserSaveOptions {
  cwd: string;
  io: UserIOContext;
  identity: string;
  /**
   * Bare work-unit name of the session's current WU. When omitted, save derives
   * it from active-meta / branch before serializing per-WU SESSION-NOTES.
   */
  currentWuName?: string;
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

/**
 * Register governing how a load-summary message reads:
 *
 * - `cleanup` — a routine reconcile that ran (e.g. a retired subdir removed).
 *   Normal operations, not a problem.
 * - `notice` — a local file left in place for the operator to consider.
 * - `warning` — a genuine problem (e.g. a malformed note that couldn't merge).
 */
export type LoadMessageLevel = "cleanup" | "notice" | "warning";

/** One load-summary message, tagged with the register that governs its display. */
export interface LoadMessage {
  level: LoadMessageLevel;
  text: string;
}

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
  /** Whether the annotated commit is reachable from current HEAD. */
  reachableFromHead?: boolean;
  /**
   * The branch HEAD is on at load time — names the recognizable anchor when the
   * note was loaded from a commit off the current branch's history. `null` on a
   * detached HEAD.
   */
  currentBranch?: string | null;
  /**
   * Load-summary messages, each tagged with a register ({@link LoadMessageLevel})
   * so the formatter can group routine cleanups, advisory notices, and genuine
   * warnings under distinct headings rather than one undifferentiated block.
   */
  messages: LoadMessage[];
}

/** Discriminated outcome of a user load or pull attempt. */
export type UserLoadOutcome = UserLoadResult;

/** Options for the load operation. */
export interface UserLoadOptions {
  cwd: string;
  io: UserIOContext;
  identity: string;
  /**
   * Bare work-unit name of the session's current WU (e.g. `worktree-foundation`),
   * derived from active-meta / branch by the caller. When set, note resolution
   * filters to notes carrying this WU's subdir and materialization restores only
   * this WU's subdir plus cross-WU flat files. Absent → first-note resolution and
   * full-manifest materialization (the pre-isolation behavior).
   */
  currentWuName?: string;
}

/** Structured return from user-note resolution. */
export interface NearestNoteSearch {
  note: NearestUserNoteRef | null;
}

/** A note selected from the annotated commits on the user notes ref. */
export interface NearestUserNoteRef {
  content: string;
  /** Commit annotated by the user note. */
  commit: string;
  /** Whether the annotated commit is reachable from current HEAD. */
  reachableFromHead: boolean;
  fromAncestor: boolean;
  /** Number of commits between HEAD and the annotated commit when reachable. */
  ancestorDistance: number;
}

/** Options for the add operation. */
export interface UserAddOptions {
  cwd: string;
  io: UserIOContext;
  identity: string;
  internalTemplateDir: string;
}

/** Options for the open operation (per-WU user workspace subdir). */
export interface UserOpenOptions {
  cwd: string;
  io: UserIOContext;
  identity: string;
  wuName: string;
  internalTemplateDir: string;
  /** Optional caller-composed SESSION-NOTES seed; defaults to the internal template. */
  sessionNotesSeed?: string;
}

/** Options for the close operation (retires a per-WU user workspace subdir). */
export interface UserCloseOptions {
  cwd: string;
  identity: string;
  wuName: string;
}

/** Options for dropping a slug-matched `USER-INBOX` entry. */
export interface UserInboxRemoveOptions {
  cwd: string;
  io: UserIOContext;
  identity: string;
  /**
   * The entry's slug. Title-keyed in v1 — the value is matched against the
   * entry's bold title; the OSD record model later moves the match onto a
   * `_Slug:_` field with no caller change.
   */
  slug: string;
}

/** Outcome of a `USER-INBOX` entry removal. */
export interface UserInboxRemoveResult {
  /** Whether a matching entry was found and dropped. */
  removed: boolean;
  /** True when the developer has no `USER-INBOX` file — a clean no-op, not an error. */
  inboxMissing: boolean;
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
  const blocking = conditions.filter(isRefusalCondition);
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
 * - `no-local-notes`: the canonical local notes ref is absent.
 * - `no-remote`: origin is unavailable.
 * - `refused`: a well-formed canonical topology failed publication preflight.
 */
export type UserPushResult =
  | { kind: "pushed" }
  | { kind: "noop" }
  | { kind: "no-local-notes" }
  | { kind: "no-remote" }
  | { kind: "refused"; reason: BranchBoundedNotesExportRefusalReason; message: string };

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
 * A superset taxonomy covering every notes-push result downstream rendering
 * may encounter. The branch-bounded paired adapter emits
 * `success` / `noop` / `no-remote` / `failed`; planning misses can produce
 * `refused` before the pusher fires; the remaining variants stay available
 * for stub-injected tests and legacy rendering paths. The skip variants are
 * added by `runPairedPush` itself when an upstream leg short-circuits the flow.
 */
export type PairedPushNotesPusherResult =
  | { status: "success" }
  | { status: "noop" }
  | { status: "ok-recovered"; via: "force" | "merge" }
  | { status: "cancelled" }
  | { status: "no-remote" }
  | { status: "refused"; reason: PairedPushNotesRefusalReason; message: string }
  | { status: "failed-nontty-conflict"; message?: string }
  | { status: "blocked"; conditions: PushabilityCondition[] }
  | { status: "failed"; error: Error };

/** Stable safety class for a paired notes leg that never reached transport. */
export type PairedPushNotesRefusalReason =
  | BranchBoundedNotesExportRefusalReason
  | "no-local-notes";

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
  /** Branch-bounded notes export target the notes leg actually attempts. */
  notesExportTarget: BranchBoundedNotesExportTarget;
}

/**
 * Pluggable notes-leg pusher injected into {@link RunPairedPushOptions}.
 *
 * Production wires the canonical notes-export adapter, which pushes the
 * already-planned immutable target. Tests inject a stub that emits a chosen
 * outcome.
 */
export type PairedPushNotesPusher = (
  context: PairedPushNotesContext,
) => Promise<PairedPushNotesPusherResult>;

/** Context handed to the injected marker-publish delegate. */
export interface PairedPushMarkerContext {
  io: UserIOContext;
  identity: string;
  cwd: string;
  /** Worktree branch the paired flow just pushed — the HEAD the about-to-fire notes push advances for. */
  worktreeBranch: string;
  /** Branch-bounded notes export target the notes leg actually attempts. */
  notesExportTarget: BranchBoundedNotesExportTarget;
}

/**
 * Pluggable sync-state-marker publisher injected into
 * {@link RunPairedPushOptions}.
 *
 * Fires after a successful worktree push and *before* the notes leg, so a
 * landed marker reads "about to push notes for HEAD X" to a sibling clone.
 * Production wires the `publishSyncStateMarker` adapter; tests inject a stub
 * (or omit it). Best-effort by contract — it must not throw, and its outcome
 * never affects the paired exit code: a marker-publish failure leaves behavior
 * exactly as before this leg existed.
 */
export type PairedPushMarkerPublisher = (
  context: PairedPushMarkerContext,
) => Promise<void>;

/** Planner seam deriving the canonical notes target after the worktree leg lands. */
export type PairedPushNotesExportPlanner = (
  context: Pick<PairedPushNotesContext, "io" | "identity" | "worktreeBranch">,
) => Promise<PlanBranchBoundedNotesExportResult>;

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
  /**
   * Present only when the notes leg is still failing after auto-retry — the
   * Primed-retry offer for the caller (agent/workflow layer) to
   * resolve conversationally. Absent when the notes leg resolved (success,
   * possibly after silent retries) or never fired (worktree / pre-check
   * short-circuit). When present, the partial-push marker is already
   * persisted: deferral is the no-op, a retry is a fresh push invocation.
   */
  retryOffer?: NotesPushRetryOffer;
  /**
   * Present on paired flows where the worktree leg landed but notes did not.
   * `true` means the local partial-push recovery marker was durably recorded;
   * `false` means recording was attempted but could not be written.
   */
  partialPushMarkerRecorded?: boolean;
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
   * When `true`, the worktree leg pushes with `-u` to publish and set
   * upstream in one operation, and the pushability `no-upstream-branch`
   * caller-resolvable condition is filtered out of the refusal check.
   * The orchestrator (sync `decideWorktree`) decides this based on
   * `pushInterlock` and current state. Default `false`.
   */
  setUpstream?: boolean;
  /**
   * Notes-leg pusher delegate. Production wires the branch-bounded export
   * adapter; tests inject a stub.
   */
  pushNotes: PairedPushNotesPusher;
  /**
   * Optional sync-state-marker publisher, fired after a successful worktree
   * push and before the notes leg. Absent → no marker is published
   * (degrade-safe: behavior is exactly as before this leg existed). See
   * {@link PairedPushMarkerPublisher}.
   */
  publishMarker?: PairedPushMarkerPublisher;
  /**
   * Optional planner seam for the canonical notes export target. Production
   * uses the real git planner; tests inject a fixed target.
   */
  planNotesExport?: PairedPushNotesExportPlanner;
  /**
   * Auto-retry budget for a transient notes-leg failure. Defaults to
   * `DEFAULT_NOTES_PUSH_RETRY` (two silent retries with short backoff) when
   * omitted. See {@link NotesPushRetryConfig}.
   */
  notesRetryConfig?: NotesPushRetryConfig;
  /**
   * Delay primitive for auto-retry backoff. Injectable so tests run without
   * real timers; defaults to a real `setTimeout`-backed sleep.
   */
  sleep?: (ms: number) => Promise<void>;
}

/** Options for the fetch operation. */
export interface UserFetchOptions {
  io: UserIOContext;
  /** Identity whose notes to fetch (may differ from caller's identity for cross-user pull). */
  identity: string;
}

/** Structured result of fetching remote user notes into the local notes ref. */
export type UserFetchResult =
  | { kind: "fast-forwarded"; localTip: string; remoteTip: string }
  | { kind: "created"; remoteTip: string }
  | { kind: "refused-local-ahead"; localTip: string; remoteTip: string }
  | { kind: "refused-diverged"; localTip: string; remoteTip: string }
  | { kind: "remote-unavailable"; error: Error };

/** Options for the pull operation. */
export interface UserPullOptions extends UserFetchOptions {
  cwd: string;
  /** Current WU name forwarded to the post-fetch load. See {@link UserLoadOptions.currentWuName}. */
  currentWuName?: string;
}

/** Result of a pull: a loaded note, no note after fetch, or a fetch refusal/failure. */
export type UserPullResult = UserLoadResult | null | UserFetchResult;

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
  /** Content relation carried for divergence or recognized local-ahead branch-export residue. */
  contentRelation?: NoteSetRelation;
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
  contentRelation?: NoteSetRelation;
  coherenceState?: UserSyncCoherenceState;
  diskState: UserSyncDiskState;
  remoteStatus: UserRemoteStatus;
  diskStatus: UserDiskStatus;
  unsavedDirection: UserUnsavedDirection | null;
  /**
   * Freshness of the latest local note relative to HEAD. Lets `decideSyncAction`
   * recognize a note sitting on a HEAD ancestor as actionable (a save attaches a
   * note to current HEAD) rather than "already up to date." Populated by
   * `inspectUserSyncState`; optional so partial constructors stay valid.
   */
  localNoteFreshness?: UserSessionLocalNoteFreshness;
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
 * - `notes diverged (reconciliation required)` — refs diverged without contested note content.
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
  | "notes diverged (reconciliation required)"
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
  contentRelation?: NoteSetRelation;
  diskState: UserSyncDiskState;
  savedCommit: string | null;
  savedFromAncestor: boolean;
  /** Commits between HEAD and the saved note (0 when the note is at HEAD). */
  ancestorDistance: number;
  /** Whether the saved note's annotated commit is reachable from current HEAD, when known. */
  savedReachableFromHead?: boolean;
  /** Human-readable "N ago" phrasing for the note commit's author date, when known. */
  savedAtRelative: string | null;
  /** Direction hint for `local unsaved`; null when not applicable. */
  unsavedDirection: UserUnsavedDirection | null;
  backupFiles: string[];
  remoteIdentities: UserStatusRemoteIdentity[];
  /** Local notes-ref history-size advisory for manual compaction. */
  compactionAdvisory?: NotesCompactionAdvisory;
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
  /**
   * `commit` resolved through `git rev-parse --short` (honors `core.abbrev`).
   * Display sites should use this instead of slicing `commit` to a fixed length
   * so output matches what Git and Git-aware editors show. Null whenever
   * `commit` is null (the `missing` state).
   */
  commitShort: string | null;
  ancestorDistance: number;
  reachableFromHead?: boolean;
  /**
   * The branch HEAD is on — names the recognizable anchor for the
   * `outside-head-ancestry` state. `null` on a detached HEAD; omitted for the
   * states that don't surface ancestry context.
   */
  currentBranch?: string | null;
  /**
   * For the `missing` state: whether the freshness query was work-unit-scoped
   * (a current WU resolved). `false` means identity-scoped (no current WU — an
   * errand or between-WUs), where `missing` speaks to the identity's whole
   * notes ref. Omitted on the non-`missing` states.
   */
  wuScoped?: boolean;
  /**
   * For a WU-scoped `missing` state: whether the WU's SESSION-NOTES.md is
   * present on disk — seeded by spawn/start but not yet saved to the notes ref.
   * `true` is the expected fresh-spawn state; `false` means no personal context
   * exists for the WU on disk or in the ref (an unexpected gap). Omitted when
   * not WU-scoped or not `missing`.
   */
  seedPresent?: boolean;
}

/**
 * Raw clean-arm notes/disk divergence signal (D3), carried so the session-init
 * orchestrator — which knows the active WU name — can resolve the auto-load vs.
 * surface verdict. Present only on the `clean` arm when `refState === "same"`
 * and the disk diverges from the note (`direction !== null`); omitted otherwise.
 */
export interface UserSessionNotesDrift {
  /** Whole-tree disk-vs-note direction. */
  direction: UserUnsavedDirection;
  /** Manifest paths present in the note and absent on disk (the missing set). */
  missingFiles: string[];
  /** Manifest paths present on disk and absent from the note (disk-ahead extras). */
  extraFiles: string[];
  /** Manifest paths present on both sides with differing content. */
  modifiedFiles: string[];
}

/**
 * Advisory surfaced when a clean-arm notes/disk divergence is neither a safe
 * auto-load nor fully silent — rendered in session-init orientation's advisory tier.
 *
 * `register: "expected"` is the calm parallel-session steady state (fresh seed /
 * sibling identity-global churn); `"caution"` is genuine inspect-before-rely drift.
 * `direction` carries the whole-tree unsaved kind (not only `mixed` / `missing`).
 */
export interface UserSessionNotesDriftSurface {
  direction: Exclude<UserUnsavedDirection, "behind">;
  register: "expected" | "caution";
}

export interface UserSessionInitStatusResult {
  identity: string;
  state: UserSessionInitState;
  /**
   * Raw notes-ref topology, parallel to the action-dispatch `state` field.
   * `state` collapses `same` and `local-ahead` to `clean` because both mean
   * "no pull needed" — the action enum encodes pull-direction dispatch, not
   * raw state. Consumers that need to distinguish the collapsed cases
   * (e.g., surfacing local-ahead notes informationally) check `refState`
   * within the `clean` arm. Omitted when remote sync is disabled
   * (`state === "disabled"`); present on every other arm.
   */
  refState?: UserSyncRefState;
  /** Content relation carried for divergence or recognized local-ahead branch-export residue. */
  contentRelation?: NoteSetRelation;
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
  /**
   * Raw clean-arm notes/disk divergence signal (D3). Present only when
   * `refState === "same"` and the disk diverges from the note; the orchestrator
   * resolves it against the active WU name into `loadNeeded` and any
   * `notesDriftSurface`. Omitted when there is no divergence or off the clean arm.
   */
  notesDrift?: UserSessionNotesDrift;
}

export interface UserSessionInitStatusOptions {
  cwd: string;
  io: UserIOContext;
  identity: string;
  remoteSyncEnabled: boolean;
}
