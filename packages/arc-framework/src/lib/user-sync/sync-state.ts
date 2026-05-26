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

import { join } from "node:path";

import { atomicWriteJson } from "../fs.js";
import { ensureDir } from "../template/index.js";
import type { CoreIO } from "../types.js";

const LOCAL_SYNC_STATE_FILENAME = ".sync-state.json";
const USER_INTERNAL_DIRNAME = ".internal";
/** Notes ref prefix; mirrors the notes-ref module's internal `refs/notes/arc/user`. */
const USER_NOTES_REF = "refs/notes/arc/user";

export interface LocalSyncState {
  version: 3;
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
  partialPush?: PartialPushMarker;
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
        (record.version === 2 || record.version === 3)
        && typeof record.materializedManifestHash === "string"
        && record.materializedManifestHash.length > 0
        && typeof record.sourceCommit === "string"
        && record.sourceCommit.length > 0
        && (record.sourceOperation === "save" || record.sourceOperation === "load")
      ) {
        const partialPush = parsePartialPushMarker(record.partialPush);
        return {
          version: 3,
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

export async function writeLocalSyncState(
  cwd: string,
  io: CoreIO,
  identity: string,
  materializedManifestHash: string,
  sourceCommit: string,
  sourceOperation: "save" | "load",
  verifiedAt?: string,
): Promise<void> {
  const internalDir = getUserInternalDir(cwd, identity);
  const syncStatePath = join(internalDir, LOCAL_SYNC_STATE_FILENAME);
  await ensureDir(internalDir, io.mkdir);
  const state: LocalSyncState = {
    version: 3,
    materializedManifestHash,
    sourceCommit,
    sourceOperation,
    savedAt: new Date().toISOString(),
    ...(verifiedAt ? { verifiedAt } : {}),
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
  });
}

async function readLocalNotesRefHash(
  io: CoreIO,
  identity: string,
): Promise<string | null> {
  try {
    const { stdout } = await io.exec("git", [
      "rev-parse",
      "--verify",
      `${USER_NOTES_REF}/${identity}`,
    ]);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}
