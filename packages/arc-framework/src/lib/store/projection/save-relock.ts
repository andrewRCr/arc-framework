/** Close archive openings only after a read-only file's final check proves its bytes are stored. */
import { join } from "node:path";
import { renderRemedyArgument } from "../../../scripts/integration/spine-refusal.js";
import { formatConflictToken } from "../../status/conflict-token.js";
import { checkChange, projectionFileReader, readReference } from "./change-detection.js";
import { ArchiveDestinationBlocked, archivePermissionMark, changeArchiveFileMode, readArchiveFile } from "./archive-file.js";
import { selectArchivePath } from "./archive-selection.js";
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
  if (admission?.selected === true) {
    // A path the command's selection refused keeps its opening, reported once for the command.
    selectArchivePath(root, path);
    return index;
  }
  if (admission !== null) return retain(root, index, path, entry, admission.mark, admission.writable);
  await root.checkpoint?.();
  const laid = await changeArchiveFileMode(root, path, false);
  if (laid.kind !== "file") return retain(root, index, path, entry, laid.kind === "missing" ? missingMark() : laid.mark, false);
  if (outcome === undefined) await root.ports.hooks?.afterSaveReadOnly?.(path);
  await root.ports.hooks?.beforeSaveMarkClear?.(path);
  const changed = await readRelockedChange(root, path, entry);
  if ("mark" in changed) return retain(root, index, path, entry, changed.mark, changed.restoreWritable);
  if (!changed.edited) return finishRelock(root, index, path, entry, changed.writable);
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
  if ("mark" in changed) return retain(root, index, path, entry, changed.mark, changed.restoreWritable);
  return changed.edited ? retain(root, index, path, entry, pendingMark()) : finishRelock(root, index, path, entry, changed.writable);
}

async function readRelockedChange(root: ProjectionRootState, path: string, entry: RecordEntry): Promise<
  { edited: boolean; writable: boolean } | { mark: RefusedMark; restoreWritable: boolean }> {
  const observed = await readArchiveFile(root, path);
  if (observed.kind !== "file") return { mark: observed.kind === "missing" ? missingMark() : observed.mark, restoreWritable: false };
  const reference = await readReference(root.checkout);
  const reader = projectionFileReader(root.checkout, path);
  let changed: Awaited<ReturnType<typeof checkChange>> | null;
  try {
    changed = await allowMissingFile(checkChange({ path: join(root.checkout, path), recorded: entry.stat, written: entry.written,
      reference, format: root.context.format }, reader.read, reader.stat));
  } catch (error) {
    return { mark: error instanceof ArchiveDestinationBlocked ? error.mark : archivePermissionMark(path, error), restoreWritable: false };
  }
  if (changed === null || changed.status === "absent") return { mark: missingMark(), restoreWritable: false };
  if (changed.stat.size === 0n && path.endsWith(".md")) return { mark: missingMark(), restoreWritable: true };
  const current = await readArchiveFile(root, path);
  if (current.kind !== "file") return { mark: current.kind === "missing" ? missingMark() : current.mark, restoreWritable: false };
  const { stat } = current;
  if (stat.dev !== observed.stat.dev || stat.ino !== changed.stat.ino || stat.mtimeNs !== changed.stat.mtimeNs
    || stat.size !== changed.stat.size) return { mark: pendingMark(), restoreWritable: true };
  return { edited: changed.status === "changed", writable: (stat.mode & 0o222n) !== 0n };
}

async function finishRelock(root: ProjectionRootState, index: ProjectionIndex, path: string, entry: RecordEntry,
  writable: boolean): Promise<ProjectionIndex> {
  return writable ? retain(root, index, path, entry, pendingMark(), false) : closeOpening(root, index, path, entry);
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
    const changed = await changeArchiveFileMode(root, path, true);
    if (changed.kind === "blocked" || changed.kind === "mode-refused") mark = changed.mark;
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
  return entry.withheld || entry.refused !== null || entry.adoption !== undefined || entry.archiveSubmission !== undefined || entry.persisted?.recording === true
    || entry.unshown.length > 0 || outcome !== undefined && (entry.markers !== null || entry.notices.length > 0)
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
  outcome: ProjectionFileWriteObservation | undefined): Promise<{ mark: RefusedMark; writable?: boolean; selected?: true } | null> {
  if (outcome?.rebuilt) return { mark: pendingMark(), writable: false };
  const held = selectArchivePath(root, path, { report: false });
  if (held !== null) return { mark: held, writable: false, selected: true };
  const denied = await root.rights?.(pendingFileRequest(root.checkout, path, entry));
  if (denied != null || !root.writable(path)) {
    return { mark: denied ?? entry.refused ?? pendingMark(), writable: false };
  }
  await root.checkpoint?.();
  const file = await readArchiveFile(root, path);
  if (file.kind === "blocked") return { mark: file.mark, writable: false };
  if (file.kind === "missing") return { mark: missingMark(), writable: false };
  if (file.stat.size === 0n && path.endsWith(".md")) return { mark: emptyMark(outcome) };
  if (failedInstallation(outcome) || awaitingInstallation(entry, outcome)) return { mark: outcomeMark(path, entry, outcome) };
  return null;
}
function outcomeMark(path: string, entry: RecordEntry, outcome: ProjectionFileWriteObservation | undefined): RefusedMark {
  if (outcome !== undefined && "mark" in outcome.result) return outcome.result.mark;
  if (entry.refused !== null) return entry.refused;
  if (entry.markers !== null) return { reason: "The opened file still has conflict markers.",
    remedy: { text: `Resolve the conflict markers in ${renderRemedyArgument(path)}, then retry arc save.` } };
  const conflict = entry.notices[0] ?? entry.unshown[0];
  if (conflict !== undefined) {
    const token = formatConflictToken(conflict);
    return { reason: "The opened file still has a whole-record conflict.",
      remedy: { text: `Run arc save --resolve ${renderRemedyArgument(token)} to settle the conflict.`,
        argv: ["arc", "save", "--resolve", token] } };
  }
  return pendingMark();
}

async function allowMissingFile<T>(operation: Promise<T>): Promise<T | null> {
  try { return await operation; }
  catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return null;
    throw error;
  }
}
