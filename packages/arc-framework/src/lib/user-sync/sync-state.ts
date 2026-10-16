/**
 * Local sync-state record (`.sync-state.json`) — the per-worktree marker that
 * tracks the working tree's last save/load against the user notes ref, plus the
 * partial-push recovery marker. This is the I/O-boundary home for the sync-state
 * schema and its read / write helpers; downstream sync work (remote partial-push
 * provenance, drift detection) builds on this module rather than on the command
 * layer.
 *
 * The file lives under `user/{identity}/.internal/`. Reads tolerate a legacy
 * copy at the identity root and a `version: 2` record (pre-`savedAt`), and
 * return a parsed record or `null` for absent/malformed records. Non-ENOENT
 * read failures still throw so permission or busy-file issues are visible.
 *
 * @module
 */

import { join } from "node:path";

import { atomicWriteJson, exclusiveCreateFile } from "../fs.js";
import { ensureDir } from "../template/index.js";
import type { CoreIO } from "../types.js";

import { acquireAdvisoryLock, releaseAdvisoryLock } from "../advisory-lock.js";
import { resolveGitCommonDir } from "../git/exec.js";
import { getOrCreateMachineId as getStoreMachineId, readMachineIdFile, isMachineId } from "../store/machine-id.js";
import {
  LocalSyncStateSchema,
  normalizeLocalSyncState,
  PersistedLocalSyncStateSchema,
  type LocalSyncState,
} from "./schema.js";

export {
  LocalSyncStateSchema,
  normalizeLocalSyncState,
  PartialPushMarkerSchema,
  PersistedLocalSyncStateSchema,
  PriorFileListSchema,
  RemoteMarkerProvenanceSchema,
  type LocalSyncState,
  type PartialPushMarker,
  type PersistedLocalSyncState,
  type PriorFileList,
  type RemoteMarkerProvenance,
} from "./schema.js";

const LOCAL_SYNC_STATE_FILENAME = ".sync-state.json";
const LOCAL_SYNC_STATE_LOCK_FILENAME = ".sync-state.lock";
/** Dedicated canonical machine-id store — a bare UUID, raced via exclusive create. */
const MACHINE_ID_FILENAME = ".machine-id";
const USER_INTERNAL_DIRNAME = ".internal";
/** Notes ref prefix; mirrors the notes-ref module's internal `refs/notes/arc/user`. */
const USER_NOTES_REF = "refs/notes/arc/user";
const LOCAL_SYNC_STATE_UPDATE_ATTEMPTS = 20;
const LOCAL_SYNC_STATE_RETRY_BACKOFF_MIN_MS = 1;
const LOCAL_SYNC_STATE_RETRY_BACKOFF_JITTER_MS = 4;
/** Sentinel basis for loads that materialize shared context without a comparable branch commit. */
export const NO_COMPARABLE_SOURCE_COMMIT = "no-comparable-saved-commit";

export function isComparableSourceCommit(
  sourceCommit: string | null | undefined,
): sourceCommit is string {
  return sourceCommit !== undefined
    && sourceCommit !== null
    && sourceCommit !== NO_COMPARABLE_SOURCE_COMMIT;
}

/** Absolute path to the user's `.internal/` bookkeeping directory. */
export function getUserInternalDir(cwd: string, identity: string): string {
  return join(cwd, ".arc", "user", identity, USER_INTERNAL_DIRNAME);
}

function getLocalSyncStatePath(cwd: string, identity: string): string {
  return join(getUserInternalDir(cwd, identity), LOCAL_SYNC_STATE_FILENAME);
}

function getLegacyLocalSyncStatePath(cwd: string, identity: string): string {
  return join(cwd, ".arc", "user", identity, LOCAL_SYNC_STATE_FILENAME);
}

function getLocalSyncStateLockPath(cwd: string, identity: string): string {
  return join(getUserInternalDir(cwd, identity), LOCAL_SYNC_STATE_LOCK_FILENAME);
}

export async function readLocalSyncState(
  cwd: string,
  io: CoreIO,
  identity: string,
): Promise<LocalSyncState | null> {
  for (const syncStatePath of [
    getLocalSyncStatePath(cwd, identity),
    getLegacyLocalSyncStatePath(cwd, identity),
  ]) {
    let raw: string;
    try {
      raw = await io.readFile(syncStatePath);
    } catch (err) {
      if (!isErrnoCode(err, "ENOENT")) throw err;
      continue;
    }

    const parsed = parseLocalSyncState(raw);
    if (parsed.kind === "invalid") {
      return null;
    }
    if (parsed.kind === "state") return parsed.state;
  }

  return null;
}

type LocalSyncStateParseResult =
  | { kind: "state"; state: LocalSyncState }
  | { kind: "skip" }
  | { kind: "invalid" };

function parseLocalSyncState(raw: string): LocalSyncStateParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { kind: "invalid" };
  }
  const persisted = PersistedLocalSyncStateSchema.safeParse(parsed);
  return persisted.success
    ? { kind: "state", state: normalizeLocalSyncState(persisted.data) }
    : { kind: "skip" };
}

/** Exclusive-create seam — defaults to the real filesystem primitive. */
export type ExclusiveCreateFn = (path: string, content: string) => Promise<void>;

/** Resolve the clone's shared machine ID, lazily adopting checkout-local or legacy sync-state IDs.
 * @param exclusiveCreate - Exclusive-create boundary for callers exercising concurrent first use.
 */
export async function getOrCreateMachineId(
  cwd: string,
  io: CoreIO,
  identity: string,
  exclusiveCreate: ExclusiveCreateFn = exclusiveCreateFile,
): Promise<string> {
  return getStoreMachineId({
    commonGitDir: await resolveGitCommonDir(io.exec, cwd), identity, fs: io, exclusiveCreate,
    candidate: async () => await readLegacyCheckoutMachineId(cwd, io, identity)
      ?? await readLegacyMachineId(cwd, io, identity),
  });
}

function isErrnoCode(err: unknown, code: string): boolean {
  return (
    typeof err === "object"
    && err !== null
    && (err as { code?: unknown }).code === code
  );
}

/**
 * The pre-common-dir machine-id store, read directly from the old checkout-local
 * `.arc/user/{identity}/.internal/.machine-id` path. Used solely by
 * {@link getOrCreateMachineId}'s one-time migration adopt — no current writer
 * persists this path.
 */
async function readLegacyCheckoutMachineId(
  cwd: string,
  io: CoreIO,
  identity: string,
): Promise<string | null> {
  return readMachineIdFile(io, join(getUserInternalDir(cwd, identity), MACHINE_ID_FILENAME));
}

/**
 * The legacy machine-id, read directly from the pre-`.machine-id`
 * `.sync-state.json` field and bypassing full-record schema validation. Used
 * solely by {@link getOrCreateMachineId}'s one-time migration adopt — no current
 * writer persists this field. Returns `null` when none is stored.
 */
async function readLegacyMachineId(
  cwd: string,
  io: CoreIO,
  identity: string,
): Promise<string | null> {
  const raw = await readSyncStateRaw(cwd, io, identity);
  const machineId = raw?.machineId;
  if (typeof machineId !== "string") return null;
  // Adopt only a well-formed legacy id: a partial or malformed value would be written
  // to .machine-id, returned once, then read back as invalid (readMachineIdFile rejects
  // it) and fail the exclusive-create read-back with EEXIST. Anything else → mint instead.
  const trimmed = machineId.trim();
  return isMachineId(trimmed) ? trimmed : null;
}

/** Parse `.sync-state.json` into its raw object form (internal path preferred, then legacy), or `null`. */
async function readSyncStateRaw(
  cwd: string,
  io: CoreIO,
  identity: string,
): Promise<Record<string, unknown> | null> {
  for (const syncStatePath of [
    join(getUserInternalDir(cwd, identity), LOCAL_SYNC_STATE_FILENAME),
    join(cwd, ".arc", "user", identity, LOCAL_SYNC_STATE_FILENAME),
  ]) {
    let raw: string;
    try {
      raw = await io.readFile(syncStatePath);
    } catch (err) {
      if (!isErrnoCode(err, "ENOENT")) throw err;
      continue;
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed === "object" && parsed !== null) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }
  return null;
}

export async function writeLocalSyncState(
  cwd: string,
  io: CoreIO,
  identity: string,
  materializedManifestHash: string,
  sourceCommit: string,
  sourceOperation: "save" | "load",
  verifiedAt?: string,
  priorFileList?: string[],
  notesRefTip?: string | null,
): Promise<void> {
  // A save/load writes a fresh record but must not drop reserved fields a
  // downstream writer may have populated — carry them forward from the prior
  // record. partialPush is intentionally not carried (a successful save/load
  // resolves the notes partial-push condition); partialPushErrand IS carried,
  // since a notes-directory save does not resolve an errand-ref push failure.
  // `priorFileList` is the file list this sync materialized — when supplied it
  // refreshes the captured set (the drift tier's retirement-vs-arrival basis);
  // otherwise the prior record's list carries forward.
  await updateLocalSyncStateRecord(cwd, io, identity, (prior) => {
    const resolvedPriorFileList = priorFileList ?? prior?.priorFileList;
    const resolvedNotesRefTip = notesRefTip === undefined ? prior?.notesRefTip : notesRefTip;
    return {
      version: 4,
      materializedManifestHash,
      sourceCommit,
      sourceOperation,
      savedAt: new Date().toISOString(),
      ...(verifiedAt ? { verifiedAt } : {}),
      ...(resolvedNotesRefTip ? { notesRefTip: resolvedNotesRefTip } : {}),
      ...(prior?.partialPushErrand ? { partialPushErrand: prior.partialPushErrand } : {}),
      ...(resolvedPriorFileList ? { priorFileList: resolvedPriorFileList } : {}),
      ...(prior?.remoteMarkerProvenance ? { remoteMarkerProvenance: prior.remoteMarkerProvenance } : {}),
    };
  });
}

type LocalSyncStateMutation = (
  state: LocalSyncState | null,
) => LocalSyncState | null | undefined | Promise<LocalSyncState | null | undefined>;

interface LocalSyncStateSnapshot {
  state: LocalSyncState | null;
  targetRaw: string | null;
}

async function updateLocalSyncStateRecord(
  cwd: string,
  io: CoreIO,
  identity: string,
  mutate: LocalSyncStateMutation,
): Promise<boolean> {
  const internalDir = getUserInternalDir(cwd, identity);
  const syncStatePath = getLocalSyncStatePath(cwd, identity);
  const lockPath = getLocalSyncStateLockPath(cwd, identity);
  await ensureDir(internalDir, io.mkdir);

  for (let attempt = 0; attempt < LOCAL_SYNC_STATE_UPDATE_ATTEMPTS; attempt++) {
    const snapshot = await readLocalSyncStateSnapshot(cwd, io, identity);
    const next = await mutate(snapshot.state);
    if (!next) return false;

    const lock = await acquireAdvisoryLock(lockPath);
    try {
      const currentRaw = await readOptionalFile(io, syncStatePath);
      if (currentRaw === snapshot.targetRaw) {
        await atomicWriteJson(syncStatePath, LocalSyncStateSchema.parse(next));
        return true;
      }
    } finally {
      await releaseAdvisoryLock(lock);
    }
    if (attempt < LOCAL_SYNC_STATE_UPDATE_ATTEMPTS - 1) {
      await sleep(localSyncStateRetryBackoffMs());
    }
  }

  throw new Error(`sync-state update exceeded retry attempts: ${syncStatePath}`);
}

function localSyncStateRetryBackoffMs(): number {
  return LOCAL_SYNC_STATE_RETRY_BACKOFF_MIN_MS
    + Math.floor(Math.random() * (LOCAL_SYNC_STATE_RETRY_BACKOFF_JITTER_MS + 1));
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function readLocalSyncStateSnapshot(
  cwd: string,
  io: CoreIO,
  identity: string,
): Promise<LocalSyncStateSnapshot> {
  const targetRaw = await readOptionalFile(io, getLocalSyncStatePath(cwd, identity));
  if (targetRaw !== null) {
    const parsed = parseLocalSyncState(targetRaw);
    return { state: parsed.kind === "state" ? parsed.state : null, targetRaw };
  }

  const legacyRaw = await readOptionalFile(io, getLegacyLocalSyncStatePath(cwd, identity));
  if (legacyRaw === null) return { state: null, targetRaw: null };
  const parsed = parseLocalSyncState(legacyRaw);
  return { state: parsed.kind === "state" ? parsed.state : null, targetRaw: null };
}

async function readOptionalFile(io: CoreIO, path: string): Promise<string | null> {
  try {
    return await io.readFile(path);
  } catch (err) {
    if (isErrnoCode(err, "ENOENT")) return null;
    throw err;
  }
}

export async function recordPartialPushMarker(
  cwd: string,
  io: CoreIO,
  identity: string,
): Promise<boolean> {
  const localRefHash = await readLocalNotesRefHash(io, identity);
  if (!localRefHash) return false;

  return updateLocalSyncStateRecord(cwd, io, identity, (current) => {
    if (!current) return null;
    return {
      ...current,
      partialPush: { localRefHash, sourceCommit: current.sourceCommit },
    };
  });
}

export async function clearPartialPushMarker(
  cwd: string,
  io: CoreIO,
  identity: string,
): Promise<void> {
  await updateLocalSyncStateRecord(cwd, io, identity, (state) => {
    if (!state?.partialPush) return null;
    const next = { ...state };
    delete next.partialPush;
    return next;
  });
}

/**
 * Record the errand-ref partial-push marker — the errand leg's mirror of
 * {@link recordPartialPushMarker}. Captures the local errand ref hash so a
 * later coherence probe can surface the unpushed errand records. Returns
 * `false` when no sync-state record or no local errand ref exists; callers must
 * surface that result rather than claiming durable recovery was recorded.
 */
export async function recordErrandPartialPushMarker(
  cwd: string,
  io: CoreIO,
  identity: string,
): Promise<boolean> {
  const refHash = await readLocalErrandRefHash(io, identity);
  if (!refHash) return false;

  return updateLocalSyncStateRecord(cwd, io, identity, (current) => {
    if (!current) return null;
    return {
      ...current,
      partialPushErrand: { localRefHash: refHash, sourceCommit: refHash },
    };
  });
}

/** Clear the errand-ref partial-push marker, preserving every other field (incl. the notes marker). */
export async function clearErrandPartialPushMarker(
  cwd: string,
  io: CoreIO,
  identity: string,
): Promise<void> {
  await updateLocalSyncStateRecord(cwd, io, identity, (state) => {
    if (!state?.partialPushErrand) return null;
    const next = { ...state };
    delete next.partialPushErrand;
    return next;
  });
}

async function readLocalNotesRefHash(
  io: CoreIO,
  identity: string,
): Promise<string | null> {
  return readLocalRefHash(io, `${USER_NOTES_REF}/${identity}`);
}

/** The errand orphan state-ref for an identity; mirrors the notes-ref prefix convention. */
function errandStateRef(identity: string): string {
  return `refs/arc/user/${identity}/errands`;
}

async function readLocalErrandRefHash(
  io: CoreIO,
  identity: string,
): Promise<string | null> {
  return readLocalRefHash(io, errandStateRef(identity));
}

async function readLocalRefHash(io: CoreIO, ref: string): Promise<string | null> {
  try {
    const { stdout } = await io.exec("git", ["rev-parse", "--verify", ref]);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}
