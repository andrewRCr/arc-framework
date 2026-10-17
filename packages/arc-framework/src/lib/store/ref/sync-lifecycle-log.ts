/** Identify lifecycle ends in exact item histories from stored metadata and terminal empty trees. */

import type { RefBackendContext } from "./context.js";
import type { OwnerIdentity } from "../identity.js";
import { RecordReferenceSchema } from "../identity.js";
import { parseStoreCommitProvenance } from "../commit-provenance.js";
import { readBatchObjects, readRefTrees } from "./batch-read.js";
import { parseRefMetadata } from "./metadata.js";

/** Read original archive stamps and swept retirement candidates; callers establish their current lineage record. */
export async function readItemEndBatches(context: RefBackendContext, tip: string | undefined,
  owner: OwnerIdentity, kind: "all" | "retirement" = "all"): Promise<Set<string>> {
  if (!tip || !("uid" in owner)) return new Set();
  const reference = RecordReferenceSchema.parse({ owner, kind: owner.type === "cohort" ? "cohort/document" : "work-item/meta" });
  const { stdout } = await context.exec("git", ["log", "--format=%H %P%n%B%x00", tip],
    { cwd: context.checkoutRoot, objectAccess: "local-only" });
  const commits = stdout.split("\0").flatMap((block) => {
    const [header = "", ...message] = block.trimStart().split("\n"), [commit, ...parents] = header.split(" ");
    const provenance = parseStoreCommitProvenance(message.join("\n"), reference);
    return commit && "batchId" in provenance && provenance.batchId ? [{ commit, batch: provenance.batchId, hasParent: parents.length > 0 }] : [];
  });
  if (!commits.length) return new Set();
  const trees = await readRefTrees(context, new Map(commits.map(({ commit }) => [commit, commit])));
  const path = `metadata-${owner.uid}.json`;
  const metadata = [...trees.values()].flatMap((entries) => entries.filter((entry) => entry.path === path));
  const objects = await readBatchObjects(context, [...new Set(metadata.map(({ oid }) => oid))]);
  return new Set(commits.filter(({ commit, batch, hasParent }) => {
    const entries = trees.get(commit);
    if (!entries) return false;
    const entry = entries.find((entry) => entry.path === path);
    return entries.length === 0 && hasParent || kind === "all" && parseRefMetadata(entry ? objects.get(entry.oid) : undefined)?.endBatch === batch;
  }).map(({ batch }) => batch));
}
