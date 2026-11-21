/** Bound a deleted-file restoration before loading index groups or planning ownership changes. */
import { join } from "node:path";
import type { StoreRecord } from "../read.js";
import { projectionFileReader, readReference } from "./change-detection.js";
import { readWritableArchiveLinkBoundary, type ProjectionLinkBoundary } from "./discovery-links.js";
import { gateRead, projectionReadGate } from "./read-gate.js";
import type { FileStat, ProjectionIndex } from "./index-schema.js";
import { reconcileProjectionHandoffs } from "./ownership-handoff.js";
import { releaseAbsentWithheldPaths } from "./withheld.js";
import type { ProjectionRootState } from "./process-state.js";
import { reportArchivedProjectionFile } from "./archive-report.js";
import { hasPendingArchiveRecovery, heldArchivePath, refuseArchiveChange, refuseUnreadArchiveScope, selectArchivePath, unreadArchiveScope } from "./archive-selection.js";
import { ArchiveDestinationBlocked } from "./archive-file.js";
import { archiveInventoryLinkHold } from "./archive-discovery.js";

interface SelectionInput {
  root: ProjectionRootState;
  index: ProjectionIndex;
  files: ReadonlyMap<string, StoreRecord>;
  boundary: ProjectionLinkBoundary;
  onlyDeleted?: boolean;
}

/** Reconcile only selected restoration paths while full materialization retains its ordinary scope. */
export async function prepareMaterializationSelection(input: SelectionInput): Promise<{
  files: ReadonlyMap<string, StoreRecord>; index: ProjectionIndex; boundary: ProjectionLinkBoundary; links: ReadonlySet<string>;
}> {
  if (input.onlyDeleted) input.root.blockedByLink = input.boundary;
  const selected = await selectDeletedFiles(input);
  const paths = input.onlyDeleted ? [...selected.files.keys()] : undefined;
  const index = paths === undefined ? input.index : await reconcileProjectionHandoffs(input.root, input.index, paths);
  return { ...selected, index: await releaseAbsentWithheldPaths(input.root, index, paths), boundary: path => {
    const link = input.root.blockedByLink(path) ?? input.boundary(path);
    return link === path && selected.links.has(path) ? null : link;
  } };
}

async function selectDeletedFiles(input: SelectionInput): Promise<{ files: ReadonlyMap<string, StoreRecord>; links: ReadonlySet<string> }> {
  const links = new Set<string>();
  if (!input.onlyDeleted) return { files: input.files, links };
  const selected = new Map<string, StoreRecord>();
  const reference = await readReference(input.root.checkout);
  for (const [path, record] of input.files) {
    if (!input.root.writable(path) && !path.startsWith(".arc/completed/")) continue;
    const blocked = input.boundary(path);
    if (blocked !== null && blocked !== path) continue;
    // An archive path this checkout does not own is reported once and left untouched.
    if (selectArchivePath(input.root, path, { holdAccess: true }) !== null || hasPendingArchiveRecovery(input.index, path)) continue;
    const stat = await observeDeletedFile(input, path, reference);
    if (stat === undefined) continue;
    selected.set(path, record);
    if (stat?.type === "symlink") links.add(path);
  }
  return { files: selected, links };
}

async function observeDeletedFile(input: SelectionInput, path: string, reference: bigint | null): Promise<FileStat | null | undefined> {
  const { root } = input;
  try {
    const stat = await projectionFileReader(root.checkout, path).stat(join(root.checkout, path));
    await reportArchivedProjectionFile(root, input.index, path, { reference, stat });
    if (unreadArchiveScope(root, path) !== null) return undefined;
    return await shouldRestoreFile(input, path, stat) ? stat : undefined;
  } catch (error) {
    if (!(error instanceof ArchiveDestinationBlocked) || !error.access) throw error;
    refuseUnreadArchiveScope(root, path, error.mark);
    return undefined;
  }
}

async function shouldRestoreFile(input: SelectionInput, path: string, stat: FileStat | null): Promise<boolean> {
  if (!input.root.writable(path)) return false;
  return stat === null || await deletedIndexedFile(input, path, stat);
}

async function deletedIndexedFile(input: SelectionInput, path: string, stat: FileStat): Promise<boolean> {
  const emptyMarkdown = stat.type === "file" && stat.size === 0n && path.endsWith(".md");
  if (!emptyMarkdown && stat.type !== "symlink") return false;
  const entry = input.index.entries[path];
  if (entry?.kind !== "record" || entry.withheld || entry.handoff !== undefined) return false;
  const { root } = input;
  const opaque = stat.type === "symlink" ? archiveInventoryLinkHold(input.index, path) : null;
  if (opaque !== null) {
    refuseArchiveChange(root, path, opaque);
    return false;
  }
  const boundary = await readWritableArchiveLinkBoundary(root, [path], root.ports.linkFs);
  if (unreadArchiveScope(root, path) !== null) return false;
  if (boundary(path) !== (stat.type === "symlink" ? path : null)) return false;
  const read = await gateRead({ path: join(root.checkout, path), markdown: path.endsWith(".md") }, projectionReadGate(root.checkout, path));
  return read.kind === "no-edit";
}

/** Replace stale leaf observations only after re-observing their actual paths and ancestors. */
export async function refreshMaterializationLinks(root: ProjectionRootState, links: ReadonlySet<string>): Promise<void> {
  if (links.size === 0) return;
  const previous = root.blockedByLink, fresh = await readWritableArchiveLinkBoundary(root, [...links], root.ports.linkFs);
  root.blockedByLink = (path: string) => {
    const held = previous(path);
    return fresh(path) ?? (held !== null && links.has(held) && heldArchivePath(root, held) === null ? null : held);
  };
}
