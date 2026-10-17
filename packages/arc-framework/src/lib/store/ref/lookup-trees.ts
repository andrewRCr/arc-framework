/** Four-process metadata capture and a disposable tip-keyed lookup cache. */

import type { StoreResult } from "../refusal.js";
import type { RefBackendContext } from "./context.js";
import type { RefLookupTree } from "./lookup.js";
import { matchesFamilyRef } from "./codec.js";
import { readBatchObjects, readRefTips, readRefTrees } from "./batch-read.js";
import type { RefTreeEntry } from "./batch-read.js";
import { metadataFailure, parseRefMetadata } from "./metadata.js";

const cache = new Map<string, { signature: string; trees: ReadonlyMap<string, RefLookupTree> }>();

/** Capture live primary and registry metadata, retaining only successful immutable scans. */
export async function readLookupTrees(context: RefBackendContext): Promise<StoreResult<ReadonlyMap<string, RefLookupTree>>> {
  const all = await readRefTips(context);
  const tips = new Map([...all].filter(([ref]) => matchesFamilyRef(ref, "work-item") || matchesFamilyRef(ref, "cohort")
    || ref === "refs/arc/project/registry"));
  const signature = JSON.stringify([...tips].sort(([left], [right]) => left.localeCompare(right)));
  const prior = cache.get(context.checkoutRoot);
  if (prior?.signature === signature) return { status: "ok", result: prior.trees };
  const captured = await captureLookupTrees(context, tips);
  if (captured.status === "ok") cache.set(context.checkoutRoot, { signature, trees: captured.result });
  return captured;
}

async function captureLookupTrees(context: RefBackendContext, tips: ReadonlyMap<string, string>): Promise<StoreResult<ReadonlyMap<string, RefLookupTree>>> {
  const captured = tips.size > 0 ? await readRefTrees(context, tips) : new Map<string, RefTreeEntry[]>();
  const metadataPath = (ref: string) => ref === "refs/arc/project/registry" ? "metadata-registry.json" : `metadata-${ref.split("/").at(-1)}.json`;
  const queries = [...tips].map(([ref, tip]) => `${tip}:${metadataPath(ref)}`);
  const objects = await readBatchObjects(context, queries);
  const trees = new Map<string, RefLookupTree>();
  for (const [ref, tip] of tips) {
    const entries = captured.get(ref);
    if (!entries) return { status: "refused", refusal: { code: "namespace-corrupt", class: "terminal", namespace: ref,
      condition: `The tip or root tree of ${ref} is unavailable locally.`,
      remedy: { text: "Restore or fetch the missing state objects, then repeat the lookup." } } };
    const metadata = parseRefMetadata(objects.get(`${tip}:${metadataPath(ref)}`), ref);
    if (!metadata) return { status: "refused", refusal: { code: "namespace-corrupt", class: "terminal", namespace: ref, ...metadataFailure(ref) } };
    trees.set(ref, { entries, metadata });
  }
  return { status: "ok", result: trees };
}
