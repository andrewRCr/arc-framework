import { join } from "node:path";

import { serialize, shortHash, type SyncManifest } from "../../lib/git/index.js";
import {
  DEFAULT_FETCH_TIMEOUT_MS,
  runWorktreeSyncStatus,
  type WorktreeSyncStatusResult,
} from "../../lib/git/worktree-sync.js";
import {
  inferUserSyncCause,
  type UserSyncCause,
  type UserSyncCauseConfidence,
  type UserSyncRefRelation,
} from "../../lib/user-sync/index.js";
import { formatRelativeTime } from "./relative-time.js";
import {
  clearPartialPushMarker,
  findNearestUserNote,
  hashSyncManifest,
  listBackupFiles,
  readLocalSyncState,
} from "./save-load.js";
import { notesRef } from "./shared.js";
import type {
  InspectUserSyncOptions,
  UserDiskStatus,
  UserIOContext,
  UserSessionLocalNoteFreshness,
  UserRemoteStatus,
  UserSessionInitStatusOptions,
  UserSessionInitStatusResult,
  UserStatusHeadline,
  UserStatusOptions,
  UserStatusRemoteIdentity,
  UserStatusResult,
  UserSyncCoherenceState,
  UserSyncSpine,
  UserSyncDiskState,
  UserSyncRefState,
  UserSyncState,
  UserUnsavedDirection,
} from "./types.js";

const TEMP_SYNC_REF_PREFIX = "refs/arc-sync-temp";

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
  const [refInspection, diskInspection] = await Promise.all([
    inspectUserSyncRefsDetailed(io, identity),
    inspectDiskVsLocalSnapshot(cwd, io, identity),
  ]);
  const coherenceState = await resolveUserSyncCoherenceState({
    cwd,
    io,
    identity,
    refInspection,
  });
  const spine = computeUserSyncSpine({
    remoteSyncEnabled: true,
    refState: refInspection.state,
    coherenceState,
  });

  return {
    spineState: spine.state,
    refState: refInspection.state,
    ...(spine.coherenceState ? { coherenceState: spine.coherenceState } : {}),
    diskState: diskInspection.state,
    remoteStatus: spine.remoteStatus,
    diskStatus: diskInspection.diskStatus,
    unsavedDirection: diskInspection.direction,
  };
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
  const {
    cwd,
    io,
    identity,
    offline = false,
    all = false,
    remoteSyncEnabled = false,
    verbose,
  } = options;
  const shouldProbeWorktree = !offline && remoteSyncEnabled;
  const [
    diskInspection, search, backupFiles, remoteIdentities, refInspection, worktreeProbe,
    userNotesRefExists, localSyncState,
  ] = await Promise.all([
    inspectDiskVsLocalSnapshot(cwd, io, identity),
    findNearestUserNote({ cwd, io, identity }),
    listBackupFiles(cwd, io, identity),
    all ? listRemoteUserIdentities(io) : Promise.resolve([]),
    offline
      ? Promise.resolve(null)
      : inspectUserSyncRefsDetailed(io, identity, DEFAULT_FETCH_TIMEOUT_MS),
    shouldProbeWorktree
      ? runWorktreeSyncStatus({ exec: io.exec, remoteSyncEnabled: true })
      : Promise.resolve(null),
    inspectUserNotesRefExists(io, identity),
    readLocalSyncState(cwd, io, identity),
  ]);
  const spine = computeUserSyncSpine({
    remoteSyncEnabled: !offline,
    refState: refInspection?.state ?? null,
    coherenceState: refInspection
      ? await resolveUserSyncCoherenceState({ cwd, io, identity, refInspection })
      : undefined,
  });

  const note = search.note;
  const savedAtRelative = note ? await readCommitRelativeAge(io, note.commit) : null;
  const userSyncCause = await classifyUserSyncCause({
    io,
    offline,
    refInspection,
    note,
    localSyncState,
  });

  return buildUserStatusResult({
    spine,
    identity,
    diskState: diskInspection.state,
    diskStatus: diskInspection.diskStatus,
    refState: spine.refState,
    remoteChecked: !offline,
    savedCommit: note ? await shortHash(io.exec, note.commit) : null,
    savedFromAncestor: note ? note.fromAncestor : false,
    ancestorDistance: note?.ancestorDistance ?? 0,
    noteHistoryDistance: note?.noteHistoryDistance,
    savedReachableFromHead: note?.reachableFromHead,
    savedAtRelative,
    unsavedDirection: diskInspection.direction,
    backupFiles,
    remoteIdentities,
    worktree: worktreeProbe ?? undefined,
    remoteSyncEnabled,
    userNotesRefExists,
    ...(verbose === undefined ? {} : { verbose }),
    ...(userSyncCause ? { userSyncCause } : {}),
  });
}

/**
 * Build {@link inferUserSyncCause} inputs from the orchestrator's already-fetched
 * state and invoke the helper. Returns `undefined` when no helper invocation is
 * warranted (clean `same` ref state without offline mode) so the call site
 * suppresses the cause field on `UserStatusResult`.
 */
async function classifyUserSyncCause(input: {
  io: UserIOContext;
  offline: boolean;
  refInspection: UserSyncRefInspection | null;
  note: { commit: string } | null;
  localSyncState: { sourceCommit: string; savedAt?: string } | null;
}): Promise<{ cause: UserSyncCause; confidence: UserSyncCauseConfidence } | undefined> {
  const { io, offline, refInspection, note, localSyncState } = input;

  const sourceCommit = localSyncState?.sourceCommit ?? null;
  const savedAt = localSyncState?.savedAt ?? null;
  const latestNoteRefHistoryEntry = note?.commit ?? null;
  const headReachable = sourceCommit
    ? await isAncestor(io, sourceCommit, "HEAD")
    : false;

  if (offline) {
    return inferUserSyncCause({
      refRelation: "remote-unavailable",
      localRefHash: null,
      remoteRefHash: null,
      sourceCommit,
      savedAt,
      latestNoteRefHistoryEntry,
      headReachable,
      offline: true,
    });
  }

  if (!refInspection || refInspection.state === "same") return undefined;

  return inferUserSyncCause({
    refRelation: refInspection.state as UserSyncRefRelation,
    localRefHash: refInspection.localHash,
    remoteRefHash: refInspection.remoteHash,
    sourceCommit,
    savedAt,
    latestNoteRefHistoryEntry,
    headReachable,
    offline: false,
  });
}

async function inspectUserNotesRefExists(
  io: UserIOContext,
  identity: string,
): Promise<boolean> {
  const localRef = `refs/notes/${notesRef(identity)}`;
  return (await readRefHash(io, localRef)) !== null;
}

async function readCommitRelativeAge(
  io: UserIOContext,
  commit: string,
): Promise<string | null> {
  try {
    const { stdout } = await io.exec("git", ["show", "-s", "--format=%at", commit]);
    const seconds = Number.parseInt(stdout.trim(), 10);
    if (!Number.isFinite(seconds)) return null;
    return formatRelativeTime(new Date(seconds * 1000));
  } catch {
    return null;
  }
}

/**
 * Inspect only the remote session-init state for agent-driven session startup.
 *
 * This is a non-destructive probe: it respects `session.remote_sync`, uses a
 * read-only remote ref probe for easy cases, and falls back to a temp fetched
 * ref only when ancestry comparison is genuinely needed.
 *
 * @param options - Session-init status options
 * @returns Session-init-oriented remote state summary
 */
export async function runUserSessionInitStatus(
  options: UserSessionInitStatusOptions,
): Promise<UserSessionInitStatusResult> {
  const { cwd, io, identity, remoteSyncEnabled } = options;

  if (!remoteSyncEnabled) {
    return buildUserSessionInitStatusResult({
      identity,
      spine: computeUserSyncSpine({ remoteSyncEnabled: false, refState: null }),
    });
  }

  const [refInspection, localNoteFreshness, diskInspection] = await Promise.all([
    inspectUserSyncRefsDetailed(io, identity),
    inspectSessionLocalNoteFreshness({ cwd, io, identity }),
    inspectDiskVsLocalSnapshot(cwd, io, identity),
  ]);
  return buildUserSessionInitStatusResult({
    identity,
    spine: computeUserSyncSpine({
      remoteSyncEnabled: true,
      refState: refInspection.state,
    }),
    comparison: refInspection.comparison,
    localNoteFreshness,
    loadNeeded: computeSessionInitLoadNeeded({
      refState: refInspection.state,
      unsavedDirection: diskInspection.direction,
    }),
  });
}

/**
 * Compute the cross-machine resume hint surfaced on the `clean` arm of
 * {@link UserSessionInitStatusResult.loadNeeded}. Returns `undefined` outside
 * `refState === "same"` so the field is suppressed on the `local-ahead` arm
 * of `clean` and on every non-clean spine state — workflow consumers use a
 * truthy check, so absent and explicit-false collapse symmetrically.
 *
 * `direction === "behind"` already encodes the load-needed conditions:
 * note advanced past the materialized basis (note.commit !== sourceCommit
 * with sourceCommit ancestor of note.commit) and disk hash matches the
 * materialized hash (no local edits to clobber). Anything else — disk
 * matches note (already loaded), local edits, or mixed divergence — yields
 * `false`.
 */
function computeSessionInitLoadNeeded(input: {
  refState: UserSyncRefState | null;
  unsavedDirection: UserUnsavedDirection | null;
}): boolean | undefined {
  if (input.refState !== "same") return undefined;
  return input.unsavedDirection === "behind";
}

async function inspectSessionLocalNoteFreshness(input: {
  cwd: string;
  io: UserIOContext;
  identity: string;
}): Promise<UserSessionLocalNoteFreshness> {
  const { note } = await findNearestUserNote(input);
  if (!note) {
    return {
      state: "missing",
      commit: null,
      commitShort: null,
      ancestorDistance: 0,
    };
  }

  const base = {
    commit: note.commit,
    commitShort: await shortHash(input.io.exec, note.commit),
    ancestorDistance: note.ancestorDistance,
    noteHistoryDistance: note.noteHistoryDistance,
    reachableFromHead: note.reachableFromHead,
  };

  if (!note.reachableFromHead) {
    return { state: "outside-head-ancestry", ...base };
  }
  if (note.ancestorDistance > 0) {
    return { state: "ancestor", ...base };
  }
  return { state: "current-head", ...base };
}

interface UserSyncRefInspection {
  state: UserSyncRefState;
  comparison: "full" | "read-only" | "comparison-unavailable" | "remote-unavailable";
  localHash: string | null;
  remoteHash: string | null;
  /**
   * Distinguishes failure modes when `state` is `remote-unavailable` from the
   * notes-ref fetch path. Mirrors the worktree-sync vocabulary
   * (`WorktreeSyncStatusResult.failureReason`). Set on the catch path; omitted
   * when the fetch wasn't reached (pre-fetch fast-result classifications) or
   * succeeded.
   */
  failureReason?: "timeout" | "error";
}

/**
 * Compute the shared user-sync decision spine from remote-sync availability
 * and raw notes-ref topology.
 *
 * @param input - Remote-sync enablement plus the inspected notes-ref state
 * @returns Session-init-compatible spine plus full-mode remote projection
 */
export function computeUserSyncSpine(input: {
  remoteSyncEnabled: boolean;
  refState: UserSyncRefState | null;
  coherenceState?: UserSyncCoherenceState;
}): UserSyncSpine {
  const refState = input.remoteSyncEnabled ? input.refState : null;
  const coherenceState = normalizeCoherenceState(refState, input.coherenceState);
  const state = computeUserSyncSpineState(input.remoteSyncEnabled, refState);
  return {
    state,
    refState,
    ...(coherenceState ? { coherenceState } : {}),
    remoteStatus: deriveRemoteStatus(refState),
    shouldPromptToPull: state === "remote-ahead" || state === "conflict",
  };
}

function normalizeCoherenceState(
  refState: UserSyncRefState | null,
  coherenceState: UserSyncCoherenceState | undefined,
): UserSyncCoherenceState | undefined {
  if (refState === "local-ahead" && coherenceState === "partial-push") {
    return coherenceState;
  }
  if (refState === "remote-unavailable" && coherenceState === "partial-push-unverified") {
    return coherenceState;
  }
  return undefined;
}

async function resolveUserSyncCoherenceState(input: {
  cwd: string;
  io: UserIOContext;
  identity: string;
  refInspection: UserSyncRefInspection;
}): Promise<UserSyncCoherenceState | undefined> {
  const { cwd, io, identity, refInspection } = input;
  const syncState = await readLocalSyncState(cwd, io, identity);
  const marker = syncState?.partialPush;
  if (!marker) return undefined;

  if (!refInspection.localHash || marker.localRefHash !== refInspection.localHash) {
    await clearPartialPushMarker(cwd, io, identity);
    return undefined;
  }

  if (refInspection.state === "local-ahead") return "partial-push";
  if (refInspection.state === "remote-unavailable") return "partial-push-unverified";

  await clearPartialPushMarker(cwd, io, identity);
  return undefined;
}

function computeUserSyncSpineState(
  remoteSyncEnabled: boolean,
  refState: UserSyncRefState | null,
): UserSyncSpine["state"] {
  if (!remoteSyncEnabled) return "disabled";

  switch (refState) {
    case "remote-ahead":
      return "remote-ahead";
    case "diverged":
      return "conflict";
    case "remote-unavailable":
      return "remote-unavailable";
    case "same":
    case "local-ahead":
    case null:
      return "clean";
  }
}

function buildUserSessionInitStatusResult(input: {
  identity: string;
  spine: UserSyncSpine;
  comparison?: UserSyncRefInspection["comparison"];
  localNoteFreshness?: UserSessionLocalNoteFreshness;
  loadNeeded?: boolean;
}): UserSessionInitStatusResult {
  const { identity, spine } = input;
  const staleNoteAction = shouldWarnStaleLocalNote(spine, input.localNoteFreshness)
    ? "run `arc user save` or `arc sync` before relying on handoff"
    : null;

  const refStateSpread = spine.refState ? { refState: spine.refState } : {};

  switch (spine.state) {
    case "disabled":
      return {
        identity,
        state: spine.state,
        ...refStateSpread,
        ...(spine.coherenceState ? { coherenceState: spine.coherenceState } : {}),
        summary: `${identity}: session-init remote sync disabled`,
        detailLines: [
          "Config: `session.remote_sync: disabled`.",
          "Next step: skip the remote probe and continue with local tracked state.",
        ],
        actionHint: null,
        shouldPromptToPull: spine.shouldPromptToPull,
      };
    case "clean":
      return {
        identity,
        state: spine.state,
        ...refStateSpread,
        ...(spine.coherenceState ? { coherenceState: spine.coherenceState } : {}),
        summary: `${identity}: session-init local notes match remote notes`,
        detailLines: [
          ...(spine.refState === "local-ahead"
            ? ["Local notes are newer than remote notes, but no pull is needed before continuing."]
            : ["Remote notes match local notes."]),
          ...renderSessionLocalNoteFreshness(input.localNoteFreshness),
          ...(staleNoteAction ? [`Next step: ${staleNoteAction}.`] : []),
        ],
        actionHint: staleNoteAction,
        shouldPromptToPull: spine.shouldPromptToPull,
        ...(input.localNoteFreshness ? { localNoteFreshness: input.localNoteFreshness } : {}),
        ...(input.loadNeeded !== undefined ? { loadNeeded: input.loadNeeded } : {}),
      };
    case "remote-ahead":
      return {
        identity,
        state: spine.state,
        ...refStateSpread,
        ...(spine.coherenceState ? { coherenceState: spine.coherenceState } : {}),
        summary: `${identity}: session-init remote notes ahead of local notes`,
        detailLines: [
          "Remote notes are newer than local notes.",
          "Next step: ask whether to run `arc user pull` before continuing session-init.",
        ],
        actionHint: "run `arc user pull` before continuing session-init",
        shouldPromptToPull: spine.shouldPromptToPull,
        ...(input.localNoteFreshness ? { localNoteFreshness: input.localNoteFreshness } : {}),
      };
    case "conflict":
      return {
        identity,
        state: spine.state,
        ...refStateSpread,
        ...(spine.coherenceState ? { coherenceState: spine.coherenceState } : {}),
        summary: `${identity}: session-init local and remote notes conflict`,
        detailLines: [
          "Local and remote notes conflict (both moved since common ancestor).",
          "Next step: ask whether to run `arc user pull` and replace local notes before continuing.",
        ],
        actionHint: "run `arc user pull` to replace local notes before continuing session-init",
        shouldPromptToPull: spine.shouldPromptToPull,
        ...(input.localNoteFreshness ? { localNoteFreshness: input.localNoteFreshness } : {}),
      };
    case "remote-unavailable":
      if (input.comparison === "comparison-unavailable") {
        return {
          identity,
          state: spine.state,
          ...refStateSpread,
          ...(spine.coherenceState ? { coherenceState: spine.coherenceState } : {}),
          summary: `${identity}: session-init local-to-remote notes comparison unavailable here`,
          detailLines: [
            "Remote notes are reachable, but this environment blocks the local-to-remote notes ancestry comparison.",
            "Next step: continue with local tracked state, or retry session-init where git fetch/write access is allowed.",
          ],
          actionHint: "continue locally or retry session-init where git fetch/write access is allowed",
          shouldPromptToPull: spine.shouldPromptToPull,
          ...(input.localNoteFreshness ? { localNoteFreshness: input.localNoteFreshness } : {}),
        };
      }
      return {
        identity,
        state: spine.state,
        ...refStateSpread,
        ...(spine.coherenceState ? { coherenceState: spine.coherenceState } : {}),
        summary: `${identity}: session-init remote notes unavailable for comparison with local notes`,
        detailLines: [
          "Remote notes could not be reached for comparison with local notes.",
          "Next step: continue with local tracked state, or retry once the remote is reachable.",
        ],
        actionHint: "continue locally or retry once the remote is reachable",
        shouldPromptToPull: spine.shouldPromptToPull,
        ...(input.localNoteFreshness ? { localNoteFreshness: input.localNoteFreshness } : {}),
      };
  }
}

function shouldWarnStaleLocalNote(
  spine: UserSyncSpine,
  freshness: UserSessionLocalNoteFreshness | undefined,
): boolean {
  return spine.refState === "same" && freshness?.state === "ancestor";
}

function renderSessionLocalNoteFreshness(
  freshness: UserSessionLocalNoteFreshness | undefined,
): string[] {
  if (!freshness) return [];

  switch (freshness.state) {
    case "missing":
      return ["No local user note exists for this identity."];
    case "current-head":
      return ["Latest local user note is current with HEAD."];
    case "ancestor":
      return [
        `Latest local user note is from ${freshness.commitShort}, ${freshness.ancestorDistance} commit(s) behind HEAD.`,
      ];
    case "outside-head-ancestry": {
      const historyDetail = freshness.noteHistoryDistance === undefined
        ? ""
        : ` (${freshness.noteHistoryDistance} note update(s) back)`;
      return [
        `Latest local user note is from ${freshness.commitShort}, outside current HEAD ancestry${historyDetail}.`,
      ];
    }
  }
}

interface BuildUserStatusInput {
  spine?: UserSyncSpine;
  identity: string;
  diskState: UserSyncDiskState;
  diskStatus?: UserDiskStatus;
  refState: UserSyncRefState | null;
  coherenceState?: UserSyncCoherenceState;
  remoteChecked: boolean;
  savedCommit: string | null;
  savedFromAncestor: boolean;
  ancestorDistance?: number;
  noteHistoryDistance?: number;
  savedReachableFromHead?: boolean;
  savedAtRelative?: string | null;
  unsavedDirection?: UserUnsavedDirection | null;
  backupFiles: string[];
  remoteIdentities: UserStatusRemoteIdentity[];
  /**
   * Worktree-sync probe result. Pass `undefined` when no probe was attempted
   * (e.g. `--offline`, or `session.remote_sync: disabled`).
   */
  worktree?: WorktreeSyncStatusResult;
  /**
   * Whether `session.remote_sync` is enabled. Distinguishes the offline-with-
   * remote-sync case (emit a skip note) from the disabled case (emit nothing).
   */
  remoteSyncEnabled?: boolean;
  /**
   * Render the verbose three-tier (refs / disk / working files) detail block.
   *
   * When `false`, `summary` carries an action-oriented headline and
   * `detailLines` collapse to at most a context line, an optional pre-load
   * backup count, and a `Next step:` line. The default (`true`) preserves
   * the verbose detail block — used by the composite `arc status` surface
   * and any caller that hasn't migrated to the action-oriented presentation.
   */
  verbose?: boolean;
  /**
   * Whether `refs/notes/arc/user/{identity}` exists locally. When explicitly
   * `false`, prepends a one-time orientation hint as `detailLines[0]` pointing
   * at `arc user --help`. `undefined` and `true` suppress the hint — there is
   * no flag, env-var, or stored suppression beyond the probe boolean.
   */
  userNotesRefExists?: boolean;
  /**
   * Inferred cause + confidence for the user-notes-ref divergence. Set when the
   * call site invoked `inferUserSyncCause` (i.e., when ref state is divergent).
   * Drives the cause-aware detail line and action-oriented headline.
   */
  userSyncCause?: { cause: UserSyncCause; confidence: UserSyncCauseConfidence };
}

const FIRST_USE_ORIENTATION_HINT =
  "New here? Run `arc user --help` to learn about user notes.";

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
  const ancestorDistance = input.ancestorDistance ?? 0;
  const noteHistoryDistance = input.noteHistoryDistance;
  const savedReachableFromHead = input.savedReachableFromHead ?? true;
  const savedAtRelative = input.savedAtRelative ?? null;
  const unsavedDirection = input.unsavedDirection ?? null;

  const spine = input.spine ?? computeUserSyncSpine({
    remoteSyncEnabled: remoteChecked,
    refState,
    coherenceState: input.coherenceState,
  });
  const remoteStatus = spine.remoteStatus;
  const diskStatus = input.diskStatus ?? deriveDiskStatus(diskState, unsavedDirection);
  const headline = determineUserStatusHeadline(remoteStatus, diskStatus);
  const verbose = input.verbose ?? true;
  const offlineSuffix = remoteChecked ? "" : " (offline)";

  const causeAwareActionHeadline = input.userSyncCause
    ? renderCauseAwareActionHeadline(
      input.userSyncCause.cause,
      input.userSyncCause.confidence,
    )
    : null;
  const actionHeadline = causeAwareActionHeadline
    ?? renderActionOrientedHeadline(spine, diskStatus, unsavedDirection);

  const summary = verbose
    ? `${identity}: ${renderSummaryHeadline(headline, remoteChecked)}${offlineSuffix}`
    : `${identity}: ${actionHeadline}${offlineSuffix}`;

  const actionHint = determineUserStatusAction(
    spine,
    diskState,
    diskStatus,
    remoteChecked,
    unsavedDirection,
  );

  const baseDetailLines = verbose
    ? buildVerboseDetailLines({
      input,
      spine,
      headline,
      diskStatus,
      remoteStatus,
      remoteChecked,
      savedCommit,
      savedReachableFromHead,
      ancestorDistance,
      noteHistoryDistance,
      diskState,
      savedAtRelative,
      backupFiles,
      remoteIdentities,
      actionHint,
    })
    : buildDefaultDetailLines({
      spine,
      diskStatus,
      savedCommit,
      savedReachableFromHead,
      ancestorDistance,
      noteHistoryDistance,
      diskState,
      savedAtRelative,
      backupFiles,
      actionHint,
    });

  const causeLine = input.userSyncCause
    ? renderUserSyncCauseLine(
      input.userSyncCause.cause,
      input.userSyncCause.confidence,
    )
    : null;
  const detailLinesWithCause = causeLine
    ? [...baseDetailLines, causeLine]
    : baseDetailLines;

  const detailLines = input.userNotesRefExists === false
    ? [FIRST_USE_ORIENTATION_HINT, ...detailLinesWithCause]
    : detailLinesWithCause;

  return {
    identity,
    spineState: spine.state,
    ...(spine.coherenceState ? { coherenceState: spine.coherenceState } : {}),
    headline,
    remoteStatus,
    diskStatus,
    summary,
    actionHint,
    detailLines,
    remoteChecked,
    refState: spine.refState,
    diskState,
    savedCommit,
    savedFromAncestor,
    ancestorDistance,
    ...(noteHistoryDistance !== undefined ? { noteHistoryDistance } : {}),
    savedReachableFromHead,
    savedAtRelative,
    unsavedDirection,
    backupFiles,
    remoteIdentities,
    ...(input.worktree ? { worktree: input.worktree } : {}),
    ...(input.userSyncCause
      ? {
        userSyncCause: input.userSyncCause.cause,
        userSyncCauseConfidence: input.userSyncCause.confidence,
      }
      : {}),
  };
}

/**
 * Format the worktree qualifier detail line shared between `arc user status`
 * and `arc sync` direction reporting. Returns `null` when no qualifier should
 * be emitted (clean / local-ahead / no-upstream / detached / no-remote /
 * skipped, or `remote_sync: disabled`).
 */
export function formatWorktreeQualifierLine(input: {
  worktree: WorktreeSyncStatusResult | undefined;
  offline: boolean;
  remoteSyncEnabled: boolean;
}): string | null {
  const { worktree, offline, remoteSyncEnabled } = input;

  if (offline) {
    // Skip-note belongs to the case where remote sync is wired but the user
    // opted out for this invocation. Disabled config stays silent.
    return remoteSyncEnabled
      ? "Worktree remote comparison skipped (`--offline`); reported state reflects local worktree refs only."
      : null;
  }

  if (!worktree) return null;

  switch (worktree.state) {
    case "remote-ahead":
      return `Local worktree HEAD is behind its origin upstream by ${worktree.behind} commit(s).`;
    case "diverged":
      return `Local worktree HEAD and its origin upstream have diverged (${worktree.ahead} local ahead, ${worktree.behind} remote ahead).`;
    case "remote-unavailable":
      return formatRemoteUnavailableWorktreeLine(worktree.failureReason);
    default:
      return null;
  }
}

function formatRemoteUnavailableWorktreeLine(
  failureReason: WorktreeSyncStatusResult["failureReason"],
): string {
  if (failureReason === "timeout") {
    return "Worktree local-to-origin comparison timed out; retry or use `--offline` to report local worktree refs only.";
  }
  if (failureReason === "error") {
    return "Worktree local-to-origin comparison failed; investigate auth/network access before trusting remote worktree state.";
  }
  return "Worktree local-to-origin comparison unavailable; reported state may not reflect remote commits.";
}

function renderSummaryHeadline(
  headline: UserStatusHeadline,
  remoteChecked: boolean,
): string {
  switch (headline) {
    case "git note up to date":
      return remoteChecked
        ? "local notes match working files and remote notes"
        : "local notes match working files";
    case "remote note ahead":
      return "remote notes are ahead of local notes";
    case "local note ahead":
      return "local notes are ahead of remote notes";
    case "git note out of date":
      return "working files differ from local notes";
    case "notes conflict":
      return "local and remote notes conflict";
    case "remote unavailable":
      return "remote notes unavailable for comparison with local notes";
  }
}

/**
 * Map an inferred user-sync cause to its cause-aware detail line. Returns
 * `null` when no extra line should be appended (e.g. `unknown` falls back to
 * the existing taxonomy for messaging).
 */
function renderUserSyncCauseLine(
  cause: UserSyncCause,
  confidence: UserSyncCauseConfidence,
): string | null {
  switch (cause) {
    case "unfetched-local":
      return "Cause: remote notes ahead of local — run `arc user pull` to sync.";
    case "concurrent-local-writer":
      return "Cause: another writer has advanced the user-notes ref beyond local sync state.";
    case "cross-machine":
      return confidence === "low"
        ? "Cause: local and remote notes both moved (sync state stale; classification hedged)."
        : "Cause: local and remote notes both carry edits the other hasn't seen.";
    case "offline":
      return "Cause: cross-machine signals unavailable in offline mode.";
    case "unknown":
      return null;
  }
}

/**
 * Cause-aware action-oriented headline for non-verbose mode. Returns `null`
 * when no cause-specific headline applies — call site falls back to
 * {@link renderActionOrientedHeadline}.
 */
function renderCauseAwareActionHeadline(
  cause: UserSyncCause,
  confidence: UserSyncCauseConfidence,
): string | null {
  switch (cause) {
    case "unfetched-local":
      return "Remote notes ahead — pull to sync.";
    case "concurrent-local-writer":
      return "Concurrent writer detected on user-notes ref.";
    case "cross-machine":
      return confidence === "low"
        ? "Local and remote notes diverged (sync state stale)."
        : "Local and remote notes diverged across machines.";
    case "offline":
      return "Offline — cross-machine signals unavailable.";
    case "unknown":
      return null;
  }
}

function renderActionOrientedHeadline(
  spine: UserSyncSpine,
  diskStatus: UserDiskStatus,
  unsavedDirection: UserUnsavedDirection | null,
): string {
  if (spine.coherenceState === "partial-push") {
    return "Partial-push pending — local notes ahead of remote.";
  }
  if (spine.coherenceState === "partial-push-unverified") {
    return "Partial-push state unverified — remote notes unavailable.";
  }
  switch (spine.state) {
    case "conflict":
      return "Local and remote notes diverged.";
    case "remote-ahead":
      return "Remote notes ahead of local.";
    case "remote-unavailable":
      return "Remote notes unavailable for comparison.";
    case "disabled":
    case "clean":
      break;
  }
  switch (diskStatus) {
    case "stale":
      return unsavedDirection === "behind"
        ? "Local note ahead of working files."
        : "Working files reflect older saved state.";
    case "local unsaved":
      return "Working files have unsaved changes.";
    case "mixed":
      return "Working files and saved note both diverged.";
    case "current":
      break;
  }
  if (spine.refState === "local-ahead") return "Local notes ahead of remote.";
  return "Up to date.";
}

interface VerboseDetailInput {
  input: BuildUserStatusInput;
  spine: UserSyncSpine;
  headline: UserStatusHeadline;
  diskStatus: UserDiskStatus;
  remoteStatus: UserRemoteStatus;
  remoteChecked: boolean;
  savedCommit: string | null;
  savedReachableFromHead: boolean;
  ancestorDistance: number;
  noteHistoryDistance: number | undefined;
  diskState: UserSyncDiskState;
  savedAtRelative: string | null;
  backupFiles: string[];
  remoteIdentities: UserStatusRemoteIdentity[];
  actionHint: string | null;
}

function buildVerboseDetailLines(args: VerboseDetailInput): string[] {
  const {
    input,
    spine,
    headline,
    diskStatus,
    remoteStatus,
    remoteChecked,
    savedCommit,
    savedReachableFromHead,
    ancestorDistance,
    noteHistoryDistance,
    diskState,
    savedAtRelative,
    backupFiles,
    remoteIdentities,
    actionHint,
  } = args;
  const detailLines: string[] = [];

  if (!remoteChecked) {
    detailLines.push("Remote notes check skipped (`--offline`); local notes were not compared with remote notes.");
    detailLines.push("offline — local state only; cross-machine signals unavailable");
  }

  detailLines.push(renderHeadlineExplanation(headline, diskStatus));
  detailLines.push(renderWorkingFilesLine(diskStatus));
  detailLines.push(`Remote notes: ${renderRemoteStatus(remoteStatus)}.`);

  if (spine.coherenceState === "partial-push") {
    detailLines.push(
      "Partial push recovery: remote notes are still behind local notes after a prior publish attempt.",
    );
  } else if (spine.coherenceState === "partial-push-unverified") {
    detailLines.push(
      "Partial push recovery cannot be verified because remote notes are unavailable for comparison with local notes.",
    );
  }

  const worktreeQualifier = formatWorktreeQualifierLine({
    worktree: input.worktree,
    offline: !remoteChecked,
    remoteSyncEnabled: input.remoteSyncEnabled ?? false,
  });
  if (worktreeQualifier) {
    detailLines.push(worktreeQualifier);
  }

  if (savedAtRelative) {
    detailLines.push(`Saved ${savedAtRelative}.`);
  }

  if (savedCommit && savedReachableFromHead && ancestorDistance > 0) {
    detailLines.push(
      `Latest local user note is from ${savedCommit}, ${ancestorDistance} commit(s) back from HEAD.`,
    );
  } else if (savedCommit && savedReachableFromHead && ancestorDistance === 0) {
    detailLines.push("Latest local user note is current with HEAD.");
  } else if (savedCommit) {
    const historyDetail = noteHistoryDistance === undefined
      ? ""
      : ` (${noteHistoryDistance} note update(s) back)`;
    detailLines.push(
      `Latest local user note is from ${savedCommit}, outside current HEAD ancestry${historyDetail}.`,
    );
  } else if (!savedCommit && diskState === "different") {
    detailLines.push("No local user note exists yet for this identity.");
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

  return detailLines;
}

interface DefaultDetailInput {
  spine: UserSyncSpine;
  diskStatus: UserDiskStatus;
  savedCommit: string | null;
  savedReachableFromHead: boolean;
  ancestorDistance: number;
  noteHistoryDistance: number | undefined;
  diskState: UserSyncDiskState;
  savedAtRelative: string | null;
  backupFiles: string[];
  actionHint: string | null;
}

function buildDefaultDetailLines(args: DefaultDetailInput): string[] {
  const {
    spine,
    diskStatus,
    savedCommit,
    savedReachableFromHead,
    ancestorDistance,
    noteHistoryDistance,
    diskState,
    savedAtRelative,
    backupFiles,
    actionHint,
  } = args;
  const detailLines: string[] = [];

  if (!isHeadlineFullyClean(spine, diskStatus)) {
    const contextLine = renderDefaultContextLine({
      savedCommit,
      savedReachableFromHead,
      ancestorDistance,
      noteHistoryDistance,
      diskState,
      savedAtRelative,
    });
    if (contextLine) detailLines.push(contextLine);
  }

  if (backupFiles.length > 0) {
    detailLines.push(`Pre-load backup present (${backupFiles.length} files).`);
  }

  if (actionHint) {
    detailLines.push(`Next step: ${actionHint}`);
  }

  return detailLines;
}

function isHeadlineFullyClean(
  spine: UserSyncSpine,
  diskStatus: UserDiskStatus,
): boolean {
  return spine.state === "clean"
    && spine.refState !== "local-ahead"
    && spine.coherenceState === undefined
    && diskStatus === "current";
}

interface DefaultContextInput {
  savedCommit: string | null;
  savedReachableFromHead: boolean;
  ancestorDistance: number;
  noteHistoryDistance: number | undefined;
  diskState: UserSyncDiskState;
  savedAtRelative: string | null;
}

function renderDefaultContextLine(args: DefaultContextInput): string | null {
  const {
    savedCommit,
    savedReachableFromHead,
    ancestorDistance,
    noteHistoryDistance,
    diskState,
    savedAtRelative,
  } = args;

  if (!savedCommit) {
    return diskState === "different" ? "No local note saved yet." : null;
  }

  let position: string;
  if (savedReachableFromHead && ancestorDistance === 0) {
    position = `Note current with HEAD (${savedCommit})`;
  } else if (savedReachableFromHead && ancestorDistance > 0) {
    position = `Note from ${savedCommit}, ${ancestorDistance} commit(s) back from HEAD`;
  } else {
    const historyDetail = noteHistoryDistance === undefined
      ? ""
      : ` (${noteHistoryDistance} note update(s) back)`;
    position = `Note from ${savedCommit}, outside HEAD ancestry${historyDetail}`;
  }

  const savedSuffix = savedAtRelative ? `, saved ${savedAtRelative}` : "";
  return `${position}${savedSuffix}.`;
}

function renderHeadlineExplanation(
  headline: UserStatusHeadline,
  diskStatus: UserDiskStatus,
): string {
  switch (headline) {
    case "git note up to date":
      return "Local git note and working files are current.";
    case "remote note ahead":
      return "Remote git note is newer than the local git note.";
    case "local note ahead":
      return "Local git note is newer than the remote git note.";
    case "git note out of date":
      if (diskStatus === "stale") {
        return "Latest local git note is not current with the working files.";
      }
      if (diskStatus === "mixed") {
        return "Latest local git note is partly reflected in working files, alongside newer local changes.";
      }
      return "Latest local git note is not current with the working files.";
    case "notes conflict":
      return "Local and remote git notes both moved since common ancestor.";
    case "remote unavailable":
      return "Remote git-note status could not be checked against the local git note.";
  }
}

function renderWorkingFilesLine(diskStatus: UserDiskStatus): string {
  switch (diskStatus) {
    case "current":
      return "Working files match the latest local git note.";
    case "stale":
      return "Working files reflect an older local git note.";
    case "local unsaved":
      return "Working files have changed since the latest local git note.";
    case "mixed":
      return "Working files differ from the latest local git note in multiple ways.";
  }
}

function renderRemoteStatus(remoteStatus: UserRemoteStatus): string {
  switch (remoteStatus) {
    case "in sync":
      return "match local notes";
    case "local ahead":
      return "behind local notes";
    case "remote ahead":
      return "ahead of local notes";
    case "conflict":
      return "conflict with local notes";
    case "remote unavailable":
      return "unavailable for comparison with local notes";
  }
}

type PreFetchClassification =
  | { kind: "fast-result"; result: UserSyncRefInspection }
  | { kind: "must-fetch"; localHash: string; remoteHash: string };

function classifyPreFetch(
  localHash: string | null,
  remoteProbe: RemoteRefProbeResult,
): PreFetchClassification {
  if (remoteProbe.kind === "remote-unavailable") {
    return {
      kind: "fast-result",
      result: {
        state: "remote-unavailable",
        comparison: "remote-unavailable",
        localHash,
        remoteHash: null,
      },
    };
  }
  const remoteHash = remoteProbe.hash;
  if (!localHash && !remoteHash) {
    return {
      kind: "fast-result",
      result: { state: "same", comparison: "read-only", localHash, remoteHash },
    };
  }
  if (!localHash || !remoteHash) {
    return {
      kind: "fast-result",
      result: {
        state: localHash ? "local-ahead" : "remote-ahead",
        comparison: "read-only",
        localHash,
        remoteHash,
      },
    };
  }
  if (localHash === remoteHash) {
    return {
      kind: "fast-result",
      result: { state: "same", comparison: "read-only", localHash, remoteHash },
    };
  }
  return { kind: "must-fetch", localHash, remoteHash };
}

export async function inspectUserSyncRefsDetailed(
  io: UserIOContext,
  identity: string,
  fetchTimeoutMs?: number,
): Promise<UserSyncRefInspection> {
  const localRef = `refs/notes/${notesRef(identity)}`;
  const tempRef = `${TEMP_SYNC_REF_PREFIX}/${identity}`;

  const localHash = await readRefHash(io, localRef);
  const remoteProbe = await readRemoteRefHash(io, localRef);
  const classification = classifyPreFetch(localHash, remoteProbe);
  if (classification.kind === "fast-result") return classification.result;

  try {
    await boundedNotesRefFetch(io, localRef, tempRef, fetchTimeoutMs);
  } catch (err) {
    const isAbortError = err instanceof Error && err.name === "AbortError";
    if (isAbortError) {
      return {
        state: "remote-unavailable",
        comparison: "comparison-unavailable",
        localHash: classification.localHash,
        remoteHash: classification.remoteHash,
        failureReason: "timeout",
      };
    }
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("couldn't find remote ref")) {
      return {
        state: "local-ahead",
        comparison: "read-only",
        localHash: classification.localHash,
        remoteHash: null,
      };
    }
    return {
      state: "remote-unavailable",
      comparison: "comparison-unavailable",
      localHash: classification.localHash,
      remoteHash: classification.remoteHash,
      failureReason: "error",
    };
  }

  try {
    const fetchedRemoteHash = await readRefHash(io, tempRef);

    if (!fetchedRemoteHash) {
      return {
        state: "remote-unavailable",
        comparison: "comparison-unavailable",
        localHash: classification.localHash,
        remoteHash: null,
      };
    }

    if (await isAncestor(io, classification.localHash, fetchedRemoteHash)) {
      return {
        state: "remote-ahead",
        comparison: "full",
        localHash: classification.localHash,
        remoteHash: fetchedRemoteHash,
      };
    }
    if (await isAncestor(io, fetchedRemoteHash, classification.localHash)) {
      return {
        state: "local-ahead",
        comparison: "full",
        localHash: classification.localHash,
        remoteHash: fetchedRemoteHash,
      };
    }
    return {
      state: "diverged",
      comparison: "full",
      localHash: classification.localHash,
      remoteHash: fetchedRemoteHash,
    };
  } finally {
    await deleteRef(io, tempRef);
  }
}

/**
 * Fetch the user notes ref into a temp ref, optionally bounded by a timeout.
 *
 * When `timeoutMs` is provided, an `AbortController` aborts the fetch on
 * timeout — the resulting `AbortError` is what tells the caller to classify
 * the failure as `failureReason: "timeout"`. When undefined, falls through to
 * the unbounded fetch (preserves legacy behavior on the session-init probe
 * and the orchestrator path).
 *
 * Mirrors `lib/git/worktree-sync.ts:boundedFetch` but stays local — the
 * worktree variant fetches a branch, this one fetches a notes ref into a
 * temp ref under `refs/arc-sync-temp/`.
 */
async function boundedNotesRefFetch(
  io: UserIOContext,
  localRef: string,
  tempRef: string,
  timeoutMs?: number,
): Promise<void> {
  const args = ["fetch", "origin", `+${localRef}:${tempRef}`];
  if (timeoutMs === undefined) {
    await io.exec("git", args);
    return;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  try {
    await io.exec("git", args, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

type RemoteRefProbeResult =
  | { kind: "ok"; hash: string | null }
  | { kind: "remote-unavailable" };

async function readRemoteRefHash(
  io: UserIOContext,
  ref: string,
): Promise<RemoteRefProbeResult> {
  try {
    const { stdout } = await io.exec("git", ["ls-remote", "origin", ref]);
    const line = stdout
      .split("\n")
      .map((entry) => entry.trim())
      .find((entry) => entry.length > 0);

    if (!line) return { kind: "ok", hash: null };

    const [hash] = line.split(/\s+/u);
    return { kind: "ok", hash: hash || null };
  } catch {
    return { kind: "remote-unavailable" };
  }
}

interface DiskVsSnapshotInspection {
  state: UserSyncDiskState;
  diskStatus: UserDiskStatus;
  direction: UserUnsavedDirection | null;
}

async function inspectDiskVsLocalSnapshot(
  cwd: string,
  io: UserIOContext,
  identity: string,
): Promise<DiskVsSnapshotInspection> {
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

  const { note } = await findNearestUserNote({ cwd, io, identity });
  if (!note) {
    return {
      state: diskManifest ? "different" : "same",
      diskStatus: diskManifest ? "local unsaved" : "current",
      direction: diskManifest ? "edits" : null,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(note.content) as unknown;
  } catch {
    return {
      state: diskManifest ? "different" : "same",
      diskStatus: diskManifest ? "local unsaved" : "current",
      direction: diskManifest ? "edits" : null,
    };
  }

  const noteManifest = parsed as SyncManifest;
  const noteHash = hashSyncManifest(noteManifest);
  const diskHash = diskManifest ? hashSyncManifest(diskManifest) : null;
  const localSyncState = await readLocalSyncState(cwd, io, identity);

  if (!diskManifest) {
    return {
      state: "different",
      diskStatus: localSyncState?.materializedManifestHash === noteHash
        ? "local unsaved"
        : "stale",
      direction: "missing",
    };
  }

  if (manifestsEqual(noteManifest, diskManifest)) {
    return { state: "same", diskStatus: "current", direction: null };
  }

  const direction = computeUnsavedDirection(diskManifest, noteManifest);

  if (!localSyncState) {
    return {
      state: "different",
      diskStatus: deriveDiskStatus("different", direction),
      direction,
    };
  }

  const materializedHash = localSyncState.materializedManifestHash;
  if (note.commit !== localSyncState.sourceCommit) {
    const noteIsDescendant = await isAncestor(io, localSyncState.sourceCommit, note.commit);
    if (noteIsDescendant && diskHash === materializedHash) {
      return { state: "different", diskStatus: "stale", direction: "behind" };
    }
    // Note advanced past the materialized snapshot's baseline while disk
    // also diverged, or note moved outside the baseline's history entirely.
    // Both directions ambiguous; prefer manual reconciliation framing over
    // auto-routing to either save or load.
    return { state: "different", diskStatus: "mixed", direction: "mixed" };
  }

  let diskStatus: UserDiskStatus;
  if (materializedHash === noteHash) {
    diskStatus = "local unsaved";
  } else if (diskHash === materializedHash) {
    diskStatus = localSyncState.sourceOperation === "load" ? "stale" : "local unsaved";
  } else {
    diskStatus = "mixed";
  }

  return {
    state: "different",
    diskStatus,
    direction,
  };
}

export function computeUnsavedDirection(
  diskManifest: SyncManifest,
  noteManifest: SyncManifest,
): UserUnsavedDirection {
  const diskKeys = new Set(Object.keys(diskManifest.files));
  const noteKeys = new Set(Object.keys(noteManifest.files));

  let hasExtraFiles = false;
  let hasModifiedFiles = false;
  for (const key of diskKeys) {
    const noteValue = noteManifest.files[key];
    if (noteValue === undefined) {
      hasExtraFiles = true;
      continue;
    }
    if (noteValue !== diskManifest.files[key]) {
      hasModifiedFiles = true;
    }
  }

  let diskMissing = false;
  for (const key of noteKeys) {
    if (!diskKeys.has(key)) {
      diskMissing = true;
      break;
    }
  }

  const mismatchKinds = [hasExtraFiles, diskMissing, hasModifiedFiles]
    .filter(Boolean)
    .length;

  if (mismatchKinds > 1) return "mixed";
  if (hasExtraFiles) return "edits";
  if (hasModifiedFiles) return "modified";
  return "missing";
}

export function deriveRemoteStatus(
  refState: UserSyncRefState | null,
): UserRemoteStatus {
  switch (refState) {
    case "remote-unavailable":
      return "remote unavailable";
    case "diverged":
      return "conflict";
    case "remote-ahead":
      return "remote ahead";
    case "local-ahead":
      return "local ahead";
    case "same":
    case null:
      return "in sync";
  }
}

export function deriveDiskStatus(
  diskState: UserSyncDiskState,
  unsavedDirection: UserUnsavedDirection | null,
): UserDiskStatus {
  if (diskState === "same") return "current";
  switch (unsavedDirection) {
    case "edits":
      return "local unsaved";
    case "behind":
    case "missing":
    case "modified":
    case null:
      return "stale";
    case "mixed":
      return "mixed";
  }
}

async function listRemoteUserIdentities(
  io: UserIOContext,
): Promise<UserStatusRemoteIdentity[]> {
  try {
    const { stdout } = await io.exec("git", ["ls-remote", "origin"]);
    const rows = stdout
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => line.split(/\s+/u))
      .filter((parts): parts is [string, string] => parts.length >= 2)
      .filter(([, ref]) => ref.startsWith("refs/notes/arc/user/"));
    const identities = await Promise.all(rows.map(async ([hash, ref]) => ({
      identity: ref.slice("refs/notes/arc/user/".length),
      ref,
      hash: await shortHash(io.exec, hash),
    })));
    return identities.sort((left, right) => left.identity.localeCompare(right.identity));
  } catch {
    return [];
  }
}

function determineUserStatusHeadline(
  remoteStatus: UserRemoteStatus,
  diskStatus: UserDiskStatus,
): UserStatusHeadline {
  if (remoteStatus === "conflict") return "notes conflict";
  if (remoteStatus === "remote ahead") return "remote note ahead";
  if (diskStatus === "stale" || diskStatus === "mixed" || diskStatus === "local unsaved") {
    return "git note out of date";
  }
  if (remoteStatus === "local ahead") return "local note ahead";
  if (remoteStatus === "remote unavailable") return "remote unavailable";
  return "git note up to date";
}

function determineUserStatusAction(
  spine: UserSyncSpine,
  diskState: UserSyncDiskState,
  diskStatus: UserDiskStatus,
  remoteChecked: boolean,
  unsavedDirection: UserUnsavedDirection | null,
): string | null {
  switch (spine.state) {
    case "remote-ahead":
      return "run `arc user pull`";
    case "conflict":
      return "run `arc user fetch` for non-destructive inspection";
    case "remote-unavailable":
      if (spine.coherenceState === "partial-push-unverified") {
        return "retry online to verify partial-push recovery";
      }
      if (diskState === "same") return "retry online to confirm remote status";
      if (unsavedDirection === "edits") {
        return "run `arc user save`, then retry online when the remote is reachable";
      }
      if (unsavedDirection === "mixed") {
        return "inspect local disk state before retrying online";
      }
      return "run `arc user load`, or retry online to confirm remote status";
    case "disabled":
    case "clean":
      if (diskStatus === "stale") return "run `arc user load`";
      if (diskStatus === "mixed") {
        return "inspect local working files, then run `arc user load` or `arc user save`";
      }
      if (diskStatus === "local unsaved") return "run `arc user save`";
      if (spine.coherenceState === "partial-push") {
        return "run `arc user push` to retry the notes push";
      }
      if (spine.state === "clean" && spine.remoteStatus === "local ahead") {
        return "run `arc user push` (or `arc sync`)";
      }
      return remoteChecked ? null : "rerun without `--offline` to confirm remote status";
  }
}

async function readRefHash(
  io: UserIOContext,
  ref: string,
): Promise<string | null> {
  try {
    const { stdout } = await io.exec("git", ["rev-parse", "--verify", ref]);
    return stdout.trim() || null;
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
