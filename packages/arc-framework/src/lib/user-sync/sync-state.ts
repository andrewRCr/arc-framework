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
 * return a parsed record or `null` — never throwing — so a later schema
 * validator can swap in mechanically.
 *
 * @module
 */

import { randomUUID } from "node:crypto";
import { join } from "node:path";

import { atomicWriteJson } from "../fs.js";
import { ensureDir } from "../template/index.js";
import type { CoreIO } from "../types.js";

const LOCAL_SYNC_STATE_FILENAME = ".sync-state.json";
const USER_INTERNAL_DIRNAME = ".internal";
/** Notes ref prefix; mirrors the notes-ref module's internal `refs/notes/arc/user`. */
const USER_NOTES_REF = "refs/notes/arc/user";

export interface LocalSyncState {
  version: 4;
  /**
   * This machine's stable random identifier — a UUID generated once on first
   * need (see {@link getOrCreateMachineId}) and persisted here so a sibling
   * sync-state marker can be keyed per machine without ever leaking the
   * hostname. Additive and optional: records written before a machine-id was
   * needed hydrate without it, and a machine-id may be persisted on its own
   * (before any save/load has written a complete record).
   */
  machineId?: string;
  materializedManifestHash: string;
  sourceCommit: string;
  sourceOperation: "save" | "load";
  /**
   * ISO-8601 timestamp when this record was written. Optional in memory because
   * v2 records on disk predate the field — they hydrate with `savedAt: undefined`
   * and pick up a populated value on the next save.
   */
  savedAt?: string;
  verifiedAt?: string;
  /** This worktree's partial-push recovery marker. The `.sync-state.json` file is per-worktree. */
  partialPush?: PartialPushMarker;
  /**
   * This worktree's errand-ref partial-push recovery marker — the errand leg's
   * independent mirror of {@link partialPush}. Recorded when the errand-ref push
   * leg fails after a worktree push succeeds; cleared on a successful errand
   * push. Kept separate from the notes marker so the two refs recover
   * independently. Optional and additive — pre-existing records hydrate without
   * it (see the reserved-field convention above).
   */
  partialPushErrand?: PartialPushMarker;
  /**
   * Reserved extension point for the downstream drift tier — the file list
   * captured at last sync. Not written here; carried forward round-trip so a
   * later writer can populate it without a further version bump.
   */
  priorFileList?: string[];
  /**
   * Reserved extension point for the downstream remote partial-push marker's
   * provenance, keyed per worktree so one remote marker can represent multiple
   * worktrees without a further version bump. A per-worktree map
   * (pluralizable), not a scalar; values stay generic until that work commits
   * a shape. Not written here; carried forward round-trip.
   */
  remoteMarkerProvenance?: Record<string, unknown>;
}

export interface PartialPushMarker {
  localRefHash: string;
  sourceCommit: string;
}

/** Absolute path to the user's `.internal/` bookkeeping directory. */
export function getUserInternalDir(cwd: string, identity: string): string {
  return join(cwd, ".arc", "user", identity, USER_INTERNAL_DIRNAME);
}

export async function readLocalSyncState(
  cwd: string,
  io: CoreIO,
  identity: string,
): Promise<LocalSyncState | null> {
  for (const syncStatePath of [
    join(getUserInternalDir(cwd, identity), LOCAL_SYNC_STATE_FILENAME),
    join(cwd, ".arc", "user", identity, LOCAL_SYNC_STATE_FILENAME),
  ]) {
    let raw: string;
    try {
      raw = await io.readFile(syncStatePath);
    } catch {
      continue;
    }

    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== "object" || parsed === null) {
        continue;
      }
      const record = parsed as Record<string, unknown>;

      if (
        (record.version === 2 || record.version === 3 || record.version === 4)
        && typeof record.materializedManifestHash === "string"
        && record.materializedManifestHash.length > 0
        && typeof record.sourceCommit === "string"
        && record.sourceCommit.length > 0
        && (record.sourceOperation === "save" || record.sourceOperation === "load")
      ) {
        const partialPush = parsePartialPushMarker(record.partialPush);
        const partialPushErrand = parsePartialPushMarker(record.partialPushErrand);
        return {
          version: 4,
          ...(typeof record.machineId === "string" && record.machineId.length > 0
            ? { machineId: record.machineId }
            : {}),
          materializedManifestHash: record.materializedManifestHash,
          sourceCommit: record.sourceCommit,
          sourceOperation: record.sourceOperation,
          ...(typeof record.savedAt === "string" && record.savedAt.length > 0
            ? { savedAt: record.savedAt }
            : {}),
          ...(typeof record.verifiedAt === "string" && record.verifiedAt.length > 0
            ? { verifiedAt: record.verifiedAt }
            : {}),
          ...(partialPush ? { partialPush } : {}),
          ...(partialPushErrand ? { partialPushErrand } : {}),
          ...(isPriorFileList(record.priorFileList) ? { priorFileList: record.priorFileList } : {}),
          ...(isProvenanceMap(record.remoteMarkerProvenance)
            ? { remoteMarkerProvenance: record.remoteMarkerProvenance }
            : {}),
        };
      }
    } catch {
      return null;
    }
  }

  return null;
}

function parsePartialPushMarker(value: unknown): PartialPushMarker | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.localRefHash !== "string" ||
    record.localRefHash.length === 0 ||
    typeof record.sourceCommit !== "string" ||
    record.sourceCommit.length === 0
  ) {
    return null;
  }
  return {
    localRefHash: record.localRefHash,
    sourceCommit: record.sourceCommit,
  };
}

/** A reserved `priorFileList` worth carrying forward: an array of strings. */
function isPriorFileList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

/** A reserved provenance value worth carrying forward: a (per-worktree) object map. */
function isProvenanceMap(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Resolve this machine's stable identifier, generating and persisting one on
 * first need. Idempotent: once written, every later call returns the same
 * UUID. The id is a random {@link randomUUID} — never the hostname or any
 * environment value — so it can key a sync-state marker on a ref collaborators
 * fetch without leaking machine names.
 *
 * The id is read and persisted independently of the full sync-state record's
 * schema validation (see {@link readPersistedMachineId}), so it is available
 * before any save/load has written a complete record.
 *
 * @returns This machine's persisted machine-id.
 */
export async function getOrCreateMachineId(
  cwd: string,
  io: CoreIO,
  identity: string,
): Promise<string> {
  const existing = await readPersistedMachineId(cwd, io, identity);
  if (existing) return existing;

  const machineId = randomUUID();
  const raw = await readSyncStateRaw(cwd, io, identity);
  const internalDir = getUserInternalDir(cwd, identity);
  await ensureDir(internalDir, io.mkdir);
  // Merge into any existing record so a machine-id written before a full
  // save/load record exists is preserved when that record later lands, and
  // vice versa.
  await atomicWriteJson(join(internalDir, LOCAL_SYNC_STATE_FILENAME), {
    ...(raw ?? {}),
    machineId,
  });
  return machineId;
}

/**
 * The persisted machine-id, read directly from `.sync-state.json` and bypassing
 * the full-record schema validation — a machine-id can legitimately exist on a
 * record that carries no save/load fields yet. Returns `null` when none is
 * stored.
 */
async function readPersistedMachineId(
  cwd: string,
  io: CoreIO,
  identity: string,
): Promise<string | null> {
  const raw = await readSyncStateRaw(cwd, io, identity);
  const machineId = raw?.machineId;
  return typeof machineId === "string" && machineId.length > 0 ? machineId : null;
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
    } catch {
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
): Promise<void> {
  // A save/load writes a fresh record but must not drop reserved fields a
  // downstream writer may have populated — carry them forward from the prior
  // record. partialPush is intentionally not carried (a successful save/load
  // resolves the notes partial-push condition); partialPushErrand IS carried,
  // since a notes-directory save does not resolve an errand-ref push failure.
  const prior = await readLocalSyncState(cwd, io, identity);
  // A machine-id may have been persisted on a record with no save/load fields,
  // which the validated read above returns as null — fall back to the raw read
  // so the id survives the first complete record this write lands.
  const machineId = prior?.machineId ?? (await readPersistedMachineId(cwd, io, identity)) ?? undefined;
  const internalDir = getUserInternalDir(cwd, identity);
  const syncStatePath = join(internalDir, LOCAL_SYNC_STATE_FILENAME);
  await ensureDir(internalDir, io.mkdir);
  const state: LocalSyncState = {
    version: 4,
    ...(machineId ? { machineId } : {}),
    materializedManifestHash,
    sourceCommit,
    sourceOperation,
    savedAt: new Date().toISOString(),
    ...(verifiedAt ? { verifiedAt } : {}),
    ...(prior?.partialPushErrand ? { partialPushErrand: prior.partialPushErrand } : {}),
    ...(prior?.priorFileList ? { priorFileList: prior.priorFileList } : {}),
    ...(prior?.remoteMarkerProvenance ? { remoteMarkerProvenance: prior.remoteMarkerProvenance } : {}),
  };
  await atomicWriteJson(syncStatePath, state);
}

async function writeLocalSyncStateRecord(
  cwd: string,
  io: CoreIO,
  identity: string,
  state: LocalSyncState,
): Promise<void> {
  const internalDir = getUserInternalDir(cwd, identity);
  const syncStatePath = join(internalDir, LOCAL_SYNC_STATE_FILENAME);
  await ensureDir(internalDir, io.mkdir);
  await atomicWriteJson(syncStatePath, state);
}

export async function recordPartialPushMarker(
  cwd: string,
  io: CoreIO,
  identity: string,
): Promise<boolean> {
  const state = await readLocalSyncState(cwd, io, identity);
  if (!state) return false;

  const localRefHash = await readLocalNotesRefHash(io, identity);
  if (!localRefHash) return false;

  await writeLocalSyncStateRecord(cwd, io, identity, {
    ...state,
    partialPush: { localRefHash, sourceCommit: state.sourceCommit },
  });
  return true;
}

export async function clearPartialPushMarker(
  cwd: string,
  io: CoreIO,
  identity: string,
): Promise<void> {
  const state = await readLocalSyncState(cwd, io, identity);
  if (!state?.partialPush) return;

  await writeLocalSyncStateRecord(cwd, io, identity, {
    version: state.version,
    ...(state.machineId ? { machineId: state.machineId } : {}),
    materializedManifestHash: state.materializedManifestHash,
    sourceCommit: state.sourceCommit,
    sourceOperation: state.sourceOperation,
    ...(state.savedAt ? { savedAt: state.savedAt } : {}),
    ...(state.verifiedAt ? { verifiedAt: state.verifiedAt } : {}),
    ...(state.partialPushErrand ? { partialPushErrand: state.partialPushErrand } : {}),
    ...(state.priorFileList ? { priorFileList: state.priorFileList } : {}),
    ...(state.remoteMarkerProvenance ? { remoteMarkerProvenance: state.remoteMarkerProvenance } : {}),
  });
}

/**
 * Record the errand-ref partial-push marker — the errand leg's mirror of
 * {@link recordPartialPushMarker}. Captures the local errand ref hash so a
 * later coherence probe can surface the unpushed errand records. Returns
 * `false` when no sync-state record or no local errand ref exists.
 */
export async function recordErrandPartialPushMarker(
  cwd: string,
  io: CoreIO,
  identity: string,
): Promise<boolean> {
  const state = await readLocalSyncState(cwd, io, identity);
  if (!state) return false;

  const refHash = await readLocalErrandRefHash(io, identity);
  if (!refHash) return false;

  await writeLocalSyncStateRecord(cwd, io, identity, {
    ...state,
    partialPushErrand: { localRefHash: refHash, sourceCommit: refHash },
  });
  return true;
}

/** Clear the errand-ref partial-push marker, preserving every other field (incl. the notes marker). */
export async function clearErrandPartialPushMarker(
  cwd: string,
  io: CoreIO,
  identity: string,
): Promise<void> {
  const state = await readLocalSyncState(cwd, io, identity);
  if (!state?.partialPushErrand) return;

  await writeLocalSyncStateRecord(cwd, io, identity, {
    version: state.version,
    ...(state.machineId ? { machineId: state.machineId } : {}),
    materializedManifestHash: state.materializedManifestHash,
    sourceCommit: state.sourceCommit,
    sourceOperation: state.sourceOperation,
    ...(state.savedAt ? { savedAt: state.savedAt } : {}),
    ...(state.verifiedAt ? { verifiedAt: state.verifiedAt } : {}),
    ...(state.partialPush ? { partialPush: state.partialPush } : {}),
    ...(state.priorFileList ? { priorFileList: state.priorFileList } : {}),
    ...(state.remoteMarkerProvenance ? { remoteMarkerProvenance: state.remoteMarkerProvenance } : {}),
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
