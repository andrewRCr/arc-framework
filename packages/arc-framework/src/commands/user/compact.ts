/**
 * `arc user compact` command core.
 *
 * Composes the pure retention policy with the notes-ref snapshot writer. The
 * command owns git fact gathering and lock scope; the policy and writer stay
 * testable separately.
 *
 * @module
 */

import {
  acquireAdvisoryLock,
  COMPACTION_BACKUP_RETENTION_DAYS,
  compactNotesRefSnapshot,
  decideNotesCompactionRetention,
  getNotesLockPath,
  listNoteEntries,
  publishNotesCompactionSyncMarker,
  readNoteContentAtAnnotatedCommit,
  releaseAdvisoryLock,
  subdirsFromPaths,
  type CompactNotesRefSnapshotResult,
  type RetentionPolicyNoteEntry,
} from "../../lib/user-sync/index.js";
import { readConfigSettings } from "../../lib/config/status-reader.js";
import { readShippedWorkUnitsFromRef } from "../../lib/work-unit/completed-index.js";
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

/** Run user-notes compaction under the per-identity notes lock. */
export async function runUserCompact(options: UserCompactOptions): Promise<UserCompactResult> {
  const { cwd, io, identity } = options;
  if (io.execInput === undefined) {
    return { kind: "failed", identity, error: new Error("arc user compact requires stdin-capable git I/O.") };
  }

  const now = options.now ?? new Date().toISOString();
  const fullRef = `refs/notes/${notesRef(identity)}`;
  const lock = await acquireAdvisoryLock(await getNotesLockPath(io.exec, cwd, identity));

  try {
    const entries = await buildRetentionEntries({ cwd, io, identity, fullRef });
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
}): Promise<RetentionPolicyNoteEntry[]> {
  const { cwd, io, fullRef } = input;
  const { settings } = await readConfigSettings(cwd);
  const shipped = await readShippedWorkUnitsFromRef(io.exec, `origin/${settings["branch.base"]}`);
  const entries = await listNoteEntries(io.exec, fullRef);

  return Promise.all(entries.map(async (entry): Promise<RetentionPolicyNoteEntry> => {
    const [committedAt, content] = await Promise.all([
      readCommitTimestamp(io, entry.commit),
      readNoteContentAtAnnotatedCommit(io.exec, fullRef, entry.commit),
    ]);
    const manifest = content === null ? null : parseManifest(content);
    const paths = manifest === null ? [] : Object.keys(manifest.files);
    const workUnitNames = subdirsFromPaths(paths);
    const preMigrationRootSessionNotes = manifest?.files[LEGACY_ROOT_SESSION_NOTES] !== undefined;
    const inFlight = workUnitNames.some((wuName) => !shipped.has(wuName));

    return {
      ...entry,
      committedAt,
      workUnitNames,
      archivedAt: workUnitNames.length === 0 || inFlight ? null : committedAt,
      inFlight,
      preMigrationRootSessionNotes,
    };
  }));
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
  const refs = await listCompactionBackupRefs(input.io, prefix);
  const deletedRefs: string[] = [];
  const failedRefs: { ref: string; message: string }[] = [];
  const nowMs = Date.parse(input.now);
  const minAgeMs = COMPACTION_BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000;

  for (const ref of refs) {
    if (ref.ref === input.keepRef) continue;
    if (!Number.isFinite(nowMs) || Number.isNaN(ref.committedAtMs)) continue;
    if (nowMs - ref.committedAtMs < minAgeMs) continue;
    if (generationFromBackupRef(ref.ref) >= input.currentGeneration) continue;
    try {
      await input.io.exec("git", ["push", "origin", `:${ref.ref}`]);
      await input.io.exec("git", ["update-ref", "-d", ref.ref]);
      deletedRefs.push(ref.ref);
    } catch (err) {
      failedRefs.push({ ref: ref.ref, message: err instanceof Error ? err.message : String(err) });
    }
  }

  return { deletedRefs, failedRefs };
}

async function listCompactionBackupRefs(
  io: UserIOContext,
  prefix: string,
): Promise<{ ref: string; committedAtMs: number }[]> {
  try {
    const { stdout } = await io.exec("git", [
      "for-each-ref",
      "--format=%(refname)%00%(committerdate:unix)",
      prefix,
    ]);
    return stdout
      .split("\n")
      .map((line) => {
        const [ref, timestamp] = line.split("\0");
        if (!ref || !timestamp) return null;
        return { ref, committedAtMs: Number.parseInt(timestamp, 10) * 1000 };
      })
      .filter((entry): entry is { ref: string; committedAtMs: number } => entry !== null);
  } catch {
    return [];
  }
}

function generationFromBackupRef(ref: string): number {
  const generation = /-compaction-g(\d+)-/u.exec(ref)?.[1];
  return generation === undefined ? Number.POSITIVE_INFINITY : Number.parseInt(generation, 10);
}
