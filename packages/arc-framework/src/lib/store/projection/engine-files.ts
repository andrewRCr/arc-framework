/** Send the command's edited files, keeping ignored roots untouched while recording their landings. */
import { withProjectionEntry } from "./index-memory.js";
import { loadProjectionGroups } from "./index-memory.js";
import { join } from "node:path";
import type { ProjectionIndex, RecordEntry, RefusedMark } from "./index-schema.js";
import type { ProjectionRootState } from "./process-state.js";
import { projectionProcessState } from "./process-state.js";
import { checkChange, readReference } from "./change-detection.js";
import { commitProjectionIndex } from "./index-file.js";
import { sendWriteBack } from "./write-back.js";
import { writeBackFile } from "./read-back.js";
import { unshownConflicts } from "./held-conflicts.js";
import type { TakeInRequest, TakeInResult } from "./take-in-port.js";
import { refuseProjectionEdit } from "./rights-binding.js";
import { adoptProjectionFile } from "./adoption.js";
import { resumeAdoptionReadBack } from "./adoption-read-back.js";

/** Check indexed files found by the walk, always re-reading stats after the sweep's possible moves. */
export async function writeBackProjectionFiles(root: ProjectionRootState, initial: ProjectionIndex, files: readonly string[]): Promise<ProjectionIndex> {
  let index = initial;
  const reference = await readReference(root.checkout);
  const pending: string[] = [];
  const target = projectionProcessState().resolution;
  const selected = target?.refusal === null ? target.target?.path : undefined;
  const walked = [...new Set([...files, ...adoptionRetries(root, initial)])].sort();
  const paths = selected === undefined || target?.accepted ? walked : [...new Set([...walked, selected])].sort();
  for (const path of paths.filter(path => root.blockedByLink(path) === null)) {
    const checked = await checkFileAtPath(root, index, path, reference);
    index = checked.index;
    if (checked.edited) { root.unsent.add(path); pending.push(path); }
  }
  for (const path of pending) {
    const entry = index.entries[path];
    if (entry?.kind !== "record") continue;
    const request: TakeInRequest = { ...pendingFileRequest(root, path, entry),
      ...(selected !== path || target?.accepted ? {} : { resolution: target?.target?.resolution }) };
    index = await sendFile(root, index, request);
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

function resolutionAliasRefusal(path: string): RefusedMark | null {
  const intent = projectionProcessState().resolution;
  return intent?.accepted || !intent?.target?.aliases?.includes(path) ? null : intent.refusal;
}

function pendingFileRequest(root: ProjectionRootState, path: string, entry: RecordEntry): TakeInRequest {
  const adopting = entry.adoption?.kind === "write-back";
  return { checkout: root.checkout, path, copy: null, entry: adopting ? { ...entry, pending: false } : entry,
    base: path.endsWith(".md") ? { kind: "stamp", stamp: null } : { kind: "blob", blob: entry.base.blob },
    ...(adopting ? { adopting: true as const, observedEdit: true } : {}) };
}

async function checkFileAtPath(root: ProjectionRootState, index: ProjectionIndex, path: string, reference: bigint | null): Promise<{ index: ProjectionIndex; edited: boolean }> {
  const entry = index.entries[path];
  if (entry?.kind !== "record") {
    const adopted = await adoptProjectionFile(root, index, path), bound = adopted.entries[path];
    return { index: adopted, edited: bound?.kind === "record" && bound.adoption?.kind === "write-back" };
  }
  const aliasRefusal = resolutionAliasRefusal(path);
  if (aliasRefusal !== null) {
    await root.checkpoint?.();
    const changed = await checkChange({ path: join(root.checkout, path), recorded: entry.stat,
      written: entry.written, reference, format: root.context.format });
    root.unsent.add(path);
    root.context.report?.({ path, copy: null, mark: aliasRefusal });
    return { index: await commitProjectionIndex({ location: root.location, checkout: root.checkout,
      index: withEntry(index, path, { ...entry, changed: entry.changed || changed.status === "changed",
        pending: true, refused: aliasRefusal }), checkpoint: root.context.checkpoint }), edited: false };
  }
  if (entry.adoption?.kind === "read-back") return { index: await resumeAdoptionReadBack(root, index, path, entry), edited: false };
  if (entry.adoption?.kind === "write-back") return { index, edited: true };
  if (entry.withheld) {
    report(path, "withheld", "Copy out anything wanted and delete the withheld file before retrying.");
    return { index, edited: false };
  }
  await root.checkpoint?.();
  const changed = await checkChange({ path: join(root.checkout, path), recorded: entry.stat,
    written: entry.written, reference, format: root.context.format });
  if (changed.status === "absent") return { index, edited: false };
  const intent = projectionProcessState().resolution;
  const resolving = intent?.target?.path === path && !intent.accepted && intent.refusal === null;
  if (changed.status !== "changed" && !entry.pending && !resolving) return { index: withEntry(index, path, { ...entry, stat: changed.stat }), edited: false };
  return { index: changed.status === "changed" ? withEntry(index, path, { ...entry, changed: true }) : index, edited: true };
}

async function sendFile(root: ProjectionRootState, index: ProjectionIndex, request: TakeInRequest): Promise<ProjectionIndex> {
  const { path, entry } = request;
  const denied = await root.rights?.(request);
  if (denied !== undefined && denied !== null) {
    root.unsent.add(path);
    root.context.report?.({ path, copy: request.copy, mark: denied });
    return commitProjectionIndex({ location: root.location, checkout: root.checkout,
      index: withEntry(index, path, refuseProjectionEdit(entry, denied).entry), checkpoint: root.context.checkpoint });
  }
  let updated: ProjectionIndex;
  if (root.writable(path)) {
    const written = await writeBackFile(root.context, index, request);
    updated = written.index;
    recordResolutionRefusal(request, written.result);
    if (written.result.answer === "taken-in") {
      root.unsent.delete(path);
      const landed = updated.entries[path];
      if (landed?.kind === "record" && landed.adoption !== undefined && !landed.pending) {
        updated = withEntry(updated, path, { ...landed, adoption: undefined });
      }
    }
  } else {
    const sent = await sendWriteBack(root.context, request);
    const held = sent.kind === "landed" ? { ...sent.result.entry,
      unshown: unshownConflicts(sent.result.entry, sent.record.conflicts) } : sent.result.entry;
    updated = withEntry(index, path, { ...held, pending: true });
    if (sent.kind === "landed") root.unsent.delete(path);
  }
  return commitProjectionIndex({ location: root.location, checkout: root.checkout, index: updated,
    checkpoint: root.context.checkpoint });
}

function recordResolutionRefusal(request: TakeInRequest, result: TakeInResult): void {
  if (request.resolution === undefined || !("mark" in result)) return;
  const intent = projectionProcessState().resolution;
  if (intent !== null && !intent.accepted && intent.refusal === null) intent.refusal = result.mark;
}

function withEntry(index: ProjectionIndex, path: string, entry: RecordEntry): ProjectionIndex {
  return withProjectionEntry(index, path, entry);
}
function report(path: string, reason: string, remedy: string): void {
  projectionProcessState().diagnostics.push({ path, copy: null, mark: { reason, remedy: { text: remedy } } });
}
