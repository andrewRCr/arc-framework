/** Four-process metadata capture and a disposable tip-keyed lookup cache. */

import { corruptRef } from "./namespace-health.js";
import type { StoreResult, StoreRefusal } from "../refusal.js";
import type { RefBackendContext } from "./context.js";
import type { RefLookupTree } from "./lookup.js";
import { archivedFolders, latestArchivedFolders, isArchiveRef } from "./archive-read.js";
import { expandStoredPath } from "../stored-path.js";
import { refPrototype } from "./read.js";
import { viewRefFamily } from "./view-state.js";
import { matchesFamilyRef } from "./codec.js";
import { readBatchObjects, readRefTips, readRefTrees } from "./batch-read.js";
import type { BatchObject, RefTreeEntry } from "./batch-read.js";
import { parseRefMetadata } from "./metadata.js";

/** Readable scan evidence plus the namespaces omitted from it. */
export interface RefLookupCapture { trees: ReadonlyMap<string, RefLookupTree>; unreadable: ReadonlyMap<string, StoreRefusal> }

const cache = new Map<string, { signature: string; capture: RefLookupCapture }>();

/** Capture primary, completed, registry, and own-claim metadata without a persisted index. */
export async function readLookupTrees(context: RefBackendContext, identity: string | null): Promise<StoreResult<RefLookupCapture>> {
  return readCapturedLookupTrees(context, await readRefTips(context), identity);
}

/** Resolve exactly the supplied tips without taking a second live namespace snapshot. */
export async function readCapturedLookupTrees(context: RefBackendContext, all: ReadonlyMap<string, string>,
  identity: string | null = null): Promise<StoreResult<RefLookupCapture>> {
  const tips = new Map([...all].filter(([ref]) => matchesFamilyRef(ref, "work-item") || matchesFamilyRef(ref, "cohort")
    || isArchiveRef(ref) || ref === "refs/arc/project/registry" || identity !== null && ref === `refs/arc/user/${identity}/claims`));
  const signature = JSON.stringify([identity, [...tips].sort(([left], [right]) => left.localeCompare(right))]);
  const prior = cache.get(context.checkoutRoot);
  if (prior?.signature === signature) return { status: "ok", result: prior.capture };
  const captured = await captureLookupTrees(context, tips);
  if (captured.status === "ok" && captured.result.unreadable.size === 0) cache.set(context.checkoutRoot, { signature, capture: captured.result });
  return captured;
}

async function captureLookupTrees(context: RefBackendContext, tips: ReadonlyMap<string, string>): Promise<StoreResult<RefLookupCapture>> {
  const captured = tips.size > 0 ? await readRefTrees(context, tips) : new Map<string, RefTreeEntry[]>();
  const payloads = claimPayloadPatterns(context);
  const queries = [...new Set([...captured.values()].flatMap((entries) => entries.filter(({ path }) =>
    /(?:^|\/)metadata-[^/]+\.json$/u.test(path) || payloads.some((pattern) => pattern.test(path))).map(({ oid }) => oid)))];
  const objects = await readBatchObjects(context, queries);
  const trees = new Map<string, RefLookupTree>();
  const unreadable = new Map<string, StoreRefusal>();
  for (const [ref] of tips) {
    const entries = captured.get(ref);
    if (!entries) { unreadable.set(ref, corruptRef(ref, true)); continue; }
    if (isArchiveRef(ref)) continue;
    const path = lookupMetadataPath(context, ref);
    if (entries.every(({ path: stored }) => stored === path)) continue;
    const entry = entries.find(({ path: stored }) => stored === path);
    const metadata = parseRefMetadata(entry ? objects.get(entry.oid) : null, ref);
    if (!metadata) { unreadable.set(ref, corruptRef(ref)); continue; }
    trees.set(ref, { entries, metadata, objects });
  }
  appendArchivedLookupTrees(trees, captured, objects, unreadable);
  return { status: "ok", result: { trees, unreadable } };
}

function lookupMetadataPath(context: RefBackendContext, ref: string): string {
  const family = viewRefFamily(ref);
  if (!family) throw new Error("The lookup scan contains an unregistered ref family");
  return expandStoredPath(refPrototype(context, ref, family), { registry: context.registry }).metadataPath;
}

/** Add each completed owner's latest folder without consulting current refs. */
export function appendArchivedLookupTrees(trees: Map<string, RefLookupTree>, captured: ReadonlyMap<string, readonly RefTreeEntry[]>,
  objects: ReadonlyMap<string, BatchObject | null>, unreadable?: Map<string, StoreRefusal>): void {
  const folders = [...captured].flatMap(([ref, entries]) => isArchiveRef(ref)
    ? (["work-item", "cohort"] as const).flatMap((family) => {
      const parsed = archivedFolders(family, ref, entries, objects);
      if (parsed.diagnostics.some(({ kind }) => kind === "unreadable")) unreadable?.set(ref, corruptRef(ref));
      return parsed.folders;
    }) : []);
  for (const folder of latestArchivedFolders(folders)) trees.set(`${folder.ref}:${folder.root}`, {
    entries: folder.entries, metadata: folder.metadata, liveRef: folder.liveRef, objects,
  });
}

function claimPayloadPatterns(context: Pick<RefBackendContext, "registry">): RegExp[] {
  return (["work-item/record", "claims/groom", "claims/housekeep"] as const).flatMap((kind) => {
    const path = context.registry[kind].ref?.path;
    if (!path) return [];
    const pattern = path.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&").replace(/<(?:slug|uid|person|key)>/gu, "[^/]+");
    return [new RegExp(`(?:^|/)${pattern}$`, "u")];
  });
}

