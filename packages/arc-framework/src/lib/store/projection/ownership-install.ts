/** Publish both record identities before linking a staged arrival into an absent reused path. */
import { removeProjectionAsideFile } from "./aside-cleanup.js";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { StoreRecord } from "../read.js";
import type { ProjectionIndex, RecordEntry } from "./index-schema.js";
import type { RecordRenderer } from "./record-render.js";
import type { OwnershipRoot } from "./ownership-handoff.js";
import { readProjectionLinkBoundary } from "./discovery-links.js";
import { readStat } from "./change-detection.js";
import { withProjectionEntry } from "./index-memory.js";
import { commitProjectionIndex } from "./index-file.js";
import { ownershipHandoffMark } from "./ownership-hold.js";
import { stageRecordFile } from "./staging.js";
import { retriedMoves } from "./aside-moves.js";
import { markStoreRefusal } from "./refusal-mark.js";

/** A desired record and its new basis, kept separate from the leaving entry's rendering and copies. */
export interface OwnershipInstallation {
  readonly root: OwnershipRoot;
  readonly index: ProjectionIndex;
  readonly path: string;
  readonly record: StoreRecord;
  readonly arriving: RecordEntry;
  readonly renderer: RecordRenderer;
}

/** Yield to all remaining leaving bytes, then journal before the exclusive destination link. */
export async function installProjectionHandoff(input: OwnershipInstallation): Promise<ProjectionIndex> {
  const { root, path, record } = input;
  const previous = input.index.entries[path];
  if (previous?.kind !== "record") throw new Error(`No leaving record at ${path}`);
  const boundary = await readProjectionLinkBoundary(root.checkout, [path]);
  if (!root.writable(path) || root.blockedByLink(path) !== null || boundary(path) !== null) return input.index;
  if (previous.handoff !== undefined || previous.copies.length > 0 || await readStat(join(root.checkout, path)) !== null) {
    return withProjectionEntry(input.index, path, { ...previous, pending: true });
  }
  await root.context.checkpoint?.();
  await mkdir(join(root.checkout, dirname(path)), { recursive: true });
  const staged = await stageRecordFile({ checkout: root.checkout, path, record, renderer: input.renderer,
    replacing: previous.base.blob, writer: root.context.writer, format: root.context.format, checkpoint: root.context.checkpoint });
  if (staged.status === "refused") {
    const mark = markStoreRefusal(staged.refusal);
    root.context.report?.({ path, copy: null, mark });
    return withProjectionEntry(input.index, path, { ...previous, pending: true, refused: mark });
  }
  const stat = await readStat(join(root.checkout, staged.result.location));
  if (stat === null) throw new Error(`Staged ownership arrival disappeared: ${path}`);
  const arriving: RecordEntry = { ...input.arriving, stat, written: staged.result.written, base: staged.result.base,
    markers: staged.result.rendering?.markers ?? null, notices: staged.result.rendering?.notices ?? [],
    unshown: staged.result.rendering?.unshown ?? record.conflicts, protected: staged.result.rendering?.protected ?? false };
  const held = { ...previous, handoff: arriving, pending: true, withheld: true };
  let index = await commitProjectionIndex({ location: root.location, checkout: root.checkout,
    index: withProjectionEntry(input.index, path, { ...held, refused: ownershipHandoffMark(held) }), checkpoint: root.context.checkpoint });
  await root.context.hooks?.beforeRebuildLink?.(path);
  const linked = await retriedMoves({ checkpoint: root.context.checkpoint }).linkOnto(join(root.checkout, staged.result.location), join(root.checkout, path));
  if (!linked) index = await commitProjectionIndex({ location: root.location, checkout: root.checkout,
    index: withProjectionEntry(index, path, { ...previous, pending: true }), checkpoint: root.context.checkpoint });
  await root.context.checkpoint?.();
  await removeProjectionAsideFile(root.checkout, staged.result.location, root.context.checkpoint);
  return index;
}
