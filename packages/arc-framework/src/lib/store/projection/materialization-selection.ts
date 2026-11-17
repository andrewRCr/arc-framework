/** Bound a deleted-file restoration before loading index groups or planning ownership changes. */
import { join } from "node:path";
import type { StoreRecord } from "../read.js";
import { readStat } from "./change-detection.js";
import { readProjectionLinkBoundary, type ProjectionLinkBoundary } from "./discovery-links.js";
import { gateRead } from "./read-gate.js";
import type { ProjectionIndex } from "./index-schema.js";
import { reconcileProjectionHandoffs } from "./ownership-handoff.js";
import { releaseAbsentWithheldPaths } from "./withheld.js";
import type { ProjectionRootState } from "./process-state.js";

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
  for (const [path, record] of input.files) {
    if (!input.root.writable(path)) continue;
    const blocked = input.boundary(path);
    if (blocked !== null && blocked !== path) continue;
    const stat = await readStat(join(input.root.checkout, path));
    if (stat === null) selected.set(path, record);
    else if (await deletedIndexedFile(input, path, stat)) {
      selected.set(path, record);
      if (stat.type === "symlink") links.add(path);
    }
  }
  return { files: selected, links };
}

async function deletedIndexedFile(input: SelectionInput, path: string,
  stat: NonNullable<Awaited<ReturnType<typeof readStat>>>): Promise<boolean> {
  const emptyMarkdown = stat.type === "file" && stat.size === 0n && path.endsWith(".md");
  if (!emptyMarkdown && stat.type !== "symlink") return false;
  const entry = input.index.entries[path];
  if (entry?.kind !== "record" || entry.withheld || entry.handoff !== undefined) return false;
  const boundary = await readProjectionLinkBoundary(input.root.checkout, [path]);
  if (boundary(path) !== (stat.type === "symlink" ? path : null)) return false;
  const read = await gateRead({ path: join(input.root.checkout, path), markdown: path.endsWith(".md") });
  return read.kind === "no-edit";
}

/** Replace stale leaf observations only after re-observing their actual paths and ancestors. */
export async function refreshMaterializationLinks(root: ProjectionRootState, links: ReadonlySet<string>): Promise<void> {
  if (links.size === 0) return;
  const previous = root.blockedByLink, fresh = await readProjectionLinkBoundary(root.checkout, [...links]);
  root.blockedByLink = (path: string) => {
    const held = previous(path);
    return fresh(path) ?? (held !== null && links.has(held) ? null : held);
  };
}
