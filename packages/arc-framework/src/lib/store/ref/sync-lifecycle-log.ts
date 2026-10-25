/** Identify lifecycle ends in exact item histories from stored metadata and terminal empty trees. */

import type { RefBackendContext } from "./context.js";
import type { OwnerIdentity } from "../identity.js";
import { RecordReferenceSchema } from "../identity.js";
import { parseStoreCommitProvenance } from "../commit-provenance.js";
import { readBatchObjects, readRefTrees } from "./batch-read.js";
import { parseRefMetadata } from "./metadata.js";
import { readLifecycleLog } from "./sync-lifecycle-evidence.js";

/**
 * Read original archive stamps and empty-tree ends — swept retirements, and the root the import gives an origin it
 * brought in ended; callers establish their current lineage record.
 */
export async function readItemEndBatches(context: RefBackendContext, tip: string | undefined,
  owner: OwnerIdentity, kind: "all" | "retirement" = "all"): Promise<Set<string>> {
  if (!tip || !("uid" in owner)) return new Set();
  const reference = RecordReferenceSchema.parse({ owner, kind: owner.type === "cohort" ? "cohort/document" : "work-item/meta" });
  const withdrawn = new Set<string>();
  const commits = (await readLifecycleLog(context, tip)).flatMap(({ commit, message }) => {
    const provenance = parseStoreCommitProvenance(message, reference);
    if ("verb" in provenance && provenance.verb === "sync" && provenance.lifecycleAction === "withdraw-end") {
      const original = /^Arc-Withdrawn-End: ([^\r\n]+)$/mu.exec(message)?.[1];
      if (original) withdrawn.add(original);
      return [];
    }
    return commit && "batchId" in provenance && provenance.batchId ? [{ commit, batch: provenance.batchId }] : [];
  });
  if (!commits.length) return new Set();
  const trees = await readRefTrees(context, new Map(commits.map(({ commit }) => [commit, commit])));
  const path = `metadata-${owner.uid}.json`;
  const metadata = [...trees.values()].flatMap((entries) => entries.filter((entry) => entry.path === path));
  const objects = await readBatchObjects(context, [...new Set(metadata.map(({ oid }) => oid))]);
  return new Set(commits.filter(({ commit, batch }) => {
    const entries = trees.get(commit);
    if (!entries || withdrawn.has(batch)) return false;
    const entry = entries.find((entry) => entry.path === path);
    return entries.length === 0 || kind === "all" && parseRefMetadata(entry ? objects.get(entry.oid) : undefined)?.endBatch === batch;
  }).map(({ batch }) => batch));
}
