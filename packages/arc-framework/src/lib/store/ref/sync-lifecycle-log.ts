/** Identify lifecycle ends in exact item histories from stored metadata and terminal empty trees. */

import type { RefBackendContext } from "./context.js";
import type { OwnerIdentity } from "../identity.js";
import { RecordReferenceSchema } from "../identity.js";
import { parseStoreCommitProvenance } from "../commit-provenance.js";
import { readBatchObjects, readRefTrees } from "./batch-read.js";
import { readRefMetadata } from "./metadata.js";
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

/** A nonempty commit whose metadata cannot establish whether it carries its batch's end. */
export interface ItemEndFault extends ItemEndCandidate { fault: "missing" | "unparseable" | "no-metadata" }

/** Preserve end coordinates, unavailable trees, and faulted metadata so callers choose their completeness policy. */
export async function readItemEndCandidates(context: RefBackendContext, tip: string | undefined,
  owner: OwnerIdentity, kind: "all" | "retirement" = "all"): Promise<{ candidates: ItemEndCandidate[]; unavailable: Set<string>; faults: ItemEndFault[] }> {
  const unavailable = new Set<string>(), faults: ItemEndFault[] = [];
  if (!tip || !("uid" in owner)) return { candidates: [], unavailable, faults };
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
  if (!commits.length) return { candidates: [], unavailable, faults };
  const trees = await readRefTrees(context, new Map(commits.map(({ commit }) => [commit, commit])));
  const path = `metadata-${owner.uid}.json`;
  const metadata = [...trees.values()].flatMap((entries) => entries.filter((entry) => entry.path === path));
  const objects = await readBatchObjects(context, [...new Set(metadata.map(({ oid }) => oid))]);
  const candidates = commits.filter(({ commit, batch }) => {
    const entries = trees.get(commit);
    if (!entries) { unavailable.add(commit); return false; }
    if (withdrawn.has(batch)) return false;
    if (entries.length === 0) return true;
    if (kind !== "all") return false;
    const entry = entries.find((entry) => entry.path === path);
    // End discovery keeps slug validation at the consumer's exact history coordinate.
    const read = readRefMetadata(undefined, entry, objects);
    if (read.kind !== "parsed") faults.push({ commit, batch, fault: read.kind === "absent" ? "no-metadata" : read.kind });
    return read.kind === "parsed" && read.metadata.endBatch === batch;
  });
  return { candidates, unavailable, faults };
}
