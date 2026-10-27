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
  return new Set((await readItemEndCandidates(context, tip, owner, kind)).candidates.map(({ batch }) => batch));
}

/** One original end's commit and batch, before a consumer orders its ancestry or establishes publication. */
export interface ItemEndCandidate { commit: string; batch: string }

/** Preserve end coordinates and unavailable trees separately so callers can choose their own completeness policy. */
export async function readItemEndCandidates(context: RefBackendContext, tip: string | undefined,
  owner: OwnerIdentity, kind: "all" | "retirement" = "all"): Promise<{ candidates: ItemEndCandidate[]; unavailable: Set<string> }> {
  const unavailable = new Set<string>();
  if (!tip || !("uid" in owner)) return { candidates: [], unavailable };
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
  if (!commits.length) return { candidates: [], unavailable };
  const trees = await readRefTrees(context, new Map(commits.map(({ commit }) => [commit, commit])));
  const path = `metadata-${owner.uid}.json`;
  const metadata = [...trees.values()].flatMap((entries) => entries.filter((entry) => entry.path === path));
  const objects = await readBatchObjects(context, [...new Set(metadata.map(({ oid }) => oid))]);
  const candidates = commits.filter(({ commit, batch }) => {
    const entries = trees.get(commit);
    if (!entries) { unavailable.add(commit); return false; }
    if (withdrawn.has(batch)) return false;
    const entry = entries.find((entry) => entry.path === path);
    return entries.length === 0 || kind === "all" && parseRefMetadata(entry ? objects.get(entry.oid) : undefined)?.endBatch === batch;
  });
  return { candidates, unavailable };
}
