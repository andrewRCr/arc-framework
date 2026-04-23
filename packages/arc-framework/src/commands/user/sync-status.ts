import { join } from "node:path";

import { serialize, type SyncManifest } from "../../lib/git/index.js";
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
  const [refState, diskInspection] = await Promise.all([
    inspectUserSyncRefs(io, identity),
    inspectDiskVsLocalSnapshot(cwd, io, identity),
  ]);

  return {
    refState,
    diskState: diskInspection.state,
    remoteStatus: deriveRemoteStatus(refState),
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
  const { cwd, io, identity, offline = false, all = false } = options;
  const [diskInspection, search, backupFiles, remoteIdentities, refInspection] = await Promise.all([
    inspectDiskVsLocalSnapshot(cwd, io, identity),
    findNearestUserNote({ cwd, io, identity }),
    listBackupFiles(cwd, io, identity),
    all ? listRemoteUserIdentities(io) : Promise.resolve([]),
    offline ? Promise.resolve(null) : inspectUserSyncRefsDetailed(io, identity),
  ]);

  const note = search.note;
  const savedAtRelative = note ? await readCommitRelativeAge(io, note.commit) : null;

  return buildUserStatusResult({
    identity,
    diskState: diskInspection.state,
    diskStatus: diskInspection.diskStatus,
    refState: refInspection?.state ?? null,
    remoteChecked: !offline,
    savedCommit: note ? note.commit.slice(0, 7) : null,
    savedFromAncestor: note ? note.fromAncestor : false,
    ancestorDistance: note?.ancestorDistance ?? 0,
    savedAtRelative,
    unsavedDirection: diskInspection.direction,
    backupFiles,
    remoteIdentities,
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
    return {
      identity,
      state: "disabled",
      summary: `${identity}: session-init remote sync disabled`,
      detailLines: [
        "Config: `session.remote_sync: disabled`.",
        "Next step: skip the remote probe and continue with local tracked state.",
      ],
      actionHint: null,
      shouldPromptToPull: false,
    };
  }

  const refInspection = await inspectUserSyncRefsDetailed(io, identity);
  switch (refInspection.state) {
    case "same":
      return {
        identity,
        state: "clean",
        summary: `${identity}: session-init remote state clean`,
        detailLines: ["Remote notes match local notes."],
        actionHint: null,
        shouldPromptToPull: false,
      };
    case "local-ahead":
      return {
        identity,
        state: "clean",
        summary: `${identity}: session-init remote state clean`,
        detailLines: [
          "Local notes are newer than remote, but no pull is needed before continuing.",
        ],
        actionHint: null,
        shouldPromptToPull: false,
      };
    case "remote-ahead":
      return {
        identity,
        state: "remote-ahead",
        summary: `${identity}: session-init remote notes ahead`,
        detailLines: [
          "Remote notes are newer than local notes.",
          "Next step: ask whether to run `arc user pull` before continuing session-init.",
        ],
        actionHint: "run `arc user pull` before continuing session-init",
        shouldPromptToPull: true,
      };
    case "diverged":
      return {
        identity,
        state: "conflict",
        summary: `${identity}: session-init remote notes conflict`,
        detailLines: [
          "Local and remote notes conflict (both moved since common ancestor).",
          "Next step: ask whether to run `arc user pull` and replace local notes before continuing.",
        ],
        actionHint: "run `arc user pull` to replace local notes before continuing session-init",
        shouldPromptToPull: true,
      };
    case "remote-unavailable":
      if (refInspection.comparison === "comparison-unavailable") {
        return {
          identity,
          state: "remote-unavailable",
          summary: `${identity}: session-init remote comparison unavailable here`,
          detailLines: [
            "Remote notes are reachable, but this environment blocks the fetch-based ancestry comparison.",
            "Next step: continue with local tracked state, or retry session-init where git fetch/write access is allowed.",
          ],
          actionHint: "continue locally or retry session-init where git fetch/write access is allowed",
          shouldPromptToPull: false,
        };
      }
      return {
        identity,
        state: "remote-unavailable",
        summary: `${identity}: session-init remote probe unavailable`,
        detailLines: [
          "Remote notes could not be reached.",
          "Next step: continue with local tracked state, or retry once the remote is reachable.",
        ],
        actionHint: "continue locally or retry once the remote is reachable",
        shouldPromptToPull: false,
      };
  }
}

interface UserSyncRefInspection {
  state: UserSyncRefState;
  comparison: "full" | "read-only" | "comparison-unavailable" | "remote-unavailable";
}

interface BuildUserStatusInput {
  identity: string;
  diskState: UserSyncDiskState;
  diskStatus?: UserDiskStatus;
  refState: UserSyncRefState | null;
  remoteChecked: boolean;
  savedCommit: string | null;
  savedFromAncestor: boolean;
  ancestorDistance?: number;
  savedAtRelative?: string | null;
  unsavedDirection?: UserUnsavedDirection | null;
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
  const ancestorDistance = input.ancestorDistance ?? 0;
  const savedAtRelative = input.savedAtRelative ?? null;
  const unsavedDirection = input.unsavedDirection ?? null;

  const remoteStatus = deriveRemoteStatus(refState);
  const diskStatus = input.diskStatus ?? deriveDiskStatus(diskState, unsavedDirection);
  const headline = determineUserStatusHeadline(remoteStatus, diskStatus);
  const summary = remoteChecked
    ? `${identity}: ${headline}`
    : `${identity}: ${headline} (offline)`;

  const detailLines: string[] = [];
  const actionHint = determineUserStatusAction(
    headline,
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

  if (savedAtRelative) {
    detailLines.push(`Saved ${savedAtRelative}.`);
  }

  if (savedCommit && ancestorDistance > 0) {
    detailLines.push(
      `Latest local git note is from ${savedCommit}, ${ancestorDistance} commit(s) back.`,
    );
  } else if (savedCommit && ancestorDistance === 0) {
    detailLines.push("Latest local git note is current with HEAD.");
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
    headline,
    remoteStatus,
    diskStatus,
    summary,
    actionHint,
    detailLines,
    remoteChecked,
    refState,
    diskState,
    savedCommit,
    savedFromAncestor,
    ancestorDistance,
    savedAtRelative,
    unsavedDirection,
    backupFiles,
    remoteIdentities,
  };
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

async function inspectUserSyncRefs(
  io: UserIOContext,
  identity: string,
): Promise<UserSyncRefState> {
  const result = await inspectUserSyncRefsDetailed(io, identity);
  return result.state;
}

async function inspectUserSyncRefsDetailed(
  io: UserIOContext,
  identity: string,
): Promise<UserSyncRefInspection> {
  const localRef = `refs/notes/${notesRef(identity)}`;
  const tempRef = `${TEMP_SYNC_REF_PREFIX}/${identity}`;

  const localHash = await readRefHash(io, localRef);
  const remoteProbe = await readRemoteRefHash(io, localRef);

  if (remoteProbe.kind === "remote-unavailable") {
    return { state: "remote-unavailable", comparison: "remote-unavailable" };
  }

  const remoteHash = remoteProbe.hash;
  if (!localHash && !remoteHash) return { state: "same", comparison: "read-only" };
  if (!localHash && remoteHash) return { state: "remote-ahead", comparison: "read-only" };
  if (localHash && !remoteHash) return { state: "local-ahead", comparison: "read-only" };
  if (!localHash || !remoteHash) return { state: "same", comparison: "read-only" };
  if (localHash === remoteHash) return { state: "same", comparison: "read-only" };

  try {
    await io.exec("git", ["fetch", "origin", `+${localRef}:${tempRef}`]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("couldn't find remote ref")) {
      return { state: localHash ? "local-ahead" : "same", comparison: "read-only" };
    }
    return { state: "remote-unavailable", comparison: "comparison-unavailable" };
  }

  try {
    const fetchedRemoteHash = await readRefHash(io, tempRef);

    if (!fetchedRemoteHash) {
      return { state: "remote-unavailable", comparison: "comparison-unavailable" };
    }

    if (await isAncestor(io, localHash, fetchedRemoteHash)) {
      return { state: "remote-ahead", comparison: "full" };
    }
    if (await isAncestor(io, fetchedRemoteHash, localHash)) {
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
  headline: UserStatusHeadline,
  diskState: UserSyncDiskState,
  diskStatus: UserDiskStatus,
  remoteChecked: boolean,
  unsavedDirection: UserUnsavedDirection | null,
): string | null {
  switch (headline) {
    case "remote note ahead":
      return "run `arc user pull`";
    case "notes conflict":
      return "run `arc user fetch` for non-destructive inspection";
    case "remote unavailable":
      if (diskState === "same") return "retry online to confirm remote status";
      if (unsavedDirection === "edits") {
        return "run `arc user save`, then retry online when the remote is reachable";
      }
      if (unsavedDirection === "mixed") {
        return "inspect local disk state before retrying online";
      }
      return "run `arc user load`, or retry online to confirm remote status";
    case "git note up to date":
      return remoteChecked ? null : "rerun without `--offline` to confirm remote status";
    case "local note ahead":
      return "run `arc user push` (or `arc sync`)";
    case "git note out of date":
      if (diskStatus === "stale") return "run `arc user load`";
      if (diskStatus === "mixed") {
        return "inspect local working files, then run `arc user load` or `arc user save`";
      }
      return "run `arc user save`";
  }
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
