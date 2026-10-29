/** Lazy immutable record snapshots for a write's before and after views. */

import type { ReadPlacement } from "../placement.js";
import type { RefBackendContext } from "./context.js";
import type { RefWriteGroup } from "./write-commits.js";
import { readBatchObjects, readRefTrees, type BatchObject, type RefTreeEntry } from "./batch-read.js";
import { isManifestRef } from "./manifest.js";
import { canonicalPrimaryKind, parseRefMetadata, type RefMetadata } from "./metadata.js";
import { FAMILY_IDS, type FamilyId } from "../catalog.js";
import { expandStoredPath, type StoredRecordHome } from "../stored-path.js";
import { matchesFamilyRef } from "./codec.js";
import { refPrototype } from "./read.js";
import { RecordReferenceSchema, type RecordReference } from "../identity.js";
import { archiveOwnerTrees, isArchiveRef } from "./archive-read.js";
import { rootFamily } from "./path-decode.js";

/** A ref's immutable entries, optionally overlaid with prepared metadata. */
export interface RefViewGroup { entries?: readonly RefTreeEntry[]; metadata?: RefMetadata; readPlacement?: ReadPlacement }
/** All observed entries and objects without any live-ref reads during selection. */
export interface RefViewState { refs: ReadonlyMap<string, RefViewGroup>; objects: ReadonlyMap<string, BatchObject | null>; saved?: boolean }

/** Read only the caller's captured tips, retaining unavailable refs for diagnostics. */
export async function captureRefViewState(context: RefBackendContext, tips: ReadonlyMap<string, string>): Promise<RefViewState> {
  const selected = new Map([...tips].filter(([ref]) => isManifestRef(ref)));
  const trees = selected.size ? await readRefTrees(context, selected) : new Map<string, RefTreeEntry[]>();
  return stateFromTrees(context, selected, trees);
}

/** Materialize a known owner's captured tree and folders without losing an intact subject to an unrelated subtree. */
export async function captureRefPointViewState(context: RefBackendContext, tips: ReadonlyMap<string, string>,
  reference: RecordReference): Promise<RefViewState> {
  const home = expandStoredPath(reference, { registry: context.registry });
  const archivable = ["work-item", "cohort"].includes(rootFamily(context.registry[reference.kind].family));
  const selected = new Map([...tips].filter(([ref]) => ref === home.ref
    || reference.owner.type === "project" && ref === "refs/arc/project/registry"
    || archivable && !tips.has(home.ref) && isArchiveRef(ref)));
  const trees = await readRefTrees(context, selected);
  const tip = selected.get(home.ref);
  if (tip && !trees.has(home.ref)) {
    const scoped = await readScopedPointTree(context, reference, home, tip);
    if (scoped) trees.set(home.ref, scoped);
  }
  const registry = selected.get("refs/arc/project/registry");
  if (reference.owner.type === "project" && registry && home.ref !== "refs/arc/project/registry" && !trees.has("refs/arc/project/registry")) {
    const scoped = (await readRefTrees(context, new Map([["refs/arc/project/registry", registry]]), ["identity.json", "metadata-registry.json"])).get("refs/arc/project/registry");
    if (scoped) trees.set("refs/arc/project/registry", scoped);
  }
  const archived = archiveOwnerTrees(new Map([...trees].filter(([ref]) => isArchiveRef(ref))), [reference.owner]);
  for (const ref of trees.keys()) if (isArchiveRef(ref)) trees.set(ref, archived.get(ref) ?? []);
  return stateFromTrees(context, selected, trees);
}

async function readScopedPointTree(context: RefBackendContext, reference: RecordReference, home: StoredRecordHome,
  tip: string): Promise<RefTreeEntry[] | undefined> {
  const query = `${tip}:${home.metadataPath}`, metadata = parseRefMetadata((await readBatchObjects(context, [query])).get(query), home.ref);
  if (!metadata) return;
  const canonical = RecordReferenceSchema.parse({ ...reference, kind: canonicalPrimaryKind(reference.kind, metadata),
    owner: reference.owner.type === "work-item" || reference.owner.type === "cohort"
      ? { ...reference.owner, name: metadata.slug ?? reference.owner.name } : reference.owner });
  const target = expandStoredPath(canonical, { registry: context.registry });
  const paths = [target.path, target.metadataPath, `${target.root}conflicts`,
    ...reference.owner.type === "project" && home.ref === "refs/arc/project/registry" ? ["identity.json"] : []];
  return (await readRefTrees(context, new Map([[home.ref, tip]]), paths)).get(home.ref);
}

async function stateFromTrees(context: RefBackendContext, selected: ReadonlyMap<string, string>,
  trees: ReadonlyMap<string, RefTreeEntry[]>): Promise<RefViewState> {
  const objects = await readBatchObjects(context, [...new Set([...trees.values()].flatMap((entries) => entries.map(({ oid }) => oid)))]);
  return { refs: new Map([...selected.keys()].map((ref) => [ref, { entries: trees.get(ref) }])), objects };
}

/** Overlay all prepared mutations together, leaving the captured state independent. */
export async function overlayRefViewState(context: RefBackendContext, before: RefViewState,
  groups: ReadonlyMap<string, RefWriteGroup>): Promise<RefViewState> {
  const refs = new Map(before.refs);
  for (const [ref, group] of groups) {
    if (group.original.size === 0 && group.entries.size === 0) continue;
    refs.set(group.viewRef ?? ref, { entries: [...group.entries.values()], metadata: structuredClone(group.metadata), readPlacement: group.readPlacement });
  }
  const oids = [...new Set([...groups.values()].flatMap(({ entries }) => [...entries.values()].map(({ oid }) => oid)))]
    .filter((oid) => !before.objects.has(oid));
  const objects = new Map([...before.objects, ...await readBatchObjects(context, oids)]);
  return { refs, objects };
}

/** Select the physical family whose metadata identifies a live ref. */
export function viewRefFamily(ref: string): FamilyId | undefined {
  return FAMILY_IDS.find((family) => matchesFamilyRef(ref, family));
}

/** Decode captured metadata or use the caller's prepared copy. */
export function viewRefMetadata(context: RefBackendContext, state: RefViewState, ref: string, family: FamilyId): RefMetadata | null {
  const group = state.refs.get(ref);
  if (!group) return null;
  if (group.metadata) return group.metadata;
  const home = expandStoredPath(refPrototype(context, ref, family), { registry: context.registry });
  const entry = group.entries?.find(({ path }) => path === home.metadataPath);
  return parseRefMetadata(entry ? state.objects.get(entry.oid) : null, ref);
}
