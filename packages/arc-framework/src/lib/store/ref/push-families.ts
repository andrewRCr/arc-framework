/** Family-scoped observations and stable publication-result grouping. */

import { FAMILY_IDS, type FamilyId } from "../catalog.js";
import { FAMILY_REGISTRY } from "../registry.js";
import type { PublishOutcome, SyncState } from "../sync.js";
import type { RefBackendContext } from "./context.js";
import { readRefTrees, readBatchObjects, type RefTreeEntry, type BatchObject } from "./batch-read.js";
import { refPrototype } from "./read.js";
import { expandStoredPath } from "../stored-path.js";
import { parseRefMetadata } from "./metadata.js";
import { decodeStoredReference, fixedStoredPathKind } from "./path-decode.js";
import { refOwner } from "./codec.js";
import { refRecordVersion } from "./record-version.js";
import { archivedFolders, isArchiveRef } from "./archive-read.js";
import { refFormatKey } from "./format-key.js";
import { viewRefFamily } from "./view-state.js";

/** Declared stored families include reserved families even where they own no refs yet. */
export function statePushFamilies(identity: string | null): FamilyId[] {
  return FAMILY_IDS.filter((family) => family !== "project-machinery" && family !== "constitution"
    && (identity !== null || FAMILY_REGISTRY[family].scope !== "identity"));
}

/** Missing identity is independent of remote configuration and excludes only identity scope. */
export function statePushStates(states: readonly SyncState[], identity: string | null): SyncState[] {
  if (identity !== null || states.some(({ status }) => status === "no-identity")) return [...states];
  return [...states, { status: "no-identity", families: FAMILY_IDS.filter((family) => FAMILY_REGISTRY[family].scope === "identity"),
    remedy: { text: "Set arc.identity to your configured identity, then retry the identity-scope sync." } }];
}

/** Containing families observe ref movement; subtrees observe only their own stored record versions. */
export async function refMovementFamilies(context: RefBackendContext, ref: string, before: string | null, after: string | null): Promise<FamilyId[]> {
  if (before === after) return [];
  if (isArchiveRef(ref)) return archiveMovementFamilies(context, ref, before, after);
  const live = ref.replace("refs/arc/history/", "refs/arc/"), family = viewRefFamily(live);
  if (!family) return [];
  const children = FAMILY_IDS.filter((id) => {
    const home = FAMILY_REGISTRY[id].ref;
    return home && "subtreeOf" in home && home.subtreeOf === family;
  });
  if (children.length === 0) return [family];
  const tips = new Map([...before ? [["before", before] as const] : [], ...after ? [["after", after] as const] : []]);
  const trees = await readRefTrees(context, tips);
  const home = expandStoredPath(refPrototype(context, live, family), { registry: context.registry });
  const relevant = [...trees.values()].flat().filter(({ path }) => path === home.metadataPath
    || children.some((child) => subtreePath(child, path)));
  const objects = await readBatchObjects(context, [...new Set(relevant.map(({ oid }) => oid))]);
  const current = subtreeVersions(context, live, family, trees.get("before") ?? [], objects, home.metadataPath, children);
  const next = subtreeVersions(context, live, family, trees.get("after") ?? [], objects, home.metadataPath, children);
  return [family, ...children.filter((child) => !sameVersions(current.get(child), next.get(child)))];
}

function subtreePath(family: FamilyId, path: string): boolean {
  const home = FAMILY_REGISTRY[family].ref;
  return home !== null && "subtreeOf" in home && path.startsWith(`${home.path}/`);
}

function subtreeVersions(context: RefBackendContext, ref: string, family: FamilyId, entries: readonly RefTreeEntry[],
  objects: ReadonlyMap<string, BatchObject | null>, metadataPath: string, children: readonly FamilyId[]): Map<FamilyId, Map<string, string>> {
  const metadataEntry = entries.find(({ path }) => path === metadataPath);
  const metadata = parseRefMetadata(metadataEntry ? objects.get(metadataEntry.oid) : null, ref);
  const result = new Map(children.map((child) => [child, new Map<string, string>()]));
  for (const entry of entries) {
    const child = children.find((candidate) => subtreePath(candidate, entry.path));
    if (!child) continue;
    if (!metadata) {
      const kind = fixedStoredPathKind(context.registry, family, entry.path);
      if (kind && context.registry[kind].family === child) result.get(child)?.set(entry.path, `${entry.mode}:${entry.oid}`);
      continue;
    }
    const reference = decodeStoredReference(context.registry, refOwner(ref, family, metadata), family, entry.path, metadata, objects.get(entry.oid));
    if (!reference || !("owner" in reference) || context.registry[reference.kind].family !== child) continue;
    const version = refRecordVersion(reference, entry.oid, metadata, metadata.formats[refFormatKey(reference)] ?? 1);
    result.get(child)?.set(entry.path, `${entry.mode}:${version}`);
  }
  return result;
}

function sameVersions(before: ReadonlyMap<string, string> | undefined, after: ReadonlyMap<string, string> | undefined): boolean {
  return (before?.size ?? 0) === (after?.size ?? 0) && [...before ?? []].every(([key, version]) => after?.get(key) === version);
}

/** Report every family exactly once, preferring reconciliation over publication. */
export function successfulStatePublishes(families: readonly FamilyId[], reconciled: ReadonlySet<FamilyId>, pushed: ReadonlySet<FamilyId>,
  retryCount: number, waitedMs: number): PublishOutcome[] {
  const group = (status: "reconciled" | "pushed" | "noop") => families.filter((family) =>
    (reconciled.has(family) ? "reconciled" : pushed.has(family) ? "pushed" : "noop") === status);
  return (["reconciled", "pushed", "noop"] as const).flatMap((status) => {
    const selected = group(status);
    return selected.length ? [{ status, families: selected, retryCount, waitedMs }] : [];
  });
}

async function archiveMovementFamilies(context: RefBackendContext, ref: string, before: string | null, after: string | null): Promise<FamilyId[]> {
  const tips = new Map([...before ? [["before", before] as const] : [], ...after ? [["after", after] as const] : []]);
  const trees = await readRefTrees(context, tips);
  const objects = await readBatchObjects(context, [...new Set([...trees.values()].flat().map(({ oid }) => oid))]);
  const current = archiveFamilyVersions(context, ref, trees.get("before") ?? [], objects);
  const next = archiveFamilyVersions(context, ref, trees.get("after") ?? [], objects);
  return (["work-item", "cohort", "review"] as const).filter((family) => !sameVersions(current.get(family), next.get(family)));
}

function archiveFamilyVersions(context: RefBackendContext, ref: string, entries: readonly RefTreeEntry[],
  objects: ReadonlyMap<string, BatchObject | null>): Map<FamilyId, Map<string, string>> {
  const versions = new Map<FamilyId, Map<string, string>>();
  for (const family of ["work-item", "cohort"] as const) {
    const roots = new Map<string, string>();
    versions.set(family, roots);
    for (const folder of archivedFolders(family, ref, entries, objects).folders) {
      roots.set(folder.root, JSON.stringify(folder.entries));
      if (family !== "work-item") continue;
      const home = expandStoredPath(refPrototype(context, folder.liveRef, family), { registry: context.registry });
      const reviewed = subtreeVersions(context, folder.liveRef, family, folder.entries, objects, home.metadataPath, ["review"]);
      const reviews = versions.get("review") ?? new Map<string, string>();
      for (const [path, version] of reviewed.get("review") ?? []) reviews.set(`${folder.liveRef}:${path}`, version);
      versions.set("review", reviews);
    }
  }
  return versions;
}
