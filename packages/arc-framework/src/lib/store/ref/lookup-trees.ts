/** Four-process metadata capture and a disposable tip-keyed lookup cache. */

import type { StoreResult } from "../refusal.js";
import type { RefBackendContext } from "./context.js";
import type { RefLookupTree } from "./lookup.js";
import { archivedFolders, latestArchivedFolders, isArchiveRef } from "./archive-read.js";
import { expandStoredPath } from "../stored-path.js";
import { refPrototype } from "./read.js";
import { viewRefFamily } from "./view-state.js";
import { matchesFamilyRef } from "./codec.js";
import { readBatchObjects, readRefTips, readRefTrees } from "./batch-read.js";
import type { BatchObject, RefTreeEntry } from "./batch-read.js";
import { metadataFailure, parseRefMetadata } from "./metadata.js";

const cache = new Map<string, { signature: string; trees: ReadonlyMap<string, RefLookupTree> }>();

/** Capture primary, completed, registry, and own-claim metadata without a persisted index. */
export async function readLookupTrees(context: RefBackendContext, identity: string | null): Promise<StoreResult<ReadonlyMap<string, RefLookupTree>>> {
  const all = await readRefTips(context);
  const tips = new Map([...all].filter(([ref]) => matchesFamilyRef(ref, "work-item") || matchesFamilyRef(ref, "cohort")
    || isArchiveRef(ref) || ref === "refs/arc/project/registry" || identity !== null && ref === `refs/arc/user/${identity}/claims`));
  const signature = JSON.stringify([identity, [...tips].sort(([left], [right]) => left.localeCompare(right))]);
  const prior = cache.get(context.checkoutRoot);
  if (prior?.signature === signature) return { status: "ok", result: prior.trees };
  const captured = await captureLookupTrees(context, tips);
  if (captured.status === "ok") cache.set(context.checkoutRoot, { signature, trees: captured.result });
  return captured;
}

async function captureLookupTrees(context: RefBackendContext, tips: ReadonlyMap<string, string>): Promise<StoreResult<ReadonlyMap<string, RefLookupTree>>> {
  const captured = tips.size > 0 ? await readRefTrees(context, tips) : new Map<string, RefTreeEntry[]>();
  const payloads = claimPayloadPatterns(context);
  const queries = [...new Set([...captured.values()].flatMap((entries) => entries.filter(({ path }) =>
    /(?:^|\/)metadata-[^/]+\.json$/u.test(path) || payloads.some((pattern) => pattern.test(path))).map(({ oid }) => oid)))];
  const objects = await readBatchObjects(context, queries);
  const trees = new Map<string, RefLookupTree>();
  for (const [ref] of tips) {
    const entries = captured.get(ref);
    if (!entries) return { status: "refused", refusal: { code: "namespace-corrupt", class: "terminal", namespace: ref,
      condition: `The tip or root tree of ${ref} is unavailable locally.`,
      remedy: { text: "Restore or fetch the missing state objects, then repeat the lookup." } } };
    if (isArchiveRef(ref)) continue;
    const entry = entries.find(({ path }) => path === lookupMetadataPath(context, ref));
    const metadata = parseRefMetadata(entry ? objects.get(entry.oid) : null, ref);
    if (!metadata) return { status: "refused", refusal: { code: "namespace-corrupt", class: "terminal", namespace: ref, ...metadataFailure(ref) } };
    trees.set(ref, { entries, metadata, objects });
  }
  appendArchivedLookupTrees(trees, captured, objects);
  return { status: "ok", result: trees };
}

function lookupMetadataPath(context: RefBackendContext, ref: string): string {
  const family = viewRefFamily(ref);
  if (!family) throw new Error("The lookup scan contains an unregistered ref family");
  return expandStoredPath(refPrototype(context, ref, family), { registry: context.registry }).metadataPath;
}

/** Add each completed owner's latest folder without consulting current refs. */
export function appendArchivedLookupTrees(trees: Map<string, RefLookupTree>, captured: ReadonlyMap<string, readonly RefTreeEntry[]>,
  objects: ReadonlyMap<string, BatchObject | null>): void {
  const folders = [...captured].flatMap(([ref, entries]) => isArchiveRef(ref)
    ? (["work-item", "cohort"] as const).flatMap((family) => archivedFolders(family, ref, entries, objects).folders) : []);
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
