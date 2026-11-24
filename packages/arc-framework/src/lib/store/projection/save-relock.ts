/** Close archive openings only after a read-only file's final check proves its bytes are stored. */
import { chmod, lstat, readFile } from "node:fs/promises";
import { join } from "node:path";
import { renderRemedyArgument } from "../../../scripts/integration/spine-refusal.js";
import { gitBlobId, storedBlobId } from "./blob-id.js";
import { checkChange, readReference, readStat, readStoredText } from "./change-detection.js";
import { commitProjectionIndex } from "./index-file.js";
import { withProjectionEntry } from "./index-memory.js";
import type { ProjectionIndex, RecordEntry, RefusedMark } from "./index-schema.js";
import { isOwnSaveLanding } from "./lay-mode.js";
import { projectionProcessState, type ProjectionRootState } from "./process-state.js";
import { SETTLE_WINDOW_NS, wallClockNs } from "./read-gate.js";
import type { ProjectionFileWriteObservation } from "./file-write-observation.js";

type Send = (index: ProjectionIndex, path: string, entry: RecordEntry) => Promise<{
  index: ProjectionIndex; observation: ProjectionFileWriteObservation;
}>;

/** Settle the saving checkout's opened files inside its existing start lease, before refresh can re-lay them. */
export async function relockOpenedProjectionFiles(root: ProjectionRootState, initial: ProjectionIndex,
  outcomes: ReadonlyMap<string, ProjectionFileWriteObservation>, send: Send): Promise<ProjectionIndex> {
  if (!isOwnSaveLanding(root.context.verb, root.checkout)) return initial;
  let index = initial;
  for (const [path, original] of Object.entries(initial.entries)) {
    if (original.opened !== true) continue;
    if (original.kind !== "record") {
      reportRetained(root, path, original.refused ?? pendingMark());
      continue;
    }
    index = await settleFile(root, index, path, original, outcomes.get(path), send);
  }
  return index;
}

async function settleFile(root: ProjectionRootState, index: ProjectionIndex, path: string, entry: RecordEntry,
  outcome: ProjectionFileWriteObservation | undefined, send: Send): Promise<ProjectionIndex> {
  const admission = await relockAdmission(root, path, entry, outcome);
  if ("mark" in admission) return retain(root, index, path, entry, admission.mark, admission.writable);
  await root.checkpoint?.();
  const modeFailure = await changeOpeningMode(root, path, admission.mode & ~0o222);
  if (modeFailure !== null) return retain(root, index, path, entry, modeFailure, false);
  if (outcome === undefined) await root.ports.hooks?.afterSaveReadOnly?.(path);
  await root.ports.hooks?.beforeSaveMarkClear?.(path);
  const changed = await readRelockedChange(root, path, entry, outcome);
  if ("mark" in changed) return retain(root, index, path, entry, changed.mark);
  if (changed.stat.size === 0n && admission.size !== 0n) return retain(root, index, path, entry, emptiedMark(path));
  if (changed.status !== "changed") return finishUnchanged(root, index, path, entry, outcome, changed.stat.size);
  if (outcome !== undefined) return retain(root, index, path, entry, pendingMark());
  const sent = await send(index, path, entry), current = sent.index.entries[path];
  if (current?.kind !== "record") return sent.index;
  return finishLateEdit(root, sent.index, path, current, sent.observation);
}

async function finishLateEdit(root: ProjectionRootState, index: ProjectionIndex, path: string, entry: RecordEntry,
  outcome: ProjectionFileWriteObservation): Promise<ProjectionIndex> {
  if (outcome.rebuilt) return retain(root, index, path, entry, pendingMark(), false);
  if (failedInstallation(outcome)) return retain(root, index, path, entry, outcomeMark(entry, outcome));
  await root.ports.hooks?.beforeSaveMarkClear?.(path);
  const changed = await readRelockedChange(root, path, entry, outcome);
  if ("mark" in changed) return retain(root, index, path, entry, changed.mark);
  return changed.status === "changed" ? retain(root, index, path, entry, pendingMark())
    : finishUnchanged(root, index, path, entry, outcome, changed.stat.size);
}

/** Close an opening whose file holds no edit, first recording text that differs from the projected bytes in line endings. */
async function finishUnchanged(root: ProjectionRootState, index: ProjectionIndex, path: string, entry: RecordEntry,
  outcome: ProjectionFileWriteObservation | undefined, checkedSize: bigint): Promise<ProjectionIndex> {
  if (outcome?.result.answer !== "no-edit" || path.endsWith(".md")) return finishRelock(root, index, path, entry, checkedSize);
  const accepted = await acceptTextAtRest(root, path, entry);
  return accepted === null ? retain(root, index, path, entry, pendingMark()) : finishRelock(root, index, path, accepted, checkedSize);
}

/**
 * The bytes a no-edit save leaves at rest become the entry's projected ones, so each later check, which compares
 * bytes, reads the file as unchanged. One read between two equal stats supplies both the comparison and the record.
 */
async function acceptTextAtRest(root: ProjectionRootState, path: string, entry: RecordEntry): Promise<RecordEntry | null> {
  const file = join(root.checkout, path), { format } = root.context;
  const before = await readStat(file), bytes = await allowMissingFile(readFile(file)), after = await readStat(file);
  if (bytes === null || before?.type !== "file" || after?.type !== "file") return null;
  if (before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ino !== after.ino) return null;
  const written = gitBlobId(bytes, format);
  if (written === entry.written) return entry;
  if (storedBlobId(bytes.toString("utf8"), { format, markdown: false }) !== entry.written) return null;
  return { ...entry, written, stat: after };
}

async function readRelockedChange(root: ProjectionRootState, path: string, entry: RecordEntry,
  outcome: ProjectionFileWriteObservation | undefined) {
  // A no-edit check of ordinary text compares normalized line endings against the projected bytes.
  const reader = outcome?.result.answer === "no-edit" && !path.endsWith(".md") ? readStoredText : undefined;
  const changed = await allowMissingFile(checkChange({ path: join(root.checkout, path), recorded: entry.stat, written: entry.written,
    reference: await readReference(root.checkout), format: root.context.format }, reader));
  if (changed === null || changed.status === "absent") return { mark: missingMark() };
  if (changed.stat.size === 0n) {
    // An editor that just emptied the file may still be saving. A settled empty text file can match its store bytes.
    const mark = emptyMark(path, changed.stat.mtimeNs, outcome);
    if (mark !== null || changed.status === "changed") return { mark: mark ?? emptiedMark(path) };
  }
  return changed;
}

async function finishRelock(root: ProjectionRootState, index: ProjectionIndex, path: string, entry: RecordEntry,
  checkedSize: bigint): Promise<ProjectionIndex> {
  const current = await allowMissingFile(lstat(join(root.checkout, path), { bigint: true }));
  if (!current?.isFile()) return retain(root, index, path, entry, missingMark(), false);
  if (current.size === 0n && checkedSize !== 0n) return retain(root, index, path, entry, emptiedMark(path));
  if ((current.mode & 0o222n) !== 0n) return retain(root, index, path, entry, pendingMark(), false);
  return closeOpening(root, index, path, entry);
}

async function closeOpening(root: ProjectionRootState, index: ProjectionIndex, path: string, entry: RecordEntry): Promise<ProjectionIndex> {
  const closed = { ...entry };
  delete closed.opened;
  const updated = await commitProjectionIndex({ location: root.location, checkout: root.checkout,
    index: withProjectionEntry(index, path, closed), checkpoint: root.context.checkpoint });
  projectionProcessState().relocked.push({ path,
    remedy: { text: `Run arc edit ${renderRemedyArgument(path)} from ${root.checkout} to keep editing.` } });
  return updated;
}

async function retain(root: ProjectionRootState, index: ProjectionIndex, path: string, entry: RecordEntry,
  mark: RefusedMark, writable = true): Promise<ProjectionIndex> {
  if (writable && !entry.protected) {
    await root.checkpoint?.();
    const stat = await allowMissingFile(lstat(join(root.checkout, path)));
    if (stat?.isFile()) mark = await changeOpeningMode(root, path, stat.mode | 0o200) ?? mark;
  }
  reportRetained(root, path, mark);
  return index;
}

/** Name a file the re-lock leaves opened, unless this command already reported a refusal at that path, which names it. */
function reportRetained(root: ProjectionRootState, path: string, mark: RefusedMark): void {
  const named = projectionProcessState().diagnostics.some(each => each.path === path && each.copy === null);
  if (!named) root.context.report?.({ path, copy: null, mark });
}

function missingMark(): RefusedMark {
  return { reason: "The opened file is absent or empty; its opening is retained.",
    remedy: { text: "Run arc sync in this checkout to restore the file, then retry arc save." } };
}
/** `arc sync` restores an absent file or emptied Markdown. Emptied text is an edit still to finish. */
function emptiedMark(path: string): RefusedMark { return path.endsWith(".md") ? missingMark() : pendingMark(); }
function pendingMark(): RefusedMark {
  return { reason: "The file remains opened because its latest edit or read-back has not settled.",
    remedy: { text: "Keep the file or its recorded aside copy, let saving finish, and retry arc save." } };
}

function awaitingInstallation(entry: RecordEntry, outcome: ProjectionFileWriteObservation | undefined): boolean {
  const landed = outcome?.result.answer === "taken-in";
  return entry.withheld || entry.refused !== null || entry.adoption !== undefined || entry.persisted?.recording === true
    || entry.unshown.length > 0 || landed && (entry.markers !== null || entry.notices.length > 0)
    || outcome === undefined && (entry.pending || entry.inProgress !== null);
}

/** An attempt with no edit has no new content to install and can still re-lock. */
function failedInstallation(outcome: ProjectionFileWriteObservation | undefined): boolean {
  if (outcome === undefined || outcome.result.answer === "no-edit") return false;
  return outcome.result.answer !== "taken-in" || outcome.installation !== "attempted";
}
function emptyMark(path: string, mtimeNs: bigint, outcome: ProjectionFileWriteObservation | undefined): RefusedMark | null {
  const answer = outcome?.result.answer;
  if (answer === "pending" || answer === "deferred" || wallClockNs() - mtimeNs < SETTLE_WINDOW_NS) return pendingMark();
  return path.endsWith(".md") ? missingMark() : null;
}

async function relockAdmission(root: ProjectionRootState, path: string, entry: RecordEntry,
  outcome: ProjectionFileWriteObservation | undefined): Promise<{ mode: number; size: bigint } | { mark: RefusedMark; writable?: boolean }> {
  if (outcome?.rebuilt) return { mark: pendingMark(), writable: false };
  // The checkout's link and ignore guards apply even when the file holds no edit. Edit rights are checked on submission.
  if (root.blockedByLink(path) !== null || !root.writable(path)) {
    return { mark: entry.refused ?? pendingMark(), writable: false };
  }
  await root.checkpoint?.();
  const stat = await allowMissingFile(lstat(join(root.checkout, path), { bigint: true }));
  if (stat === null) return { mark: missingMark() };
  if (!stat.isFile()) return { mark: pendingMark(), writable: false };
  const empty = stat.size === 0n ? emptyMark(path, stat.mtimeNs, outcome) : null;
  if (empty !== null) return { mark: empty };
  if (failedInstallation(outcome) || awaitingInstallation(entry, outcome)) return { mark: outcomeMark(entry, outcome) };
  return { mode: Number(stat.mode), size: stat.size };
}
function outcomeMark(entry: RecordEntry, outcome: ProjectionFileWriteObservation | undefined): RefusedMark {
  return outcome !== undefined && "mark" in outcome.result ? outcome.result.mark : entry.refused ?? pendingMark();
}

async function changeOpeningMode(root: ProjectionRootState, path: string, mode: number): Promise<RefusedMark | null> {
  try {
    await chmod(join(root.checkout, path), mode);
    return null;
  } catch (error) {
    if (fileIsMissing(error)) return missingMark();
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "EACCES" && code !== "EPERM" && code !== "EROFS") throw error;
    return { reason: `Cannot change permissions for ${path}: ${code}. The file remains opened.`,
      remedy: { text: "Repair the file's permissions, then retry arc save." } };
  }
}

async function allowMissingFile<T>(operation: Promise<T>): Promise<T | null> {
  try { return await operation; }
  catch (error) {
    if (fileIsMissing(error)) return null;
    throw error;
  }
}

function fileIsMissing(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code;
  return code === "ENOENT" || code === "ENOTDIR";
}
