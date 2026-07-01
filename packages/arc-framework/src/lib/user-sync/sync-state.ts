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

import { atomicWriteJson, exclusiveCreateFile } from "../fs.js";
import { ensureDir } from "../template/index.js";
import type { CoreIO } from "../types.js";

const LOCAL_SYNC_STATE_FILENAME = ".sync-state.json";
/** Dedicated canonical machine-id store — a bare UUID, raced via exclusive create. */
const MACHINE_ID_FILENAME = ".machine-id";
const USER_INTERNAL_DIRNAME = ".internal";
/** Notes ref prefix; mirrors the notes-ref module's internal `refs/notes/arc/user`. */
const USER_NOTES_REF = "refs/notes/arc/user";
/** Sentinel basis for loads that materialize shared context without a comparable branch commit. */
export const NO_COMPARABLE_SOURCE_COMMIT = "no-comparable-saved-commit";

export function isComparableSourceCommit(
  sourceCommit: string | null | undefined,
): sourceCommit is string {
  return sourceCommit !== undefined
    && sourceCommit !== null
    && sourceCommit !== NO_COMPARABLE_SOURCE_COMMIT;
}

export interface LocalSyncState {
  version: 4;
  /**
   * Legacy machine-id field — the canonical store is now the dedicated
   * `.machine-id` file (see {@link getOrCreateMachineId}). No longer written by
   * any current writer, nor surfaced by the validated {@link readLocalSyncState}
   * read; retained on the type solely so a pre-`.machine-id` record stays
   * parseable for the one-time migration adopt, which reads it via the raw read.
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

/** Absolute path to the dedicated `.machine-id` store (the canonical machine identity). */
function getMachineIdPath(cwd: string, identity: string): string {
  return join(getUserInternalDir(cwd, identity), MACHINE_ID_FILENAME);
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

/** Exclusive-create seam — defaults to the real filesystem primitive. */
export type ExclusiveCreateFn = (path: string, content: string) => Promise<void>;

/** Read-back attempts for the lost-race branch (see {@link getOrCreateMachineId}). */
const MACHINE_ID_READBACK_ATTEMPTS = 50;
const MACHINE_ID_READBACK_DELAY_MS = 2;

/**
 * Resolve this machine's stable identifier from the dedicated `.machine-id`
 * store under `user/{identity}/.internal/`, creating one on first need.
 *
 * The id is a random {@link randomUUID} — never the hostname or any environment
 * value — so it can key a sync-state marker on a ref collaborators fetch
 * without leaking machine names. The first write uses an exclusive create
 * ({@link exclusiveCreateFile}, `O_CREAT | O_EXCL`): concurrent first-callers
 * race it, exactly one wins, and every loser adopts the winner's id via an
 * `EEXIST` read-back — so two first-callers on one machine converge on a single
 * id rather than each minting a different one. On a first write, an id already
 * established under the legacy `.sync-state.json` field is adopted rather than
 * minted (preserving an existing identity); that field is read-tolerated only,
 * never written back. Idempotent: once written, every later call returns the
 * persisted id without minting.
 *
 * @param exclusiveCreate - Exclusive-create seam, defaulting to the real
 *   filesystem primitive; injectable so a test can force the lost-race branch.
 * @returns This machine's persisted machine-id.
 */
export async function getOrCreateMachineId(
  cwd: string,
  io: CoreIO,
  identity: string,
  exclusiveCreate: ExclusiveCreateFn = exclusiveCreateFile,
): Promise<string> {
  const machineIdPath = getMachineIdPath(cwd, identity);

  const existing = await readMachineIdFile(io, machineIdPath);
  if (existing) return existing;

  // On a fresh `.machine-id`, adopt an id already established under the legacy
  // `.sync-state.json` field before minting — so a machine that already has an
  // identity keeps it rather than orphaning its sync-state marker key. The
  // legacy field is read-tolerated only; nothing writes it back. Routed through
  // the same exclusive create so concurrent migrators still converge on one.
  const adopted = await readLegacyMachineId(cwd, io, identity);
  const candidate = adopted ?? randomUUID();
  try {
    await exclusiveCreate(machineIdPath, candidate);
    return candidate;
  } catch (err) {
    if (!isEexistError(err)) throw err;
    // Lost the create race: a concurrent first-caller already wrote the
    // canonical id. Adopt it so both callers converge. The winner's exclusive
    // create can momentarily precede its content write, so the read-back
    // tolerates a brief empty window before giving up.
    for (let attempt = 0; attempt < MACHINE_ID_READBACK_ATTEMPTS; attempt++) {
      const winner = await readMachineIdFile(io, machineIdPath);
      if (winner) return winner;
      await delay(MACHINE_ID_READBACK_DELAY_MS);
    }
    throw err;
  }
}

/**
 * Read the bare UUID from the `.machine-id` store, or `null` when the file is
 * absent or empty. Only a genuine `ENOENT` reads as absent; any other read failure
 * (a permission error, an unreadable store) rethrows rather than masquerading as
 * "no id yet" — masking it would mint a second identity and orphan this machine's
 * sync-state marker key.
 */
async function readMachineIdFile(io: CoreIO, machineIdPath: string): Promise<string | null> {
  let raw: string;
  try {
    raw = await io.readFile(machineIdPath);
  } catch (err) {
    if (isEnoentError(err)) return null;
    throw err;
  }
  const id = raw.trim();
  // Require the full UUID shape, not just non-empty: the winner's exclusiveCreateFile
  // creates the file before its body is fully written, so an EEXIST loser's read-back
  // can observe a partial id. Rejecting a partial keeps it in the retry/fail-closed
  // path instead of adopting a truncated id.
  return isMachineId(id) ? id : null;
}

/** Whether a string is a canonical machine id — the randomUUID shape getOrCreateMachineId mints. */
function isMachineId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(value);
}

/** Whether an error is a filesystem `EEXIST` (the lost-race signal). */
function isEexistError(err: unknown): boolean {
  return isErrnoCode(err, "EEXIST");
}

/** Whether an error is a filesystem `ENOENT` (the legitimately-absent signal). */
function isEnoentError(err: unknown): boolean {
  return isErrnoCode(err, "ENOENT");
}

function isErrnoCode(err: unknown, code: string): boolean {
  return (
    typeof err === "object"
    && err !== null
    && (err as { code?: unknown }).code === code
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  priorFileList?: string[],
): Promise<void> {
  // A save/load writes a fresh record but must not drop reserved fields a
  // downstream writer may have populated — carry them forward from the prior
  // record. partialPush is intentionally not carried (a successful save/load
  // resolves the notes partial-push condition); partialPushErrand IS carried,
  // since a notes-directory save does not resolve an errand-ref push failure.
  // `priorFileList` is the file list this sync materialized — when supplied it
  // refreshes the captured set (the drift tier's retirement-vs-arrival basis);
  // otherwise the prior record's list carries forward.
  const prior = await readLocalSyncState(cwd, io, identity);
  const resolvedPriorFileList = priorFileList ?? prior?.priorFileList;
  const internalDir = getUserInternalDir(cwd, identity);
  const syncStatePath = join(internalDir, LOCAL_SYNC_STATE_FILENAME);
  await ensureDir(internalDir, io.mkdir);
  const state: LocalSyncState = {
    version: 4,
    materializedManifestHash,
    sourceCommit,
    sourceOperation,
    savedAt: new Date().toISOString(),
    ...(verifiedAt ? { verifiedAt } : {}),
    ...(prior?.partialPushErrand ? { partialPushErrand: prior.partialPushErrand } : {}),
    ...(resolvedPriorFileList ? { priorFileList: resolvedPriorFileList } : {}),
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
