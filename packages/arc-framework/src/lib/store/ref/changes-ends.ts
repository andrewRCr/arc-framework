/** Discover lifecycle boundaries from immutable archive folders and registry changes. */
import type { StoreResult } from "../refusal.js";
import { RecordReferenceSchema } from "../identity.js";
import { expandStoredPath } from "../stored-path.js";
import type { RefBackendContext } from "./context.js";
import { archivedFolders, isArchiveRef, type ArchivedFolder } from "./archive-read.js";
import { readBatchObjects, readRefTrees, type BatchObject, type RefTreeEntry } from "./batch-read.js";
import { missingChangeState, type RefChangeInterval, type ChangeWindowReader, type CapturedChangeWindow } from "./changes-graph.js";
import { parseRefMetadata, metadataFailure } from "./metadata.js";
import { refPrototype } from "./read.js";

/** Endpoint folders and every owner whose end evidence changed inside the interval. */
export interface ChangeEnds {
  before: ArchivedFolder[]; after: ArchivedFolder[]; changed: Map<string, Set<string>>; origins: Set<string>;
}

/** Identify a work item or cohort's live lifecycle coordinate. */
export function isLifecycleRef(ref: string): boolean { return /^refs\/arc\/(?:work|cohort)\//u.test(ref); }

/** Walk changed end refs and read endpoint folders only when a lifecycle window needs them. */
export async function readChangeEnds(context: RefBackendContext, interval: RefChangeInterval, readWindow: ChangeWindowReader): Promise<StoreResult<ChangeEnds>> {
  const result: ChangeEnds = { before: [], after: [], changed: new Map(), origins: new Set() };
  const scanned = await scanEndRefs(context, interval, readWindow, result);
  if (scanned.status === "refused") return scanned;
  const moved = [...new Set([...interval.before.keys(), ...interval.after.keys()])].some((ref) => isLifecycleRef(ref) && interval.before.get(ref) !== interval.after.get(ref));
  if (moved || result.changed.size || result.origins.size) {
    const folders = await readEndSnapshots(context, interval, result);
    if (folders.status === "refused") return folders;
  }
  return { status: "ok", result };
}

async function readEndSnapshots(context: RefBackendContext, interval: RefChangeInterval, result: ChangeEnds): Promise<StoreResult<undefined>> {
  const { input, before, after } = interval;
  const endpointTips = new Map([...before].filter(([ref]) => isArchiveRef(ref)).map(([ref, tip]) => [`before|${ref}`, tip]));
  for (const [ref, tip] of after) if (isArchiveRef(ref)) endpointTips.set(`after|${ref}`, tip);
  const trees = endpointTips.size ? await readRefTrees(context, endpointTips) : new Map<string, RefTreeEntry[]>();
  const objects = await readBatchObjects(context, [...new Set([...trees.values()].flatMap((entries) => entries.map(({ oid }) => oid)))]);
  for (const key of endpointTips.keys()) {
    const boundary = key.indexOf("|"), side = key.slice(0, boundary), ref = key.slice(boundary + 1);
    const entries = trees.get(key);
    if (!entries) return { status: "refused", refusal: missingChangeState({ ref, version: side === "before" ? input.from : input.to }) };
    const folders = endFolders(ref, entries, objects);
    if (folders.status === "refused") return folders;
    (side === "before" ? result.before : result.after).push(...folders.result);
  }
  return { status: "ok", result: undefined };
}

async function scanEndRefs(context: RefBackendContext, interval: RefChangeInterval, readWindow: ChangeWindowReader, result: ChangeEnds): Promise<StoreResult<undefined>> {
  for (const [ref, upper] of interval.after) {
    if ((!isArchiveRef(ref) && ref !== "refs/arc/project/registry") || interval.before.get(ref) === upper) continue;
    const captured = await readWindow({ ref, upper, lower: interval.before.get(ref), version: interval.input.to });
    if (captured.status === "refused") return captured;
    const collected = collectEndWindow(context, captured.result, result);
    if (collected.status === "refused") return collected;
  }
  return { status: "ok", result: undefined };
}

function collectEndWindow(context: RefBackendContext, captured: CapturedChangeWindow, result: ChangeEnds): StoreResult<undefined> {
  for (const row of captured.rows) {
    const entries = captured.trees.get(row.revision) ?? [];
    const parent = row.parents[0] ? captured.trees.get(row.parents[0]) ?? [] : [];
    const collected = isArchiveRef(captured.window.ref)
      ? collectChangedFolders(result, captured.window.ref, entries, parent, captured.objects)
      : collectChangedOrigins(context, result, entries, parent, captured.objects);
    if (collected.status === "refused") return collected;
  }
  return { status: "ok", result: undefined };
}

function collectChangedOrigins(context: RefBackendContext, result: ChangeEnds, entries: readonly RefTreeEntry[], parent: readonly RefTreeEntry[], objects: ReadonlyMap<string, BatchObject | null>): StoreResult<undefined> {
  const current = lineageEndOwners(context, entries, objects), prior = lineageEndOwners(context, parent, objects);
  if (current.status === "refused") return current;
  if (prior.status === "refused") return prior;
  for (const owner of current.result) if (!prior.result.has(owner)) result.origins.add(owner);
  return { status: "ok", result: undefined };
}

function endFolders(ref: string, entries: readonly RefTreeEntry[], objects: ReadonlyMap<string, BatchObject | null>): StoreResult<ArchivedFolder[]> {
  const parsed = (["work-item", "cohort"] as const).map((family) => archivedFolders(family, ref, entries, objects));
  const first = parsed.flatMap(({ diagnostics }) => diagnostics)[0];
  if (first) return { status: "refused", refusal: { code: "namespace-corrupt", class: "terminal", namespace: ref,
    condition: first.condition, remedy: first.remedy } };
  return { status: "ok", result: parsed.flatMap(({ folders }) => folders) };
}

function collectChangedFolders(result: ChangeEnds, ref: string, entries: readonly RefTreeEntry[], parent: readonly RefTreeEntry[], objects: ReadonlyMap<string, BatchObject | null>): StoreResult<undefined> {
  const after = endFolders(ref, entries, objects), before = endFolders(ref, parent, objects);
  if (after.status === "refused") return after;
  if (before.status === "refused") return before;
  for (const folder of after.result) {
    const prior = before.result.find((candidate) => candidate.root === folder.root && candidate.liveRef === folder.liveRef);
    if (prior?.metadata.batch === folder.metadata.batch) continue;
    const batches = result.changed.get(folder.liveRef) ?? new Set<string>();
    if (folder.metadata.batch) batches.add(folder.metadata.batch);
    result.changed.set(folder.liveRef, batches);
  }
  for (const folder of before.result) {
    if (after.result.some((candidate) => candidate.root === folder.root && candidate.liveRef === folder.liveRef)) continue;
    if (!result.changed.has(folder.liveRef)) result.changed.set(folder.liveRef, new Set());
  }
  return { status: "ok", result: undefined };
}

function lineageEndOwners(context: RefBackendContext, entries: readonly RefTreeEntry[], objects: ReadonlyMap<string, BatchObject | null>): StoreResult<Set<string>> {
  if (!entries.length) return { status: "ok", result: new Set() };
  const prototype = refPrototype(context, "refs/arc/project/registry", "project-registry");
  const home = expandStoredPath(prototype, { registry: context.registry });
  if (entries.every(({ path }) => path === home.metadataPath || path === home.manifestPath.slice(0, -1) || path.startsWith(home.manifestPath))) return { status: "ok", result: new Set() };
  const entry = entries.find(({ path }) => path === home.metadataPath);
  const metadata = parseRefMetadata(entry ? objects.get(entry.oid) : null);
  if (!metadata) return { status: "refused", refusal: { code: "namespace-corrupt", class: "terminal", namespace: home.ref, ...metadataFailure(home.ref) } };
  return { status: "ok", result: new Set(Object.entries(metadata.lineage ?? {}).flatMap(([uid, name]) => {
    const reference = RecordReferenceSchema.parse({ kind: "lineage/transition", owner: { type: "work-item", uid, name } });
    const path = expandStoredPath(reference, { registry: context.registry }).path;
    return entries.some((entry) => entry.path === path) ? [`refs/arc/work/${uid}`] : [];
  })) };
}
