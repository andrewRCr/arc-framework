/** Publish both record identities before linking a staged arrival into an absent reused path. */
import { removeProjectionAsideFile } from "./aside-cleanup.js";
import { join } from "node:path";
import type { StoreRecord } from "../read.js";
import { sameReference } from "../identity.js";
import type { ProjectionIndex, RecordEntry } from "./index-schema.js";
import type { RecordRenderer } from "./record-render.js";
import type { OwnershipRoot } from "./ownership-handoff.js";
import { readProjectionLinkBoundary } from "./discovery-links.js";
import { readStat } from "./change-detection.js";
import { projectionLayMode } from "./lay-mode.js";
import { withProjectionEntry } from "./index-memory.js";
import { commitProjectionIndex } from "./index-file.js";
import { ownershipHandoffMark } from "./ownership-hold.js";
import { stageRecordFile } from "./staging.js";
import { retriedMoves } from "./aside-moves.js";
import { markStoreRefusal } from "./refusal-mark.js";
import { ensureLayFolder, occupiedFolderMark } from "./lay-folder.js";
import { ArchiveDestinationBlocked, archiveDestinationRefusal } from "./archive-file.js";

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
  const foreign = archiveDestinationRefusal(root.checkout, path);
  if (foreign !== null) {
    root.context.report?.({ path, copy: null, mark: foreign });
    return withProjectionEntry(input.index, path, { ...previous, pending: true, refused: foreign });
  }
  const occupying = await ensureLayFolder(root.checkout, path);
  if (occupying !== null) {
    root.context.report?.({ path, copy: null, mark: occupiedFolderMark(root.checkout, path, occupying) });
    return withProjectionEntry(input.index, path, { ...previous, pending: true });
  }
  const opened = input.arriving.opened === true || (previous.arrivingOpened !== undefined && sameReference(previous.arrivingOpened, record.reference));
  const changed = input.arriving.changed || (previous.arrivingChanged !== undefined && sameReference(previous.arrivingChanged, record.reference));
  const candidate: RecordEntry = { ...input.arriving, changed, ...(opened ? { opened: true as const } : {}) };
  const staged = await stageRecordFile({ checkout: root.checkout, path, record, renderer: input.renderer,
    layMode: projectionLayMode(path, candidate), replacing: previous.base.blob, writer: root.context.writer,
    format: root.context.format, checkpoint: root.context.checkpoint });
  if (staged.status === "refused") {
    const mark = markStoreRefusal(staged.refusal);
    root.context.report?.({ path, copy: null, mark });
    return withProjectionEntry(input.index, path, { ...previous, pending: true, refused: mark });
  }
  const stat = await readStat(join(root.checkout, staged.result.location));
  if (stat === null) throw new Error(`Staged ownership arrival disappeared: ${path}`);
  // A refresh that moved this record here while the leaving bytes remained parked its changed mark on the leaving entry.
  const arriving: RecordEntry = { ...candidate, stat, written: staged.result.written, base: staged.result.base,
    markers: staged.result.rendering?.markers ?? null, notices: staged.result.rendering?.notices ?? [],
    unshown: staged.result.rendering?.unshown ?? record.conflicts, protected: staged.result.rendering?.protected ?? false };
  const journaled = { ...previous, handoff: arriving, pending: true, withheld: true };
  let index = await commitProjectionIndex({ location: root.location, checkout: root.checkout,
    index: withProjectionEntry(input.index, path, { ...journaled, refused: ownershipHandoffMark(journaled) }), checkpoint: root.context.checkpoint });
  index = await linkOwnershipArrival(root, index, path, previous, staged.result.location);
  await root.context.checkpoint?.();
  await removeProjectionAsideFile(root.checkout, staged.result.location, root.context.checkpoint);
  return index;
}

async function linkOwnershipArrival(root: OwnershipRoot, index: ProjectionIndex, path: string, previous: RecordEntry,
  staged: string): Promise<ProjectionIndex> {
  await root.context.hooks?.beforeRebuildLink?.(path);
  let leaving = { ...previous, pending: true };
  try {
    const moves = retriedMoves({ checkpoint: root.context.checkpoint }, { checkout: root.checkout, path });
    if (await moves.linkOnto(join(root.checkout, staged), join(root.checkout, path))) return index;
  } catch (error) {
    if (!(error instanceof ArchiveDestinationBlocked)) throw error;
    root.context.report?.({ path, copy: null, mark: error.mark });
    leaving = { ...leaving, refused: error.mark };
  }
  return commitProjectionIndex({ location: root.location, checkout: root.checkout,
    index: withProjectionEntry(index, path, leaving), checkpoint: root.context.checkpoint });
}
