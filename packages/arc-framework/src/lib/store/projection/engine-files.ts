/** Send the command's edited files, keeping ignored roots untouched while recording their landings. */
import { readUnchangedProjectionFile } from "./unchanged-file.js";
import { withProjectionEntry } from "./index-memory.js";
import { loadProjectionGroups } from "./index-memory.js";
import { join } from "node:path";
import type { FileStat, ProjectionIndex, RecordEntry, RefusedMark } from "./index-schema.js";
import type { ProjectionRootState } from "./process-state.js";
import { projectionProcessState } from "./process-state.js";
import { checkChange, readReference, type ChangeVerdict } from "./change-detection.js";
import { commitProjectionIndex } from "./index-file.js";
import { sendWriteBack } from "./write-back.js";
import { writeBackFile } from "./read-back.js";
import { unshownConflicts } from "./held-conflicts.js";
import type { TakeInRequest, TakeInResult } from "./take-in-port.js";
import { refuseProjectionEdit } from "./rights-binding.js";
import { adoptProjectionFile } from "./adoption.js";
import { resumeAdoptionReadBack } from "./adoption-read-back.js";
import { releaseAbsentWithheldPaths } from "./withheld.js";
import type { ProjectionResolution } from "./save-resolution.js";

/** Preserve a file's actual send/read-back outcome independently of pending flags carried through a successful swap. */
export interface ProjectionFileWriteObservation {
  readonly path: string;
  readonly result: TakeInResult;
  readonly installation: "attempted" | "not-authorized";
}

/** Check walked files, using short-lived start observations only until any recovery mutates files or publishes. */
export async function writeBackProjectionFiles(root: ProjectionRootState, initial: ProjectionIndex, files: readonly string[],
  observed?: ReadonlyMap<string, FileStat | null>, onFile?: (observation: ProjectionFileWriteObservation) => void): Promise<ProjectionIndex> {
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
  for (const path of paths.filter(path => root.blockedByLink(path) === null)) {
    const checked = await checkFileAtPath(root, index, path, reference, observations?.get(path));
    index = checked.index;
    if (checked.reobserve) observations = undefined;
    if (checked.edited) { root.unsent.add(path); pending.push(path); }
  }
  for (const path of pending) {
    const entry = index.entries[path];
    if (entry?.kind !== "record") continue;
    const request: TakeInRequest = { ...pendingFileRequest(root, path, entry),
      ...(selected !== path || target?.accepted ? {} : { resolution: target?.target?.resolution }) };
    const sent = await sendFile(root, index, request);
    index = sent.index;
    onFile?.({ path, result: sent.result, installation: sent.installation });
  }
  return index;
}

function adoptionRetries(root: ProjectionRootState, index: ProjectionIndex): string[] {
  loadProjectionGroups(index, root.context.verb === "save" ? "all" : "walked");
  return Object.keys(index.entries).filter(path => {
    const entry = index.entries[path];
    const selected = root.context.verb === "save" || !path.startsWith(".arc/completed/");
    return entry?.kind === "record" && entry.adoption?.kind === "read-back"
      || selected && (entry?.kind === "ownerless" || entry?.kind === "record" && entry.adoption !== undefined);
  });
}

function resolutionAliasRefusal(checkout: string, path: string): RefusedMark | null {
  const intent = checkoutResolution(checkout);
  return intent?.accepted || !intent?.target?.aliases?.includes(path) ? null : intent.refusal;
}

function pendingFileRequest(root: ProjectionRootState, path: string, entry: RecordEntry): TakeInRequest {
  const adopting = entry.adoption?.kind === "write-back";
  return { checkout: root.checkout, path, copy: null, entry: adopting ? { ...entry, pending: false } : entry,
    base: path.endsWith(".md") ? { kind: "stamp", stamp: null } : { kind: "blob", blob: entry.base.blob },
    ...(adopting ? { adopting: true as const, observedEdit: true } : {}) };
}

async function checkFileAtPath(root: ProjectionRootState, index: ProjectionIndex, path: string, reference: bigint | null,
  observed?: FileStat | null): Promise<{ index: ProjectionIndex; edited: boolean; reobserve?: boolean }> {
  const entry = index.entries[path];
  if (entry?.kind !== "record") {
    const adopted = await adoptProjectionFile(root, index, path), bound = adopted.entries[path];
    return { index: adopted, edited: bound?.kind === "record" && bound.adoption?.kind === "write-back", reobserve: true };
  }
  const aliasRefusal = resolutionAliasRefusal(root.checkout, path);
  if (aliasRefusal !== null) {
    await root.checkpoint?.();
    const changed = await checkChange({ path: join(root.checkout, path), recorded: entry.stat,
      written: entry.written, reference, format: root.context.format, observed });
    root.unsent.add(path);
    root.context.report?.({ path, copy: null, mark: aliasRefusal });
    return { index: await commitProjectionIndex({ location: root.location, checkout: root.checkout,
      index: withEntry(index, path, { ...entry, changed: entry.changed || changed.status === "changed",
        pending: true, refused: aliasRefusal }), checkpoint: root.context.checkpoint }), edited: false, reobserve: true };
  }
  if (entry.adoption?.kind === "read-back") return { index: await resumeAdoptionReadBack(root, index, path, entry), edited: false, reobserve: true };
  if (entry.adoption?.kind === "write-back") return { index, edited: true };
  if (entry.withheld) {
    root.unsent.add(path);
    report(path, "withheld", "Copy out anything wanted and delete the withheld file before retrying.");
    return { index, edited: false };
  }
  await root.checkpoint?.();
  const changed = await checkChange({ path: join(root.checkout, path), recorded: entry.stat,
    written: entry.written, reference, format: root.context.format, observed });
  if (changed.status === "absent") return { index, edited: false };
  const intent = checkoutResolution(root.checkout);
  const resolving = intent?.target?.path === path && !intent.accepted && intent.refusal === null;
  if (changed.status !== "changed" && !resolving && entry.persisted?.recording !== true) {
    root.unsent.delete(path);
    // A pending refresh is not an authored edit. Standing ambiguity tokens keep their separate resolution authority.
    return { index: recordCleanFile(index, path, entry, changed), edited: false };
  }
  if (!resolving && changed.status === "changed"
    && await readUnchangedProjectionFile(root.context, pendingFileRequest(root, path, entry)) !== null) {
    root.unsent.delete(path);
    return { index, edited: false };
  }
  return { index: changed.status === "changed" ? withEntry(index, path, { ...entry, changed: true }) : index, edited: true };
}

function recordCleanFile(index: ProjectionIndex, path: string, entry: RecordEntry,
  changed: Exclude<ChangeVerdict, { status: "absent" }>): ProjectionIndex {
  const refused = entry.refused?.reason === "bases-disagree" ? entry.refused : null;
  if (changed.status === "clean" && entry.refused === refused) return index;
  return withEntry(index, path, { ...entry, stat: changed.stat, refused });
}

async function sendFile(root: ProjectionRootState, index: ProjectionIndex, request: TakeInRequest): Promise<{
  index: ProjectionIndex; result: TakeInResult; installation: ProjectionFileWriteObservation["installation"];
}> {
  const { path, entry } = request;
  const denied = await root.rights?.(request);
  if (denied !== undefined && denied !== null) {
    root.unsent.add(path);
    root.context.report?.({ path, copy: request.copy, mark: denied });
    const result = refuseProjectionEdit(entry, denied);
    return { result, installation: "not-authorized", index: await commitProjectionIndex({ location: root.location, checkout: root.checkout,
      index: withEntry(index, path, result.entry), checkpoint: root.context.checkpoint }) };
  }
  let updated: ProjectionIndex;
  let result: TakeInResult;
  const writable = root.writable(path);
  if (writable) {
    const written = await writeBackFile(root.context, index, request);
    result = written.result;
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
  return { result, installation: writable ? "attempted" : "not-authorized",
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
function report(path: string, reason: string, remedy: string): void {
  projectionProcessState().diagnostics.push({ path, copy: null, mark: { reason, remedy: { text: remedy } } });
}
