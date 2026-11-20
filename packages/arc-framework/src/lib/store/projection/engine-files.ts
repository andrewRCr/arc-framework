/** Send the command's edited files, keeping ignored roots untouched while recording their landings. */
import { checkUnchangedProjectionEdit, recoverSubmittedArchiveEdit } from "./read-back-recovery.js";
import { withProjectionEntry } from "./index-memory.js";
import { loadProjectionGroups } from "./index-memory.js";
import { join } from "node:path";
import type { FileStat, ProjectionIndex, RecordEntry, RefusedMark } from "./index-schema.js";
import type { ProjectionRootState } from "./process-state.js";
import { projectionProcessState } from "./process-state.js";
import { checkChange, projectionFileReader, readReference, type ChangeVerdict } from "./change-detection.js";
import { commitProjectionIndex, isProjectionEntryUnsettled } from "./index-file.js";
import { sendWriteBack } from "./write-back.js";
import { writeBackFile } from "./read-back.js";
import { unshownConflicts } from "./held-conflicts.js";
import type { TakeInRequest, TakeInResult } from "./take-in-port.js";
import { refuseProjectionEdit } from "./rights-binding.js";
import { adoptProjectionFile, recoverSubmittedArchiveAdoption } from "./adoption.js";
import { resumeAdoptionReadBack } from "./adoption-read-back.js";
import { withheldProjectionMark } from "./materialization-file.js";
import { releaseAbsentWithheldPaths } from "./withheld.js";
import { pendingFileRequest } from "./pending-request.js";
import type { ProjectionResolution } from "./save-resolution.js";

import { relockOpenedProjectionFiles } from "./save-relock.js";
import { ArchiveDestinationBlocked } from "./archive-file.js";
import { selectArchivePath } from "./archive-selection.js";
import { holdWaitingArchiveEdit } from "./archive-waiting.js";
import type { ProjectionFileWriteObservation } from "./file-write-observation.js";
import { hasArchiveRecording } from "./recording-state.js";

/** Check walked files, using short-lived start observations only until any recovery mutates files or publishes. */
export async function writeBackProjectionFiles(root: ProjectionRootState, initial: ProjectionIndex, files: readonly string[],
  observed?: ReadonlyMap<string, FileStat | null>, onFile?: (observation: ProjectionFileWriteObservation) => void): Promise<ProjectionIndex> {
  const outcomes = new Map<string, ProjectionFileWriteObservation>();
  const observe = (outcome: ProjectionFileWriteObservation): void => { outcomes.set(outcome.path, outcome); onFile?.(outcome); };
  let index = await releaseAbsentWithheldPaths(root, initial);
  let observations = index === initial ? observed : undefined;
  if (index !== initial) index = await commitProjectionIndex({ location: root.location, checkout: root.checkout,
    index, checkpoint: root.context.checkpoint });
  const reference = await readReference(root.checkout);
  const pending: string[] = [];
  const target = checkoutResolution(root.checkout);
  const selected = target?.refusal === null ? target.target?.path : undefined;
  const walked = [...new Set([...files, ...adoptionRetries(root, initial)])].sort();
  const paths = selected === undefined || target?.accepted ? walked : [...new Set([...walked, selected])].sort();
  for (const path of paths.filter(path => root.blockedByLink(path) === null || hasArchiveRecording(index.entries[path]))) {
    const checked = await checkFileAtPath(root, index, path, reference, observations?.get(path), observe);
    index = checked.index;
    if (checked.reobserve) observations = undefined;
    if (checked.edited) { root.unsent.add(path); pending.push(path); }
  }
  for (const path of pending) {
    const entry = index.entries[path];
    if (entry?.kind !== "record") continue;
    const request: TakeInRequest = { ...pendingFileRequest(root.checkout, path, entry),
      ...(selected !== path || target?.accepted ? {} : { resolution: target?.target?.resolution }) };
    const sent = await sendFile(root, index, request);
    index = sent.index;
    observe({ path, result: sent.result, installation: sent.installation, rebuilt: sent.rebuilt });
  }
  return relockOpenedProjectionFiles(root, index, outcomes, async (current, path, entry) => {
    const sent = await sendFile(root, current, pendingFileRequest(root.checkout, path, entry));
    const observation = { path, result: sent.result, installation: sent.installation, rebuilt: sent.rebuilt };
    observe(observation);
    return { index: sent.index, observation };
  });
}

function adoptionRetries(root: ProjectionRootState, index: ProjectionIndex): string[] {
  loadProjectionGroups(index, "walked");
  return Object.keys(index.entries).filter(path => {
    const entry = index.entries[path];
    return entry !== undefined && retriesIndexedEntry(root.context.verb, path, entry);
  });
}

/** Retry opened files and unfinished adoptions beyond the walked roots, retaining save's archive recovery. */
export function retriesIndexedEntry(verb: string | undefined, path: string, entry: ProjectionIndex["entries"][string]): boolean {
  const selected = verb === "save" || !path.startsWith(".arc/completed/");
  return verb === "save" && isProjectionEntryUnsettled(entry) || entry.opened === true || entry.kind === "record" && entry.adoption?.kind === "read-back"
    || selected && (entry.kind === "ownerless" || entry.adoption !== undefined);
}

function resolutionAliasRefusal(checkout: string, path: string): RefusedMark | null {
  const intent = checkoutResolution(checkout);
  return intent?.accepted || !intent?.target?.aliases?.includes(path) ? null : intent.refusal;
}

async function checkFileAtPath(root: ProjectionRootState, index: ProjectionIndex, path: string, reference: bigint | null,
  observed?: FileStat | null, onFile?: (observation: ProjectionFileWriteObservation) => void): Promise<{ index: ProjectionIndex; edited: boolean; reobserve?: boolean }> {
  let entry = index.entries[path];
  // The command's one selection-time check of an archive path; a refused path keeps its entry and any accepted work.
  const blocked = selectArchivePath(root, path, { report: false });
  if (blocked !== null) return checkBlockedArchivePath(root, index, path, entry);
  if (entry?.kind === "record" && entry.archiveSubmission !== undefined) {
    const recovered = await recoverSubmittedArchiveEdit(root, index, path, entry);
    if (recovered.held) return { index, edited: false };
    ({ index, entry } = recovered);
  }
  if (entry?.kind !== "record") {
    const adopted = await adoptProjectionFile(root, index, path, onFile), bound = adopted.entries[path];
    return { index: adopted, edited: bound?.kind === "record" && bound.adoption?.kind === "write-back", reobserve: true };
  }
  return checkIndexedFile(root, index, path, entry, reference, observed, onFile);
}

/** Recover store-only acceptance while a path cannot be inspected or installed: refused at selection, or unreadable. */
async function checkBlockedArchivePath(root: ProjectionRootState, index: ProjectionIndex, path: string,
  entry: ProjectionIndex["entries"][string] | undefined, read?: RefusedMark): Promise<{ index: ProjectionIndex; edited: false; reobserve?: true }> {
  const recording = hasArchiveRecording(entry);
  if (entry?.archiveSubmission !== undefined) {
    await root.checkpoint?.();
    const recovered = entry.kind === "record"
      ? await recoverSubmittedArchiveEdit(root, index, path, entry, true)
      : await recoverSubmittedArchiveAdoption(root, index, path, entry, true);
    index = recovered.index;
  }
  if (recording || entry?.opened === true) root.unsent.add(path);
  // Save reports other held stored openings at re-lock, which observes the same path again.
  // A file no entry names under a folder another checkout holds is that checkout's, and is not reported here.
  if (entry !== undefined && (recording || !(root.context.verb === "save" && entry.kind === "record" && entry.opened === true))) {
    // A refused selection is reported once per command; a read the file's permissions refused is reported here.
    if (read === undefined) selectArchivePath(root, path);
    else root.context.report?.({ path, copy: null, mark: read });
  }
  return { index, edited: false, ...(recording ? { reobserve: true } : {}) };
}

async function checkIndexedFile(root: ProjectionRootState, index: ProjectionIndex, path: string, entry: RecordEntry,
  reference: bigint | null, observed?: FileStat | null, onFile?: (observation: ProjectionFileWriteObservation) => void): Promise<{
    index: ProjectionIndex; edited: boolean; reobserve?: boolean;
  }> {
  const aliasRefusal = resolutionAliasRefusal(root.checkout, path);
  if (aliasRefusal !== null) {
    return checkRefusedAlias(root, index, path, entry, reference, observed, aliasRefusal);
  }
  if (entry.adoption?.kind === "read-back") return { index: await resumeAdoptionReadBack(root, index, path, entry, onFile), edited: false, reobserve: true };
  if (entry.adoption?.kind === "write-back") return { index, edited: true };
  if (entry.withheld) {
    root.unsent.add(path);
    root.context.report?.({ path, copy: null, mark: entry.refused ?? withheldProjectionMark(path) });
    return { index, edited: false };
  }
  const changed = await checkIndexedChange(root, path, entry, reference, observed);
  if (changed instanceof ArchiveDestinationBlocked) return checkBlockedArchivePath(root, index, path, entry, changed.mark);
  if (changed.status === "absent") return { index, edited: false };
  const intent = checkoutResolution(root.checkout);
  const resolving = intent?.target?.path === path && !intent.accepted && intent.refusal === null;
  if (changed.status !== "changed" && !resolving && entry.persisted?.recording !== true) {
    root.unsent.delete(path);
    // A pending refresh is not an authored edit. Standing ambiguity tokens keep their separate resolution authority.
    return { index: recordCleanFile(index, path, entry, changed), edited: false };
  }
  const unchanged = !resolving && changed.status === "changed"
    ? await checkUnchangedProjectionEdit(root, index, path, entry, onFile) : null;
  if (unchanged !== null) return unchanged;
  return { index: changed.status === "changed" ? withEntry(index, path, { ...entry, changed: true }) : index, edited: true };
}

async function checkRefusedAlias(root: ProjectionRootState, index: ProjectionIndex, path: string, entry: RecordEntry,
  reference: bigint | null, observed: FileStat | null | undefined, mark: RefusedMark): Promise<{ index: ProjectionIndex; edited: false; reobserve?: true }> {
  const changed = await checkIndexedChange(root, path, entry, reference, observed);
  if (changed instanceof ArchiveDestinationBlocked) return checkBlockedArchivePath(root, index, path, entry, changed.mark);
  root.unsent.add(path);
  root.context.report?.({ path, copy: null, mark });
  return { index: await commitProjectionIndex({ location: root.location, checkout: root.checkout,
    index: withEntry(index, path, { ...entry, changed: entry.changed || changed.status === "changed",
      pending: true, refused: mark }), checkpoint: root.context.checkpoint }), edited: false, reobserve: true };
}

async function checkIndexedChange(root: ProjectionRootState, path: string, entry: RecordEntry,
  reference: bigint | null, observed?: FileStat | null): Promise<ChangeVerdict | ArchiveDestinationBlocked> {
  await root.checkpoint?.();
  const reader = projectionFileReader(root.checkout, path);
  try {
    return await checkChange({ path: join(root.checkout, path), recorded: entry.stat, written: entry.written,
      reference, format: root.context.format, observed: path.startsWith(".arc/completed/") ? undefined : observed }, reader.read, reader.stat);
  } catch (error) {
    if (error instanceof ArchiveDestinationBlocked) return error;
    throw error;
  }
}


function recordCleanFile(index: ProjectionIndex, path: string, entry: RecordEntry,
  changed: Exclude<ChangeVerdict, { status: "absent" }>): ProjectionIndex {
  const refused = entry.refused?.reason === "bases-disagree" ? entry.refused : null;
  if (changed.status === "clean" && entry.refused === refused) return index;
  return withEntry(index, path, { ...entry, stat: changed.stat, refused });
}

async function sendFile(root: ProjectionRootState, index: ProjectionIndex, request: TakeInRequest): Promise<{
  index: ProjectionIndex; result: TakeInResult; installation: ProjectionFileWriteObservation["installation"]; rebuilt?: boolean;
}> {
  const { path, entry } = request;
  const waiting = await holdWaitingArchiveEdit(root, request);
  if (waiting !== null) return { result: waiting, installation: "not-authorized", index: await commitProjectionIndex({ location: root.location,
    checkout: root.checkout, index: withEntry(index, path, waiting.entry), checkpoint: root.context.checkpoint }) };
  const denied = await root.rights?.(request);
  if (denied !== undefined && denied !== null) {
    root.unsent.add(path);
    root.context.report?.({ path, copy: request.copy, mark: denied });
    const result = refuseProjectionEdit(entry, denied);
    return { result, installation: "not-authorized", index: await commitProjectionIndex({ location: root.location, checkout: root.checkout,
      index: withEntry(index, path, result.entry), checkpoint: root.context.checkpoint }) };
  }
  let rebuilt: boolean | undefined;
  let updated: ProjectionIndex;
  let result: TakeInResult;
  const writable = root.writable(path);
  if (writable) {
    const written = await writeBackFile(root.context, index, request);
    result = written.result;
    rebuilt = written.rebuilt;
    updated = written.index;
    recordResolutionRefusal(request, written.result);
    if (written.result.answer === "no-edit") root.unsent.delete(path);
    if (written.result.answer === "taken-in") {
      root.unsent.delete(path);
      updated = clearCompletedAdoption(updated, path);
    }
  } else {
    const sent = await sendWriteBack(root.context, request);
    result = sent.result;
    const held = sent.kind === "landed" ? { ...sent.result.entry,
      unshown: unshownConflicts(sent.result.entry, sent.record.conflicts) } : sent.result.entry;
    updated = withEntry(index, path, { ...held, pending: true });
    if (sent.kind === "landed" || sent.result.answer === "no-edit") root.unsent.delete(path);
  }
  return { result, rebuilt, installation: writable ? "attempted" : "not-authorized",
    index: await commitProjectionIndex({ location: root.location, checkout: root.checkout, index: updated,
      checkpoint: root.context.checkpoint }) };
}

function clearCompletedAdoption(index: ProjectionIndex, path: string): ProjectionIndex {
  const entry = index.entries[path];
  return entry?.kind === "record" && entry.adoption !== undefined && !entry.pending
    ? withEntry(index, path, { ...entry, adoption: undefined }) : index;
}

function recordResolutionRefusal(request: TakeInRequest, result: TakeInResult): void {
  if (request.resolution === undefined || !("mark" in result)) return;
  const intent = checkoutResolution(request.checkout);
  if (intent !== null && !intent.accepted && intent.refusal === null) intent.refusal = result.mark;
}

function withEntry(index: ProjectionIndex, path: string, entry: RecordEntry): ProjectionIndex {
  return withProjectionEntry(index, path, entry);
}
function checkoutResolution(checkout: string): ProjectionResolution | null {
  const state = projectionProcessState();
  return state.command?.checkout === checkout ? state.resolution : null;
}
