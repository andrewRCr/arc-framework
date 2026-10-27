/** Acquire complete withdrawal evidence under the ordered ref locks before staging any inverse. */

import { OwnerIdentitySchema, type RecordReference } from "../identity.js";
import type { RefBackendContext } from "./context.js";
import { readBatchObjects, readRefTrees, type RefTreeEntry } from "./batch-read.js";
import { readEarlierWithdrawLineage } from "./sync-withdraw-earlier-lineage.js";
import { materializeWithdrawJournal, UnavailableWithdrawJournal, type WithdrawJournalDescription, type WithdrawJournalStep } from "./sync-withdraw-journal.js";
import type { WithdrawEnd } from "./sync-withdraw-commit.js";
import { withdrawRefTargets } from "./sync-withdraw-targets.js";
import { inverseWithdrawStep } from "./sync-withdraw-inverse.js";
import { parseRefMetadata } from "./metadata.js";
import { parseLineageRecord } from "../kinds/lineage/index.js";
import { ownerPrimaryReference } from "./archive-refresh.js";
import { expandStoredPath } from "../stored-path.js";
import { syncRefIsAncestor } from "./sync-graph.js";

/** Captured immutable coordinates used to validate and invert one competing end. */
export interface WithdrawalBasis {
  end: WithdrawEnd;
  held: ReadonlyMap<string, string>;
  state: ReadonlyMap<string, string>;
  incoming: ReadonlyMap<string, string>;
  reference: RecordReference;
  batches: ReadonlySet<string>;
  journal: readonly WithdrawJournalDescription[];
}

/** Materialize original, current, and published trees before preparing the atomic inverse. */
export async function prepareWithdrawEnd(context: RefBackendContext, basis: WithdrawalBasis): Promise<{
  targets: Map<string, string>; prepared: Map<string, Map<string, RefTreeEntry>>;
}> {
  const journal = [...await materializeWithdrawJournal(context, basis.journal),
    ...await readEarlierWithdrawLineage(context, basis.held, basis.incoming, basis.end)];
  if (!journal.length) throw new Error("An unpublished end has no original batch contributions");
  const refs = new Set(journal.map(({ ref }) => ref));
  const trees = await readWithdrawalTrees(context, basis.state, refs);
  const published = await readWithdrawalTrees(context, basis.incoming, refs);
  await requireWithdrawalBlobs(context, journal, trees, published);
  const retired = await laterSiblingRetirements(context, basis, journal, trees);
  const targets = await withdrawRefTargets(context, journal, basis.incoming, basis.batches);
  for (const ref of retired) targets.delete(ref);
  const prepared = new Map<string, Map<string, RefTreeEntry>>();
  for (const step of journal) {
    const current = prepared.get(step.ref) ?? new Map((trees.get(step.ref) ?? []).map((entry) => [entry.path, entry]));
    const remote = new Map((published.get(step.ref) ?? []).map((entry) => [entry.path, entry]));
    prepared.set(step.ref, retired.has(step.ref) ? current : await inverseWithdrawStep(context, step, current, basis.batches, remote));
  }
  return { targets, prepared };
}

/** Preserve a later terminal lifecycle rather than resurrecting files removed by an earlier sibling rename or archive. */
async function laterSiblingRetirements(context: RefBackendContext, basis: WithdrawalBasis, journal: readonly WithdrawJournalStep[],
  trees: ReadonlyMap<string, readonly RefTreeEntry[]>): Promise<Set<string>> {
  const retained = new Set<string>(), registry = basis.state.get("refs/arc/project/registry");
  if (!registry) return retained;
  for (const step of journal) {
    if (!step.ref.startsWith("refs/arc/history/work/") || !basis.state.has(step.ref)
      || basis.state.has(step.ref.replace("refs/arc/history/", "refs/arc/")) || trees.get(step.ref)?.length !== 0) continue;
    const uid = step.ref.split("/").at(-1), metadataEntry = step.after.get(`metadata-${uid}.json`);
    if (!metadataEntry) continue;
    const lineagePath = `${registry}:lineage/${uid}.json`;
    const objects = await readBatchObjects(context, [metadataEntry.oid, lineagePath]);
    const metadata = parseRefMetadata(objects.get(metadataEntry.oid));
    const value = objects.get(lineagePath);
    const lineage = value?.type === "blob" ? parseLineageRecord(new TextDecoder().decode(value.bytes)) : null;
    if (!metadata?.primary || !metadata.slug || !lineage || lineage.kind === "rename" || lineage.origin.uid !== uid) continue;
    const owner = OwnerIdentitySchema.parse({ type: "work-item", uid, name: metadata.slug });
    const primary = expandStoredPath(ownerPrimaryReference(owner, metadata), { registry: context.registry });
    if (!step.after.has(primary.path)) continue;
    const original = basis.journal.find(({ ref }) => ref === step.ref)?.after, tip = basis.state.get(step.ref);
    if (original && tip && await syncRefIsAncestor(context, original, tip)) retained.add(step.ref);
  }
  return retained;
}

async function readWithdrawalTrees(context: RefBackendContext, source: ReadonlyMap<string, string>,
  refs: ReadonlySet<string>): Promise<Map<string, RefTreeEntry[]>> {
  const selected = new Map([...source].filter(([ref]) => refs.has(ref)));
  const trees = await readRefTrees(context, selected);
  for (const ref of selected.keys()) if (!trees.has(ref)) {
    throw new UnavailableWithdrawJournal(ref, `A tree required to withdraw the unpublished end is unavailable for ${ref}.`);
  }
  return trees;
}

async function requireWithdrawalBlobs(context: RefBackendContext, journal: readonly WithdrawJournalStep[],
  trees: ReadonlyMap<string, readonly RefTreeEntry[]>, published: ReadonlyMap<string, readonly RefTreeEntry[]>): Promise<void> {
  const entries = journal.flatMap((step) => [...step.before.values(), ...step.after.values(),
    ...trees.get(step.ref) ?? [], ...published.get(step.ref) ?? []].map((entry) => ({ ref: step.ref, entry })));
  const blobs = entries.filter(({ entry }) => entry.mode !== "040000" && entry.mode !== "160000");
  const objects = await readBatchObjects(context, [...new Set(blobs.map(({ entry }) => entry.oid))]);
  for (const { ref, entry } of blobs) if (objects.get(entry.oid)?.type !== "blob") {
    throw new UnavailableWithdrawJournal(ref, `The blob at ${entry.path} required to withdraw the unpublished end is unavailable for ${ref}.`);
  }
}
