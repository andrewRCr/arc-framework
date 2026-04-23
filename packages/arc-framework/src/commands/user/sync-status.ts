import { join } from "node:path";

import { serialize, type SyncManifest } from "../../lib/git/index.js";
import { formatRelativeTime } from "./relative-time.js";
import { findNearestUserNote, listBackupFiles } from "./save-load.js";
import { notesRef } from "./shared.js";
import type {
  InspectUserSyncOptions,
  UserIOContext,
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

  return { refState, diskState: diskInspection.state };
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
 * This is a non-destructive probe: it respects `session.remote_sync`, compares
 * against a temp fetched ref when enabled, and reports whether session-init
 * should ask the user about pulling before continuing.
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

  const refState = await inspectUserSyncRefs(io, identity);
  switch (refState) {
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
}

interface BuildUserStatusInput {
  identity: string;
  diskState: UserSyncDiskState;
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

  const headline = determineUserStatusHeadline(refState, diskState);
  const summary = remoteChecked
    ? `${identity}: ${headline}`
    : `${identity}: ${headline} (offline)`;

  const detailLines: string[] = [];
  const actionHint = determineUserStatusAction(headline, diskState, remoteChecked);

  if (!remoteChecked) {
    detailLines.push("Remote check skipped (`--offline`).");
  }

  if (headline === "local unsaved" && unsavedDirection) {
    detailLines.push(renderUnsavedDirectionHint(unsavedDirection));
  }

  if (savedAtRelative) {
    detailLines.push(`Saved ${savedAtRelative}.`);
  }

  if (savedCommit && ancestorDistance > 0) {
    detailLines.push(
      `Saved snapshot is from ${savedCommit}, ${ancestorDistance} commit(s) back.`,
    );
  } else if (!savedCommit && diskState === "different") {
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
    ancestorDistance,
    savedAtRelative,
    unsavedDirection,
    backupFiles,
    remoteIdentities,
  };
}

function renderUnsavedDirectionHint(direction: UserUnsavedDirection): string {
  switch (direction) {
    case "edits":
      return "Disk has unsaved edits not yet in the saved note.";
    case "missing":
      return "Disk is missing updates from the saved note.";
    case "mixed":
      return "Disk has unsaved edits and is missing updates from the saved note.";
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

interface DiskVsSnapshotInspection {
  state: UserSyncDiskState;
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
    return { state: diskManifest ? "different" : "same", direction: null };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(note.content) as unknown;
  } catch {
    return { state: "different", direction: null };
  }

  const noteManifest = parsed as SyncManifest;

  if (!diskManifest) {
    return { state: "different", direction: "missing" };
  }

  if (manifestsEqual(noteManifest, diskManifest)) {
    return { state: "same", direction: null };
  }

  return {
    state: "different",
    direction: computeUnsavedDirection(diskManifest, noteManifest),
  };
}

export function computeUnsavedDirection(
  diskManifest: SyncManifest,
  noteManifest: SyncManifest,
): UserUnsavedDirection {
  const diskKeys = new Set(Object.keys(diskManifest.files));
  const noteKeys = new Set(Object.keys(noteManifest.files));

  let hasEdits = false;
  for (const key of diskKeys) {
    const noteValue = noteManifest.files[key];
    if (noteValue === undefined || noteValue !== diskManifest.files[key]) {
      hasEdits = true;
      break;
    }
  }

  let diskMissing = false;
  for (const key of noteKeys) {
    if (!diskKeys.has(key)) {
      diskMissing = true;
      break;
    }
  }

  if (hasEdits && diskMissing) return "mixed";
  if (hasEdits) return "edits";
  return "missing";
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
  refState: UserSyncRefState | null,
  diskState: UserSyncDiskState,
): UserStatusHeadline {
  if (refState === "remote-unavailable") return "remote unavailable";
  if (refState === "diverged") return "conflict";
  if (refState === "remote-ahead") return "remote ahead";
  if (diskState === "different" || refState === "local-ahead") return "local unsaved";
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
    case "local unsaved":
      // The "local unsaved" headline covers two distinct remediations:
      //   (a) diskState === "different" → work isn't in a local note yet → save first.
      //   (b) diskState === "same" (implies refState === "local-ahead", per
      //       `determineUserStatusHeadline`) → work IS saved locally, just not pushed.
      //   Picking by diskState keeps the split tight to the observable cause.
      return diskState === "different"
        ? "run `arc user save`"
        : "run `arc user push` (or `arc sync`)";
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
