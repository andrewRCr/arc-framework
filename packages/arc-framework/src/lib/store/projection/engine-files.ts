/** Send the command's edited files, keeping ignored roots untouched while recording their landings. */
import { join } from "node:path";
import type { ProjectionIndex, RecordEntry } from "./index-schema.js";
import type { ProjectionRootState } from "./process-state.js";
import { projectionProcessState } from "./process-state.js";
import { checkChange, readReference } from "./change-detection.js";
import { commitProjectionIndex } from "./index-file.js";
import { sendWriteBack } from "./write-back.js";
import { writeBackFile } from "./read-back.js";
import { unshownConflicts } from "./held-conflicts.js";
import type { TakeInRequest } from "./take-in-port.js";

/** Check indexed files found by the walk, always re-reading stats after the sweep's possible moves. */
export async function writeBackProjectionFiles(root: ProjectionRootState, initial: ProjectionIndex, files: readonly string[]): Promise<ProjectionIndex> {
  let index = initial;
  const reference = await readReference(root.checkout);
  const pending: string[] = [];
  for (const path of files) {
    const checked = await checkFileAtPath(root, index, path, reference);
    index = checked.index;
    if (checked.edited) { root.unsent.add(path); pending.push(path); }
  }
  for (const path of pending) {
    const entry = index.entries[path];
    if (entry?.kind !== "record") continue;
    const request: TakeInRequest = { checkout: root.checkout, path, copy: null, entry,
      base: path.endsWith(".md") ? { kind: "stamp", stamp: null } : { kind: "blob", blob: entry.base.blob } };
    index = await sendFile(root, index, request);
  }
  return index;
}

async function checkFileAtPath(root: ProjectionRootState, index: ProjectionIndex, path: string, reference: bigint | null): Promise<{ index: ProjectionIndex; edited: boolean }> {
  const entry = index.entries[path];
  if (entry?.kind !== "record") {
    if (entry === undefined) root.discovered.push(path);
    return { index, edited: false };
  }
  if (entry.withheld) {
    report(path, "withheld", "Copy out anything wanted and delete the withheld file before retrying.");
    return { index, edited: false };
  }
  await root.checkpoint?.();
  const changed = await checkChange({ path: join(root.checkout, path), recorded: entry.stat,
    written: entry.written, reference, format: root.context.format });
  if (changed.status === "absent") return { index, edited: false };
  if (changed.status !== "changed" && !entry.pending) return { index: withEntry(index, path, { ...entry, stat: changed.stat }), edited: false };
  return { index, edited: true };
}

async function sendFile(root: ProjectionRootState, index: ProjectionIndex, request: TakeInRequest): Promise<ProjectionIndex> {
  const { path, entry } = request;
  const denied = await root.rights?.(request);
  if (denied !== undefined && denied !== null) {
    projectionProcessState().diagnostics.push({ path, copy: null, mark: denied });
    return withEntry(index, path, { ...entry, pending: true, refused: denied });
  }
  let updated: ProjectionIndex;
  if (root.writable(path)) {
    const written = await writeBackFile(root.context, index, request);
    updated = written.index;
    if (written.result.answer === "taken-in") root.unsent.delete(path);
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

function withEntry(index: ProjectionIndex, path: string, entry: RecordEntry): ProjectionIndex {
  return { ...index, entries: { ...index.entries, [path]: entry } };
}
function report(path: string, reason: string, remedy: string): void {
  projectionProcessState().diagnostics.push({ path, copy: null, mark: { reason, remedy: { text: remedy } } });
}
