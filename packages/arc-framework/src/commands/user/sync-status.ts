import { join } from "node:path";

import { serialize, type SyncManifest } from "../../lib/git/index.js";
import { runWorktreeSyncStatus, type WorktreeSyncStatusResult } from "../../lib/git/worktree-sync.js";
import { formatRelativeTime } from "./relative-time.js";
import {
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
  UserRemoteStatus,
  UserSessionInitStatusOptions,
  UserSessionInitStatusResult,
  UserStatusHeadline,
  UserStatusOptions,
  UserStatusRemoteIdentity,
  UserStatusResult,
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
  const spine = computeUserSyncSpine({
    remoteSyncEnabled: true,
    refState: refInspection.state,
  });

  return {
    spineState: spine.state,
    refState: refInspection.state,
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
  const { cwd, io, identity, offline = false, all = false, remoteSyncEnabled = false } = options;
  const shouldProbeWorktree = !offline && remoteSyncEnabled;
  const [diskInspection, search, backupFiles, remoteIdentities, refInspection, worktreeProbe] =
    await Promise.all([
      inspectDiskVsLocalSnapshot(cwd, io, identity),
      findNearestUserNote({ cwd, io, identity }),
      listBackupFiles(cwd, io, identity),
      all ? listRemoteUserIdentities(io) : Promise.resolve([]),
      offline ? Promise.resolve(null) : inspectUserSyncRefsDetailed(io, identity),
      shouldProbeWorktree
        ? runWorktreeSyncStatus({ exec: io.exec, remoteSyncEnabled: true })
        : Promise.resolve(null),
    ]);
  const spine = computeUserSyncSpine({
    remoteSyncEnabled: !offline,
    refState: refInspection?.state ?? null,
  });

  const note = search.note;
  const savedAtRelative = note ? await readCommitRelativeAge(io, note.commit) : null;

  return buildUserStatusResult({
    spine,
    identity,
    diskState: diskInspection.state,
    diskStatus: diskInspection.diskStatus,
    refState: spine.refState,
    remoteChecked: !offline,
    savedCommit: note ? note.commit.slice(0, 7) : null,
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
  });
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
  const { io, identity, remoteSyncEnabled } = options;

  if (!remoteSyncEnabled) {
    return buildUserSessionInitStatusResult({
      identity,
      spine: computeUserSyncSpine({ remoteSyncEnabled: false, refState: null }),
    });
  }

  const refInspection = await inspectUserSyncRefsDetailed(io, identity);
  return buildUserSessionInitStatusResult({
    identity,
    spine: computeUserSyncSpine({
      remoteSyncEnabled: true,
      refState: refInspection.state,
    }),
    comparison: refInspection.comparison,
  });
}

interface UserSyncRefInspection {
  state: UserSyncRefState;
  comparison: "full" | "read-only" | "comparison-unavailable" | "remote-unavailable";
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
}): UserSyncSpine {
  const refState = input.remoteSyncEnabled ? input.refState : null;
  const state = computeUserSyncSpineState(input.remoteSyncEnabled, refState);
  return {
    state,
    refState,
    remoteStatus: deriveRemoteStatus(refState),
    shouldPromptToPull: state === "remote-ahead" || state === "conflict",
  };
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
}): UserSessionInitStatusResult {
  const { identity, spine } = input;

  switch (spine.state) {
    case "disabled":
      return {
        identity,
        state: spine.state,
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
        summary: `${identity}: session-init remote state clean`,
        detailLines: spine.refState === "local-ahead"
          ? ["Local notes are newer than remote, but no pull is needed before continuing."]
          : ["Remote notes match local notes."],
        actionHint: null,
        shouldPromptToPull: spine.shouldPromptToPull,
      };
    case "remote-ahead":
      return {
        identity,
        state: spine.state,
        summary: `${identity}: session-init remote notes ahead`,
        detailLines: [
          "Remote notes are newer than local notes.",
          "Next step: ask whether to run `arc user pull` before continuing session-init.",
        ],
        actionHint: "run `arc user pull` before continuing session-init",
        shouldPromptToPull: spine.shouldPromptToPull,
      };
    case "conflict":
      return {
        identity,
        state: spine.state,
        summary: `${identity}: session-init remote notes conflict`,
        detailLines: [
          "Local and remote notes conflict (both moved since common ancestor).",
          "Next step: ask whether to run `arc user pull` and replace local notes before continuing.",
        ],
        actionHint: "run `arc user pull` to replace local notes before continuing session-init",
        shouldPromptToPull: spine.shouldPromptToPull,
      };
    case "remote-unavailable":
      if (input.comparison === "comparison-unavailable") {
        return {
          identity,
          state: spine.state,
          summary: `${identity}: session-init remote comparison unavailable here`,
          detailLines: [
            "Remote notes are reachable, but this environment blocks the fetch-based ancestry comparison.",
            "Next step: continue with local tracked state, or retry session-init where git fetch/write access is allowed.",
          ],
          actionHint: "continue locally or retry session-init where git fetch/write access is allowed",
          shouldPromptToPull: spine.shouldPromptToPull,
        };
      }
      return {
        identity,
        state: spine.state,
        summary: `${identity}: session-init remote probe unavailable`,
        detailLines: [
          "Remote notes could not be reached.",
          "Next step: continue with local tracked state, or retry once the remote is reachable.",
        ],
        actionHint: "continue locally or retry once the remote is reachable",
        shouldPromptToPull: spine.shouldPromptToPull,
      };
  }
}

interface BuildUserStatusInput {
  spine?: UserSyncSpine;
  identity: string;
  diskState: UserSyncDiskState;
  diskStatus?: UserDiskStatus;
  refState: UserSyncRefState | null;
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
  const ancestorDistance = input.ancestorDistance ?? 0;
  const noteHistoryDistance = input.noteHistoryDistance;
  const savedReachableFromHead = input.savedReachableFromHead ?? true;
  const savedAtRelative = input.savedAtRelative ?? null;
  const unsavedDirection = input.unsavedDirection ?? null;

  const spine = input.spine ?? computeUserSyncSpine({
    remoteSyncEnabled: remoteChecked,
    refState,
  });
  const remoteStatus = spine.remoteStatus;
  const diskStatus = input.diskStatus ?? deriveDiskStatus(diskState, unsavedDirection);
  const headline = determineUserStatusHeadline(remoteStatus, diskStatus);
  const summary = remoteChecked
    ? `${identity}: ${headline}`
    : `${identity}: ${headline} (offline)`;

  const detailLines: string[] = [];
  const actionHint = determineUserStatusAction(
    spine,
    diskState,
    diskStatus,
    remoteChecked,
    unsavedDirection,
  );

  if (!remoteChecked) {
    detailLines.push("Remote check skipped (`--offline`).");
  }

  detailLines.push(renderHeadlineExplanation(headline, diskStatus));
  detailLines.push(renderWorkingFilesLine(diskStatus));
  detailLines.push(`Remote notes: ${renderRemoteStatus(remoteStatus)}.`);

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
      `Latest local git note is from ${savedCommit}, ${ancestorDistance} commit(s) back.`,
    );
  } else if (savedCommit && savedReachableFromHead && ancestorDistance === 0) {
    detailLines.push("Latest local git note is current with HEAD.");
  } else if (savedCommit) {
    const historyDetail = noteHistoryDistance === undefined
      ? ""
      : ` (${noteHistoryDistance} note update(s) back)`;
    detailLines.push(
      `Latest local git note is from ${savedCommit}, outside current HEAD ancestry${historyDetail}.`,
    );
  } else if (!savedCommit && diskState === "different") {
    detailLines.push("No local git note exists yet for this identity.");
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
    spineState: spine.state,
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
      ? "Worktree remote comparison skipped (`--offline`); reported state reflects local refs only."
      : null;
  }

  if (!worktree) return null;

  switch (worktree.state) {
    case "remote-ahead":
      return `Worktree is behind origin by ${worktree.behind} commit(s).`;
    case "diverged":
      return `Worktree has diverged from origin (${worktree.ahead} ahead, ${worktree.behind} behind).`;
    case "remote-unavailable":
      return "Worktree remote comparison unavailable; reported state may not reflect unreachable remote commits.";
    default:
      return null;
  }
}

function renderHeadlineExplanation(
  headline: UserStatusHeadline,
  diskStatus: UserDiskStatus,
): string {
  switch (headline) {
    case "git note up to date":
      return "Local git note and working files are current.";
    case "remote note ahead":
      return "A newer remote git note exists.";
    case "local note ahead":
      return "Your local git note is newer than remote.";
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
      return "Remote git-note status could not be checked.";
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
      return "in sync";
    case "local ahead":
      return "local note ahead";
    case "remote ahead":
      return "remote note ahead";
    case "conflict":
      return "notes conflict";
    case "remote unavailable":
      return "unavailable";
  }
}

type PreFetchClassification =
  | { kind: "fast-result"; result: UserSyncRefInspection }
  | { kind: "must-fetch"; localHash: string };

function classifyPreFetch(
  localHash: string | null,
  remoteProbe: RemoteRefProbeResult,
): PreFetchClassification {
  if (remoteProbe.kind === "remote-unavailable") {
    return {
      kind: "fast-result",
      result: { state: "remote-unavailable", comparison: "remote-unavailable" },
    };
  }
  const remoteHash = remoteProbe.hash;
  if (!localHash && !remoteHash) {
    return { kind: "fast-result", result: { state: "same", comparison: "read-only" } };
  }
  if (!localHash || !remoteHash) {
    return {
      kind: "fast-result",
      result: {
        state: localHash ? "local-ahead" : "remote-ahead",
        comparison: "read-only",
      },
    };
  }
  if (localHash === remoteHash) {
    return { kind: "fast-result", result: { state: "same", comparison: "read-only" } };
  }
  return { kind: "must-fetch", localHash };
}

async function inspectUserSyncRefsDetailed(
  io: UserIOContext,
  identity: string,
): Promise<UserSyncRefInspection> {
  const localRef = `refs/notes/${notesRef(identity)}`;
  const tempRef = `${TEMP_SYNC_REF_PREFIX}/${identity}`;

  const localHash = await readRefHash(io, localRef);
  const remoteProbe = await readRemoteRefHash(io, localRef);
  const classification = classifyPreFetch(localHash, remoteProbe);
  if (classification.kind === "fast-result") return classification.result;

  try {
    await io.exec("git", ["fetch", "origin", `+${localRef}:${tempRef}`]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("couldn't find remote ref")) {
      return { state: "local-ahead", comparison: "read-only" };
    }
    return { state: "remote-unavailable", comparison: "comparison-unavailable" };
  }

  try {
    const fetchedRemoteHash = await readRefHash(io, tempRef);

    if (!fetchedRemoteHash) {
      return { state: "remote-unavailable", comparison: "comparison-unavailable" };
    }

    if (await isAncestor(io, classification.localHash, fetchedRemoteHash)) {
      return { state: "remote-ahead", comparison: "full" };
    }
    if (await isAncestor(io, fetchedRemoteHash, classification.localHash)) {
      return { state: "local-ahead", comparison: "full" };
    }
    return { state: "diverged", comparison: "full" };
  } finally {
    await deleteRef(io, tempRef);
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
  let diskStatus: UserDiskStatus;
  if (materializedHash === noteHash) {
    diskStatus = "local unsaved";
  } else if (diskHash === materializedHash) {
    // Hash-only legacy provenance cannot safely distinguish "disk is stale"
    // from "disk reflects a newer local-only save/load state". Avoid a
    // destructive load recommendation when direction is ambiguous.
    if (localSyncState.sourceCommit.length === 0) {
      diskStatus = "mixed";
    } else {
      diskStatus = localSyncState.sourceOperation === "load" ? "stale" : "local unsaved";
    }
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
