/** Close archive openings only after a read-only file's final check proves its bytes are stored. */
import { chmod, lstat } from "node:fs/promises";
import { join } from "node:path";
import { renderRemedyArgument } from "../../../scripts/integration/spine-refusal.js";
import { checkChange, readReference } from "./change-detection.js";
import { commitProjectionIndex } from "./index-file.js";
import { withProjectionEntry } from "./index-memory.js";
import type { ProjectionIndex, RecordEntry, RefusedMark } from "./index-schema.js";
import { isOwnSaveLanding } from "./lay-mode.js";
import { pendingFileRequest } from "./pending-request.js";
import { projectionProcessState, type ProjectionRootState } from "./process-state.js";
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
      root.context.report?.({ path, copy: null, mark: original.refused ?? pendingMark() });
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
  const absolute = join(root.checkout, path);
  await root.checkpoint?.();
  if (await allowMissingFile(chmod(absolute, admission.mode & ~0o222)) === null) {
    return retain(root, index, path, entry, missingMark(), false);
  }
  if (outcome === undefined) await root.ports.hooks?.afterSaveReadOnly?.(path);
  await root.ports.hooks?.beforeSaveMarkClear?.(path);
  const changed = await readRelockedChange(root, path, entry);
  if (changed === null) return retain(root, index, path, entry, missingMark());
  if (changed.status !== "changed") return closeOpening(root, index, path, entry);
  if (outcome !== undefined) return retain(root, index, path, entry, pendingMark());
  const sent = await send(index, path, entry), current = sent.index.entries[path];
  if (current?.kind !== "record") return sent.index;
  return finishLateEdit(root, sent.index, path, current, sent.observation);
}

async function finishLateEdit(root: ProjectionRootState, index: ProjectionIndex, path: string, entry: RecordEntry,
  outcome: ProjectionFileWriteObservation): Promise<ProjectionIndex> {
  if (outcome.rebuilt) return retain(root, index, path, entry, pendingMark(), false);
  if (outcome.result.answer !== "taken-in" || outcome.installation !== "attempted") {
    return retain(root, index, path, entry, "mark" in outcome.result ? outcome.result.mark : entry.refused ?? pendingMark());
  }
  await root.ports.hooks?.beforeSaveMarkClear?.(path);
  const changed = await readRelockedChange(root, path, entry);
  if (changed === null) return retain(root, index, path, entry, missingMark());
  return changed.status === "changed" ? retain(root, index, path, entry, pendingMark()) : closeOpening(root, index, path, entry);
}

async function readRelockedChange(root: ProjectionRootState, path: string, entry: RecordEntry) {
  const changed = await allowMissingFile(checkChange({ path: join(root.checkout, path), recorded: entry.stat, written: entry.written,
    reference: await readReference(root.checkout), format: root.context.format }));
  if (changed === null || changed.status === "absent") return null;
  return changed.stat.size === 0n && path.endsWith(".md") ? null : changed;
}

async function closeOpening(root: ProjectionRootState, index: ProjectionIndex, path: string, entry: RecordEntry): Promise<ProjectionIndex> {
  const closed = { ...entry };
  delete closed.opened;
  const updated = await commitProjectionIndex({ location: root.location, checkout: root.checkout,
    index: withProjectionEntry(index, path, closed), checkpoint: root.context.checkpoint });
  projectionProcessState().relocked.push({ path, remedy: { text: `Run arc edit ${renderRemedyArgument(path)} to keep editing.` } });
  return updated;
}

async function retain(root: ProjectionRootState, index: ProjectionIndex, path: string, entry: RecordEntry,
  mark: RefusedMark, writable = true): Promise<ProjectionIndex> {
  if (writable && !entry.protected) {
    await root.checkpoint?.();
    const absolute = join(root.checkout, path);
    const stat = await allowMissingFile(lstat(absolute));
    if (stat?.isFile()) await allowMissingFile(chmod(absolute, stat.mode | 0o200));
  }
  root.context.report?.({ path, copy: null, mark });
  return index;
}

function missingMark(): RefusedMark {
  return { reason: "The opened file is absent or empty; its opening is retained.",
    remedy: { text: "Run arc sync in this checkout to restore the file, then retry arc save." } };
}
function pendingMark(): RefusedMark {
  return { reason: "The file remains opened because its latest edit or read-back has not settled.",
    remedy: { text: "Keep the file or its recorded aside copy, let saving finish, and retry arc save." } };
}

function awaitingInstallation(entry: RecordEntry, outcome: ProjectionFileWriteObservation | undefined): boolean {
  return entry.withheld || entry.refused !== null || entry.adoption !== undefined || entry.persisted?.recording === true
    || entry.markers !== null || entry.notices.length > 0 || entry.unshown.length > 0
    || outcome === undefined && (entry.pending || entry.inProgress !== null);
}

function failedInstallation(outcome: ProjectionFileWriteObservation | undefined): boolean {
  return outcome !== undefined && (outcome.result.answer !== "taken-in" || outcome.installation !== "attempted");
}
function emptyMark(outcome: ProjectionFileWriteObservation | undefined): RefusedMark {
  const answer = outcome?.result.answer;
  return answer === "pending" || answer === "deferred" ? pendingMark() : missingMark();
}

async function relockAdmission(root: ProjectionRootState, path: string, entry: RecordEntry,
  outcome: ProjectionFileWriteObservation | undefined): Promise<{ mode: number } | { mark: RefusedMark; writable?: boolean }> {
  if (outcome?.rebuilt) return { mark: pendingMark(), writable: false };
  const denied = await root.rights?.(pendingFileRequest(root.checkout, path, entry));
  if (denied != null || root.blockedByLink(path) !== null || !root.writable(path)) {
    return { mark: denied ?? entry.refused ?? pendingMark(), writable: false };
  }
  await root.checkpoint?.();
  const stat = await allowMissingFile(lstat(join(root.checkout, path)));
  if (stat === null) return { mark: missingMark() };
  if (!stat.isFile()) return { mark: pendingMark(), writable: false };
  if (stat.size === 0 && path.endsWith(".md")) return { mark: emptyMark(outcome) };
  if (failedInstallation(outcome) || awaitingInstallation(entry, outcome)) return { mark: outcomeMark(entry, outcome) };
  return { mode: stat.mode };
}
function outcomeMark(entry: RecordEntry, outcome: ProjectionFileWriteObservation | undefined): RefusedMark {
  return outcome !== undefined && "mark" in outcome.result ? outcome.result.mark : entry.refused ?? pendingMark();
}

async function allowMissingFile<T>(operation: Promise<T>): Promise<T | null> {
  try { return await operation; }
  catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return null;
    throw error;
  }
}
