/** Merge quarter folders as complete groups and reconcile unpublished sequence assignments. */

import { canonicalize } from "../../kernel/canonical/canonical-json.js";
import { RecordReferenceSchema } from "../identity.js";
import type { StoreResult } from "../refusal.js";
import { archivedFolders, type ArchivedFolder } from "./archive-read.js";
import { readBatchObjects, readRefTrees, type RefTreeEntry } from "./batch-read.js";
import type { RefBackendContext } from "./context.js";
import { corruptRef } from "./namespace-health.js";
import { syncRefMergeBase } from "./sync-graph.js";
import type { SyncMergedTree } from "./sync-tree.js";

type Folders = Map<string, ArchivedFolder>;
interface ArchiveSides { base: Folders; local: Folders; incoming: Folders }

/** Select whole folders against their base, then place unpublished local groups after the remote. */
export async function mergeArchiveTree(context: RefBackendContext, ref: string, local: string,
  incoming: string): Promise<StoreResult<SyncMergedTree>> {
  const base = await syncRefMergeBase(context, local, incoming);
  const tips = new Map([["local", local], ["incoming", incoming], ...base ? [["base", base] as const] : []]);
  const trees = await readRefTrees(context, tips);
  const objects = await readBatchObjects(context, [...new Set([...trees.values()].flatMap((entries) => entries.map(({ oid }) => oid)))]);
  const sides: ArchiveSides = { base: new Map(), local: new Map(), incoming: new Map() };
  for (const key of tips.keys()) {
    const entries = trees.get(key);
    if (!entries) return { status: "refused", refusal: corruptRef(ref, true) };
    const parsed = (["work-item", "cohort"] as const).map((family) => archivedFolders(family, ref, entries, objects));
    const diagnostic = parsed.flatMap(({ diagnostics }) => diagnostics)[0];
    if (diagnostic) return { status: "refused", refusal: { code: "namespace-corrupt", class: "terminal", namespace: ref,
      condition: diagnostic.condition, remedy: diagnostic.remedy } };
    const folders = new Map(parsed.flatMap(({ folders }) => folders).map((folder) => [folderKey(folder), folder]));
    if (key === "base") sides.base = folders;
    else if (key === "local") sides.local = folders;
    else sides.incoming = folders;
  }
  const selected = selectFolders(sides), roots = unpublishedRoots(sides, selected);
  const entries = new Map<string, RefTreeEntry>();
  for (const [key, folder] of selected) {
    for (const entry of folder.entries) {
      const path = (roots.get(key) ?? folder.root) + entry.path;
      entries.set(path, { ...entry, path });
    }
  }
  const subject = [...selected.values(), ...sides.base.values(), ...sides.local.values(), ...sides.incoming.values()][0];
  if (!subject) return { status: "refused", refusal: corruptRef(ref) };
  const reference = RecordReferenceSchema.parse({ owner: subject.owner,
    kind: subject.owner.type === "cohort" ? "cohort/document" : subject.metadata.primary?.role ?? "work-item/meta" });
  return { status: "ok", result: { entries, reference } };
}

function selectFolders(sides: ArchiveSides): Folders {
  const selected: Folders = new Map();
  for (const key of new Set([...sides.base.keys(), ...sides.local.keys(), ...sides.incoming.keys()])) {
    const base = sides.base.get(key), local = sides.local.get(key), incoming = sides.incoming.get(key);
    if (base && (!local || !incoming)) continue;
    const folder = sameFolder(local, base) ? incoming : local ?? incoming;
    if (folder) selected.set(key, folder);
  }
  return selected;
}

function unpublishedRoots(sides: ArchiveSides, selected: Folders): Map<string, string> {
  const roots = new Map<string, string>(), assignments = new Map<string, bigint>();
  let highest = [...sides.incoming.values()].reduce((value, folder) => sequence(folder) > value ? sequence(folder) : value, 0n);
  const pending = [...selected].filter(([key, folder]) => !sides.base.has(key) && !sides.incoming.has(key) && "sequence" in folder.placement)
    .sort(([, left], [, right]) => compareFolders(left, right));
  for (const [key, folder] of pending) {
    const borrowed = folder.owner.type === "cohort" ? borrowedSequence(folder, sides.local, assignments) : undefined;
    const next = borrowed ?? ++highest;
    const root = folder.root.replace(/^\d+/u, String(next).padStart(2, "0"));
    roots.set(key, root);
    assignments.set(key, next);
  }
  return roots;
}

function borrowedSequence(cohort: ArchivedFolder, local: Folders, assignments: ReadonlyMap<string, bigint>): bigint | undefined {
  for (const [key, member] of local) {
    if (member.metadata.primary?.role !== "work-item/meta" || member.metadata.endBatch !== cohort.metadata.endBatch
      || sequence(member) !== sequence(cohort)) continue;
    return assignments.get(key) ?? sequence(member);
  }
  return undefined;
}

function sequence(folder: ArchivedFolder): bigint {
  return BigInt("sequence" in folder.placement ? folder.placement.sequence : "0");
}
function compareFolders(left: ArchivedFolder, right: ArchivedFolder): number {
  const delta = sequence(left) - sequence(right);
  if (delta !== 0n) return delta < 0n ? -1 : 1;
  if (left.owner.type !== right.owner.type) return left.owner.type === "work-item" ? -1 : 1;
  return left.root.localeCompare(right.root);
}
function folderKey(folder: ArchivedFolder): string { return `${folder.liveRef}\0${folder.metadata.endBatch ?? folder.root}`; }
function sameFolder(left: ArchivedFolder | undefined, right: ArchivedFolder | undefined): boolean {
  return left === undefined || right === undefined ? left === right : canonicalize(left.entries) === canonicalize(right.entries);
}
