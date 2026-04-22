import { join } from "node:path";

import { serialize, type SyncManifest } from "../../lib/git/index.js";
import { findNearestUserNote, listBackupFiles, runUserLoad } from "./save-load.js";
import { notesRef } from "./shared.js";
import type {
  InspectUserSyncOptions,
  UserFetchOptions,
  UserIOContext,
  UserPullOptions,
  UserSessionInitStatusOptions,
  UserSessionInitStatusResult,
  UserStatusHeadline,
  UserStatusOptions,
  UserStatusRemoteIdentity,
  UserStatusResult,
  UserSyncDiskState,
  UserSyncRefState,
  UserSyncState,
} from "./types.js";

const TEMP_SYNC_REF_PREFIX = "refs/arc-sync-temp";

/**
 * Push user notes ref to remote origin.
 *
 * @param options - Push options
 */
export async function runUserPush(
  options: { io: UserIOContext; identity: string; force?: boolean },
): Promise<void> {
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

/**
 * Fetch user notes ref from remote origin.
 *
 * @param options - Fetch options
 */
export async function runUserFetch(options: UserFetchOptions): Promise<void> {
  const { io, identity, force } = options;
  const ref = `refs/notes/${notesRef(identity)}`;
  const refspec = force ? `+${ref}:${ref}` : `${ref}:${ref}`;
  await io.exec("git", ["fetch", "origin", refspec]);
}

/**
 * Fetch user notes from remote and restore them to disk.
 *
 * @param options - Pull options
 * @returns Load result, or null if no note was found after fetch
 */
export async function runUserPull(
  options: UserPullOptions,
) {
  const { cwd, io, identity, force, maxAncestorWalk, onWalkExhausted } = options;
  await runUserFetch({ io, identity, force });
  return runUserLoad({ cwd, io, identity, maxAncestorWalk, onWalkExhausted });
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
  const [diskState, search, backupFiles, remoteIdentities, refInspection] = await Promise.all([
    inspectDiskVsLocalSnapshot(cwd, io, identity),
    findNearestUserNote({ cwd, io, identity }),
    listBackupFiles(cwd, io, identity),
    all ? listRemoteUserIdentities(io) : Promise.resolve([]),
    offline ? Promise.resolve(null) : inspectUserSyncRefsDetailed(io, identity),
  ]);

  const note = search.note;

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
          "Local and remote notes have diverged.",
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

  if (savedCommit && savedFromAncestor) {
    detailLines.push(`Saved snapshot is from ${savedCommit}, not current HEAD.`);
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
    backupFiles,
    remoteIdentities,
  };
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

  const { note } = await findNearestUserNote({ cwd, io, identity });
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
