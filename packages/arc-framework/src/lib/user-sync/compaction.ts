/**
 * Git plumbing for compacting the ARC user-notes ref to a snapshot commit.
 *
 * @module
 */

import { hashBlob, readRefTip, uniqueRefToken } from "../git/ref-tree.js";
import type { GitExec, GitExecInput } from "../git/exec.js";
import {
  NOTES_COMPACTION_MANIFEST_PATH,
  buildNextNotesCompactionManifest,
  deserializeNotesCompactionManifest,
  isPairPrunedByManifest,
  serializeNotesCompactionManifest,
  type NotesCompactionManifest,
  type NotesCompactionPair,
} from "./compaction-manifest.js";
import { listNoteEntries, notePathToCommit } from "./notes-ref.js";
import { isRemoteUnavailableError } from "./notes-merge.js";

/** Inputs for publishing one compacted snapshot commit. */
export interface CompactNotesRefSnapshotInput {
  exec: GitExec;
  execInput: GitExecInput;
  /** Full notes ref, e.g. `refs/notes/arc/user/andrew`. */
  fullRef: string;
  /** Note entries to keep in the snapshot tree. */
  retained: readonly NotesCompactionPair[];
  /** Note entries to add to the cumulative pruned manifest. */
  pruned: readonly NotesCompactionPair[];
  /** Creation timestamp encoded into the backup ref for retention pruning. */
  backupCreatedAt?: string;
  /** Test seam for simulating a concurrent remote writer after local snapshot staging. */
  onBeforePublish?: () => Promise<void>;
}

/** Result of a snapshot compaction attempt. */
export type CompactNotesRefSnapshotResult =
  | {
    kind: "compacted";
    preCompactionTip: string;
    snapshotTip: string;
    backupRef: string;
    generation: number;
    prunedCount: number;
    retainedCount: number;
  }
  | { kind: "nothing-to-prune" }
  | { kind: "lease-declined"; preCompactionTip: string; backupRef: string; error: Error }
  | { kind: "conflict"; message: string }
  | { kind: "no-remote"; error: Error }
  | { kind: "failed"; error: Error };

/** Inputs for adopting a fetched compacted snapshot into a lagging local notes ref. */
export interface AdoptCompactedNotesRefInput {
  exec: GitExec;
  execInput: GitExecInput;
  fullRef: string;
  /** Local temp/ref carrying the fetched compacted snapshot. */
  snapshotRef: string;
}

/** Result of a compaction-aware adopt. */
export type AdoptCompactedNotesRefResult =
  | {
    kind: "adopted";
    generation: number;
    restoredCount: number;
    droppedPrunedCount: number;
    warnings: string[];
  }
  | { kind: "not-newer" }
  | { kind: "conflict"; message: string }
  | { kind: "failed"; error: Error };

/** Read the in-band compaction manifest from a notes ref or commit-ish. */
export async function readNotesCompactionManifest(
  exec: GitExec,
  ref: string,
): Promise<NotesCompactionManifest | null> {
  let stdout: string;
  try {
    ({ stdout } = await exec("git", ["show", `${ref}:${NOTES_COMPACTION_MANIFEST_PATH}`]));
  } catch {
    return null;
  }
  const manifest = deserializeNotesCompactionManifest(stdout);
  if (manifest === null) {
    throw new Error(`Invalid notes compaction manifest at ${ref}:${NOTES_COMPACTION_MANIFEST_PATH}`);
  }
  return manifest;
}

/** Compact a notes ref to a single snapshot commit and lease-publish it to origin. */
export async function compactNotesRefSnapshot(
  input: CompactNotesRefSnapshotInput,
): Promise<CompactNotesRefSnapshotResult> {
  const { exec, execInput, fullRef, retained, pruned } = input;
  const preCompactionTip = await readRefTip(exec, fullRef);
  if (preCompactionTip === null || pruned.length === 0) return { kind: "nothing-to-prune" };

  const remoteTip = await readRemoteRefTip(exec, fullRef);
  if (remoteTip.kind === "error") {
    return { kind: "no-remote", error: remoteTip.error };
  }
  if (remoteTip.tip !== preCompactionTip) {
    return {
      kind: "conflict",
      message: "Cannot compact user notes: local and origin notes refs differ. Sync notes before compacting.",
    };
  }

  let previous: NotesCompactionManifest | null;
  try {
    previous = await readNotesCompactionManifest(exec, fullRef);
  } catch (err) {
    return { kind: "failed", error: toError(err) };
  }
  const manifest = buildNextNotesCompactionManifest({
    previous,
    preCompactionTip,
    pruned,
  });
  const backupRef = backupRefFor(fullRef, manifest.generation, input.backupCreatedAt ?? new Date().toISOString());
  const snapshotTip = await buildSnapshotCommit({
    exec,
    execInput,
    retained,
    manifestContent: serializeNotesCompactionManifest(manifest),
  });

  try {
    await exec("git", ["push", "origin", `${preCompactionTip}:${backupRef}`]);
  } catch (err) {
    const error = toError(err);
    if (isRemoteUnavailableError(error.message)) return { kind: "no-remote", error };
    return { kind: "failed", error };
  }

  try {
    await exec("git", ["update-ref", fullRef, snapshotTip, preCompactionTip]);
  } catch (err) {
    return { kind: "failed", error: toError(err) };
  }

  try {
    await input.onBeforePublish?.();
    await exec("git", [
      "push",
      `--force-with-lease=${fullRef}:${preCompactionTip}`,
      "origin",
      `${snapshotTip}:${fullRef}`,
    ]);
  } catch (err) {
    const error = toError(err);
    await rollbackLocalSnapshot(exec, fullRef, preCompactionTip, snapshotTip);
    if (isLeaseDecline(error.message)) {
      return { kind: "lease-declined", preCompactionTip, backupRef, error };
    }
    if (isRemoteUnavailableError(error.message)) return { kind: "no-remote", error };
    return { kind: "failed", error };
  }

  return {
    kind: "compacted",
    preCompactionTip,
    snapshotTip,
    backupRef,
    generation: manifest.generation,
    prunedCount: pruned.length,
    retainedCount: retained.length,
  };
}

/** Adopt a newer compacted snapshot, re-exporting local-only notes without crossing the history boundary. */
export async function adoptCompactedNotesRef(
  input: AdoptCompactedNotesRefInput,
): Promise<AdoptCompactedNotesRefResult> {
  const { exec, execInput, fullRef, snapshotRef } = input;
  let manifest: NotesCompactionManifest | null;
  let localManifest: NotesCompactionManifest | null;
  try {
    manifest = await readNotesCompactionManifest(exec, snapshotRef);
    localManifest = await readNotesCompactionManifest(exec, fullRef);
  } catch (err) {
    return { kind: "failed", error: toError(err) };
  }
  if (manifest === null) return { kind: "not-newer" };
  if (manifest.generation <= (localManifest?.generation ?? 0)) return { kind: "not-newer" };

  const localTip = await readRefTip(exec, fullRef);
  const snapshotTip = await readRefTip(exec, snapshotRef);
  if (snapshotTip === null) {
    return { kind: "failed", error: new Error(`Compacted snapshot ref does not resolve: ${snapshotRef}`) };
  }

  const adoptRef = `${fullRef}__compact_adopt_${uniqueRefToken()}`;
  const snapshotEntries = new Map((await listNoteEntries(exec, snapshotRef)).map((entry) => [entry.commit, entry.blob]));
  const localEntries = localTip === null ? [] : await listNoteEntries(exec, fullRef);
  const preCompactionEntries = manifest.preCompactionTip === null
    ? new Map<string, string>()
    : new Map((await listNoteTreeEntries(exec, manifest.preCompactionTip)).map((entry) => [entry.commit, entry.blob]));

  let restoredCount = 0;
  let droppedPrunedCount = 0;
  const warnings: string[] = [];

  try {
    await exec("git", ["update-ref", adoptRef, snapshotTip]);
    for (const entry of localEntries) {
      const snapshotBlob = snapshotEntries.get(entry.commit);
      if (snapshotBlob === entry.blob) continue;
      if (isPairPrunedByManifest(manifest, entry)) {
        droppedPrunedCount += 1;
        continue;
      }

      if (snapshotBlob !== undefined) {
        const merged = await mergeCollisionNoteBlobs({
          exec,
          execInput,
          leftBlob: snapshotBlob,
          rightBlob: entry.blob,
        });
        if (merged.kind === "conflict") {
          return {
            kind: "conflict",
            message:
              `Concurrent notes on commit ${entry.commit.slice(0, 8)} could not be auto-merged `
              + "across the compaction snapshot. Local notes are preserved; resolve the note and retry.",
          };
        }
        await exec("git", ["notes", `--ref=${adoptRef}`, "add", "-f", "-C", merged.blob, entry.commit]);
        restoredCount += 1;
        continue;
      }

      if (preCompactionEntries.get(entry.commit) === entry.blob) {
        warnings.push(
          `Generation ${manifest.generation} snapshot omitted pre-compaction note ${entry.commit.slice(0, 8)}.`,
        );
      }
      await exec("git", ["notes", `--ref=${adoptRef}`, "add", "-f", "-C", entry.blob, entry.commit]);
      restoredCount += 1;
    }

    const adoptedTip = await readRefTip(exec, adoptRef);
    if (adoptedTip === null) {
      return { kind: "failed", error: new Error("Compaction adopt did not produce a notes ref.") };
    }
    if (localTip === null) {
      await exec("git", ["update-ref", fullRef, adoptedTip, ""]);
    } else {
      await exec("git", ["update-ref", fullRef, adoptedTip, localTip]);
    }
    return {
      kind: "adopted",
      generation: manifest.generation,
      restoredCount,
      droppedPrunedCount,
      warnings,
    };
  } catch (err) {
    return { kind: "failed", error: toError(err) };
  } finally {
    await deleteRef(exec, adoptRef);
  }
}

async function buildSnapshotCommit(input: {
  exec: GitExec;
  execInput: GitExecInput;
  retained: readonly NotesCompactionPair[];
  manifestContent: string;
}): Promise<string> {
  const entries = new Map<string, string>();
  for (const entry of input.retained) {
    entries.set(entry.commit, entry.blob);
  }
  const manifestBlob = await hashBlob(input.execInput, input.manifestContent);
  entries.set(NOTES_COMPACTION_MANIFEST_PATH, manifestBlob);

  const treeInput = [...entries.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([path, blob]) => `100644 blob ${blob}\t${path}`)
    .join("\n") + "\n";
  const treeSha = (await input.execInput(["mktree"], treeInput)).trim();
  const { stdout } = await input.exec("git", ["commit-tree", treeSha, "-m", "user notes compaction snapshot"]);
  return stdout.trim();
}

async function readRemoteRefTip(
  exec: GitExec,
  ref: string,
): Promise<{ kind: "ok"; tip: string | null } | { kind: "error"; error: Error }> {
  try {
    const { stdout } = await exec("git", ["ls-remote", "origin", ref]);
    const line = stdout
      .split("\n")
      .map((entry) => entry.trim())
      .find((entry) => entry.length > 0);
    const [tip] = line?.split(/\s+/u) ?? [];
    return { kind: "ok", tip: tip ?? null };
  } catch (err) {
    return { kind: "error", error: toError(err) };
  }
}

async function listNoteTreeEntries(exec: GitExec, ref: string): Promise<NotesCompactionPair[]> {
  try {
    const { stdout } = await exec("git", ["ls-tree", "-r", ref]);
    return stdout
      .split("\n")
      .map(parseLsTreeNoteEntry)
      .filter((entry): entry is NotesCompactionPair => entry !== null);
  } catch {
    return [];
  }
}

function parseLsTreeNoteEntry(line: string): NotesCompactionPair | null {
  const match = /^\d{6} blob ([0-9a-f]{40}|[0-9a-f]{64})\t(.+)$/u.exec(line.trimEnd());
  if (!match) return null;
  const [, blob, path] = match;
  if (blob === undefined || path === undefined) return null;
  const commit = notePathToCommit(path);
  return commit === null ? null : { blob, commit };
}

async function mergeCollisionNoteBlobs(input: {
  exec: GitExec;
  execInput: GitExecInput;
  leftBlob: string;
  rightBlob: string;
}): Promise<{ kind: "merged"; blob: string } | { kind: "conflict" }> {
  const [left, right] = await Promise.all([
    readBlob(input.exec, input.leftBlob),
    readBlob(input.exec, input.rightBlob),
  ]);
  const merged = mergeManifestContent(left, right);
  if (merged === null) return { kind: "conflict" };
  return { kind: "merged", blob: await hashBlob(input.execInput, merged) };
}

async function readBlob(exec: GitExec, blob: string): Promise<string> {
  const { stdout } = await exec("git", ["cat-file", "-p", blob]);
  return stdout;
}

function mergeManifestContent(left: string, right: string): string | null {
  const leftManifest = parseSyncManifest(left);
  const rightManifest = parseSyncManifest(right);
  if (leftManifest === null || rightManifest === null) return null;

  const files = new Map<string, string>();
  for (const [path, content] of Object.entries(leftManifest.files)) {
    files.set(path, content);
  }
  for (const [path, content] of Object.entries(rightManifest.files)) {
    const existing = files.get(path);
    if (existing === undefined) {
      files.set(path, content);
    } else if (existing !== content) {
      return null;
    }
  }

  return JSON.stringify({
    version: Math.max(leftManifest.version, rightManifest.version) as 1 | 2,
    files: Object.fromEntries([...files.entries()].sort(([a], [b]) => a.localeCompare(b))),
  });
}

function parseSyncManifest(content: string): { version: 1 | 2; files: Record<string, string> } | null {
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

async function rollbackLocalSnapshot(
  exec: GitExec,
  fullRef: string,
  preCompactionTip: string,
  snapshotTip: string,
): Promise<void> {
  try {
    await exec("git", ["update-ref", fullRef, preCompactionTip, snapshotTip]);
  } catch {
    // The caller reports the publish failure; a rollback failure leaves the backup ref for recovery.
  }
}

async function deleteRef(exec: GitExec, ref: string): Promise<void> {
  try {
    await exec("git", ["update-ref", "-d", ref]);
  } catch {
    // Best-effort temp-ref cleanup.
  }
}

function backupRefFor(fullRef: string, generation: number, createdAt: string): string {
  const safe = fullRef.replace(/^refs\/notes\//u, "").replaceAll("/", "-");
  const createdAtMs = Date.parse(createdAt);
  const createdToken = Number.isNaN(createdAtMs) ? Date.now() : Math.trunc(createdAtMs);
  return `refs/backup/${safe}-compaction-g${generation}-created-${createdToken}-${uniqueRefToken()}`;
}

function isLeaseDecline(message: string): boolean {
  return message.includes("stale info")
    || message.includes("would clobber")
    || message.includes("fetch first")
    || message.includes("[rejected]");
}

function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}
