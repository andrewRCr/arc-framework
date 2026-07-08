/**
 * `arc user compact` command core.
 *
 * Composes the pure retention policy with the notes-ref snapshot writer. The
 * command owns git fact gathering and lock scope; the policy and writer stay
 * testable separately.
 *
 * @module
 */

import { join } from "node:path";

import {
  acquireAdvisoryLock,
  COMPACTION_BACKUP_RETENTION_DAYS,
  compactNotesRefSnapshot,
  decideNotesCompactionRetention,
  getNotesLockPath,
  isRemoteUnavailableError,
  listNoteEntries,
  publishNotesCompactionSyncMarker,
  readNoteContentAtAnnotatedCommit,
  releaseAdvisoryLock,
  subdirsFromPaths,
  type CompactNotesRefSnapshotResult,
  type RetentionPolicyNoteEntry,
} from "../../lib/user-sync/index.js";
import { readConfigSettings } from "../../lib/config/status-reader.js";
import {
  readShippedWorkUnitRecordsFromRef,
  type ShippedWorkUnitRecord,
} from "../../lib/work-unit/completed-index.js";
import { notesRef } from "./shared.js";
import type { UserIOContext } from "./types.js";

/** Options for `arc user compact`. */
export interface UserCompactOptions {
  cwd: string;
  io: UserIOContext;
  identity: string;
  now?: string;
}

/** Result of pruning expired backup refs. */
export interface BackupPruneResult {
  deletedRefs: string[];
  failedRefs: { ref: string; message: string }[];
}

/** Result of `arc user compact`. */
export type UserCompactResult =
  | {
    kind: "compacted";
    identity: string;
    generation: number;
    preCompactionTip: string;
    snapshotTip: string;
    backupRef: string;
    retainedCount: number;
    prunedCount: number;
    marker: "published" | "reconciled" | "skipped" | "failed";
    backupPrune: BackupPruneResult;
  }
  | { kind: "nothing-to-prune"; identity: string; retainedCount: number; prunedCount: number }
  | { kind: "lease-declined"; identity: string; preCompactionTip: string; backupRef: string; error: Error }
  | { kind: "conflict"; identity: string; message: string }
  | { kind: "no-remote"; identity: string; error: Error }
  | { kind: "failed"; identity: string; error: Error };

interface SyncManifestShape {
  version: 1 | 2;
  files: Record<string, string>;
}

const LEGACY_ROOT_SESSION_NOTES = "SESSION-NOTES.md";
const RETENTION_ENTRY_READ_CONCURRENCY = 16;

/** Run user-notes compaction under the per-identity notes lock. */
export async function runUserCompact(options: UserCompactOptions): Promise<UserCompactResult> {
  const { cwd, io, identity } = options;
  if (io.execInput === undefined) {
    return { kind: "failed", identity, error: new Error("arc user compact requires stdin-capable git I/O.") };
  }

  const now = options.now ?? new Date().toISOString();
  const fullRef = `refs/notes/${notesRef(identity)}`;
  const baseRefresh = await refreshBaseRef({ cwd, io });
  if (baseRefresh.kind !== "ok") {
    return { kind: baseRefresh.kind, identity, error: baseRefresh.error };
  }
  let lock;
  try {
    lock = await acquireAdvisoryLock(await getNotesLockPath(io.exec, cwd, identity));
  } catch (err) {
    return { kind: "failed", identity, error: errorFromUnknown(err) };
  }

  try {
    const entries = await buildRetentionEntries({ cwd, io, identity, fullRef, baseRef: baseRefresh.baseRef });
    const decision = decideNotesCompactionRetention({ entries, now });
    if (decision.pruned.length === 0) {
      return {
        kind: "nothing-to-prune",
        identity,
        retainedCount: decision.retained.length,
        prunedCount: decision.pruned.length,
      };
    }

    const snapshot = await compactNotesRefSnapshot({
      exec: io.exec,
      execInput: io.execInput,
      fullRef,
      retained: decision.retained,
      pruned: decision.pruned,
      backupCreatedAt: now,
    });
    return await completeSnapshotOutcome({
      io,
      identity,
      now,
      decision,
      snapshot,
    });
  } finally {
    await releaseAdvisoryLock(lock);
  }
}

async function completeSnapshotOutcome(input: {
  io: UserIOContext;
  identity: string;
  now: string;
  decision: { retained: RetentionPolicyNoteEntry[]; pruned: RetentionPolicyNoteEntry[] };
  snapshot: CompactNotesRefSnapshotResult;
}): Promise<UserCompactResult> {
  const { io, identity, now, decision, snapshot } = input;
  switch (snapshot.kind) {
    case "compacted": {
      const markerOutcome = io.execInput === undefined
        ? { kind: "failed" as const, error: new Error("missing execInput") }
        : await publishNotesCompactionSyncMarker(
          { exec: io.exec, execInput: io.execInput, identity },
          {
            version: 1,
            kind: "notes-compaction",
            generation: snapshot.generation,
            preCompactionTip: snapshot.preCompactionTip,
            snapshotTip: snapshot.snapshotTip,
            publishedAt: now,
          },
        );
      const backupPrune = await pruneExpiredBackupRefs({
        io,
        identity,
        now,
        currentGeneration: snapshot.generation,
        keepRef: snapshot.backupRef,
      });
      return {
        kind: "compacted",
        identity,
        generation: snapshot.generation,
        preCompactionTip: snapshot.preCompactionTip,
        snapshotTip: snapshot.snapshotTip,
        backupRef: snapshot.backupRef,
        retainedCount: snapshot.retainedCount,
        prunedCount: snapshot.prunedCount,
        marker: markerOutcome.kind,
        backupPrune,
      };
    }
    case "nothing-to-prune":
      return {
        kind: "nothing-to-prune",
        identity,
        retainedCount: decision.retained.length,
        prunedCount: decision.pruned.length,
      };
    case "lease-declined":
      return {
        kind: "lease-declined",
        identity,
        preCompactionTip: snapshot.preCompactionTip,
        backupRef: snapshot.backupRef,
        error: snapshot.error,
      };
    case "conflict":
      return { kind: "conflict", identity, message: snapshot.message };
    case "no-remote":
      return { kind: "no-remote", identity, error: snapshot.error };
    case "failed":
      return { kind: "failed", identity, error: snapshot.error };
  }
}

async function buildRetentionEntries(input: {
  cwd: string;
  io: UserIOContext;
  identity: string;
  fullRef: string;
  baseRef: string;
}): Promise<RetentionPolicyNoteEntry[]> {
  const { cwd, io, identity, fullRef, baseRef } = input;
  const shipped = await readShippedWorkUnitRecordsFromRef(io.exec, baseRef);
  const localSubdirs = await readLocalUserSubdirs({ cwd, io, identity });
  const entries = await listNoteEntries(io.exec, fullRef);

  const results: RetentionPolicyNoteEntry[] = [];
  for (let i = 0; i < entries.length; i += RETENTION_ENTRY_READ_CONCURRENCY) {
    const batch = entries.slice(i, i + RETENTION_ENTRY_READ_CONCURRENCY);
    results.push(...await Promise.all(batch.map((entry) => buildRetentionEntry({
      entry,
      io,
      fullRef,
      shipped,
      localSubdirs,
    }))));
  }
  return results;
}

async function buildRetentionEntry(input: {
  entry: Awaited<ReturnType<typeof listNoteEntries>>[number];
  io: UserIOContext;
  fullRef: string;
  shipped: ReadonlyMap<string, ShippedWorkUnitRecord>;
  localSubdirs: ReadonlySet<string>;
}): Promise<RetentionPolicyNoteEntry> {
  const { entry, io, fullRef, shipped, localSubdirs } = input;
  const [committedAt, content] = await Promise.all([
    readCommitTimestamp(io, entry.commit),
    readNoteContentAtAnnotatedCommit(io.exec, fullRef, entry.commit),
  ]);
  const manifest = content === null ? null : parseManifest(content);
  const paths = manifest === null ? [] : Object.keys(manifest.files);
  const workUnitNames = subdirsFromPaths(paths);
  const preMigrationRootSessionNotes = manifest?.files[LEGACY_ROOT_SESSION_NOTES] !== undefined;
  const inFlight = workUnitNames.some((wuName) => !shipped.has(wuName) || localSubdirs.has(wuName));

  return {
    ...entry,
    committedAt,
    workUnitNames,
    archivedAt: inFlight ? null : resolveArchivedAt(workUnitNames, shipped),
    inFlight,
    preMigrationRootSessionNotes,
  };
}

async function refreshBaseRef(input: {
  cwd: string;
  io: UserIOContext;
}): Promise<
  | { kind: "ok"; baseRef: string }
  | { kind: "no-remote" | "failed"; error: Error }
> {
  const { settings } = await readConfigSettings(input.cwd);
  const baseBranch = settings["branch.base"];
  try {
    await input.io.exec("git", ["fetch", "origin", baseBranch]);
    return { kind: "ok", baseRef: `origin/${baseBranch}` };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    return { kind: isRemoteUnavailableError(error.message) ? "no-remote" : "failed", error };
  }
}

async function readLocalUserSubdirs(input: {
  cwd: string;
  io: UserIOContext;
  identity: string;
}): Promise<Set<string>> {
  try {
    const entries = await input.io.readDir(join(input.cwd, ".arc", "user", input.identity));
    return new Set(subdirsFromPaths(entries.map((entry) => entry.name)));
  } catch {
    return new Set();
  }
}

function resolveArchivedAt(
  workUnitNames: readonly string[],
  shipped: ReadonlyMap<string, ShippedWorkUnitRecord>,
): string | null {
  if (workUnitNames.length === 0) return null;
  let latest: string | null = null;
  let latestMs = Number.NEGATIVE_INFINITY;
  for (const wuName of workUnitNames) {
    const completedAt = shipped.get(wuName)?.completedAt ?? null;
    if (completedAt === null) return null;
    const completedAtMs = Date.parse(completedAt);
    if (Number.isNaN(completedAtMs)) return null;
    if (completedAtMs > latestMs) {
      latest = completedAt;
      latestMs = completedAtMs;
    }
  }
  return latest;
}

async function readCommitTimestamp(io: UserIOContext, commit: string): Promise<string | null> {
  try {
    const { stdout } = await io.exec("git", ["show", "-s", "--format=%cI", commit]);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

function parseManifest(content: string): SyncManifestShape | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const record = parsed as Record<string, unknown>;
  if ((record.version !== 1 && record.version !== 2) || typeof record.files !== "object" || record.files === null) {
    return null;
  }
  const files: Record<string, string> = {};
  for (const [path, value] of Object.entries(record.files as Record<string, unknown>)) {
    if (typeof value !== "string") return null;
    files[path] = value;
  }
  return { version: record.version, files };
}

async function pruneExpiredBackupRefs(input: {
  io: UserIOContext;
  identity: string;
  now: string;
  currentGeneration: number;
  keepRef: string;
}): Promise<BackupPruneResult> {
  const prefix = `refs/backup/arc-user-${input.identity}-compaction-g`;
  const refs = await listCompactionBackupRefs(input.io, `${prefix}*`);
  const deletedRefs: string[] = [];
  const failedRefs: { ref: string; message: string }[] = [];
  const nowMs = Date.parse(input.now);
  const minAgeMs = COMPACTION_BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000;

  for (const ref of refs) {
    if (ref.ref === input.keepRef) continue;
    if (!Number.isFinite(nowMs) || ref.createdAtMs === null) continue;
    if (nowMs - ref.createdAtMs < minAgeMs) continue;
    if (generationFromBackupRef(ref.ref) >= input.currentGeneration) continue;
    try {
      await input.io.exec("git", ["push", "origin", `:${ref.ref}`]);
    } catch (err) {
      if (!isMissingRemoteRefDeleteError(errorFromUnknown(err).message)) {
        failedRefs.push({ ref: ref.ref, message: errorFromUnknown(err).message });
        continue;
      }
    }
    try {
      await input.io.exec("git", ["update-ref", "-d", ref.ref]);
      deletedRefs.push(ref.ref);
    } catch (err) {
      failedRefs.push({ ref: ref.ref, message: errorFromUnknown(err).message });
    }
  }

  return { deletedRefs, failedRefs };
}

async function listCompactionBackupRefs(
  io: UserIOContext,
  prefix: string,
): Promise<{ ref: string; createdAtMs: number | null }[]> {
  try {
    const { stdout } = await io.exec("git", [
      "for-each-ref",
      "--format=%(refname)",
      prefix,
    ]);
    return stdout
      .split("\n")
      .map((line) => {
        const ref = line.trim();
        if (!ref) return null;
        return { ref, createdAtMs: backupCreatedAtMsFromRef(ref) };
      })
      .filter((entry): entry is { ref: string; createdAtMs: number | null } => entry !== null);
  } catch {
    return [];
  }
}

function generationFromBackupRef(ref: string): number {
  const generation = /-compaction-g(\d+)-/u.exec(ref)?.[1];
  return generation === undefined ? Number.POSITIVE_INFINITY : Number.parseInt(generation, 10);
}

function backupCreatedAtMsFromRef(ref: string): number | null {
  const value = /-created-(\d+)-/u.exec(ref)?.[1];
  if (value === undefined) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function isMissingRemoteRefDeleteError(message: string): boolean {
  return message.includes("remote ref does not exist");
}

function errorFromUnknown(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}
