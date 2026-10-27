/** Acquire complete withdrawal evidence under the ordered ref locks before staging any inverse. */

import type { RecordReference } from "../identity.js";
import type { RefBackendContext } from "./context.js";
import { readBatchObjects, readRefTrees, type RefTreeEntry } from "./batch-read.js";
import { readEarlierWithdrawLineage } from "./sync-withdraw-earlier-lineage.js";
import { materializeWithdrawJournal, UnavailableWithdrawJournal, type WithdrawJournalDescription, type WithdrawJournalStep } from "./sync-withdraw-journal.js";
import type { WithdrawEnd } from "./sync-withdraw-commit.js";
import { withdrawRefTargets } from "./sync-withdraw-targets.js";
import { inverseWithdrawStep } from "./sync-withdraw-inverse.js";
import { laterSiblingEnds } from "./sync-withdraw-sibling-ends.js";
import { preserveSiblingLineage } from "./sync-withdraw-preserved-lineage.js";
import { findRefNamespaceCollision } from "./path-admission.js";
import { RefSyncLabelError } from "./sync-label.js";
import { syncRefMergeBase } from "./sync-graph.js";
import { isUnavailableGraphFailure } from "./history-graph.js";

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
  await readWithdrawalAncestors(context, journal, basis);
  await requireWithdrawalBlobs(context, journal, trees, published);
  const retained = await laterSiblingEnds(context, basis, journal);
  const targets = await withdrawRefTargets(context, journal, basis.incoming, basis.batches);
  for (const ref of retained.keys()) targets.delete(ref);
  const prepared = new Map<string, Map<string, RefTreeEntry>>();
  for (const step of journal) {
    const current = prepared.get(step.ref) ?? new Map((trees.get(step.ref) ?? []).map((entry) => [entry.path, entry]));
    const remote = new Map((published.get(step.ref) ?? []).map((entry) => [entry.path, entry]));
    prepared.set(step.ref, retained.has(step.ref) ? current : await inverseWithdrawStep(context, step, current, basis.batches, remote));
  }
  const registry = prepared.get("refs/arc/project/registry");
  if (registry) await preserveSiblingLineage(context, [...retained.values()], trees.get("refs/arc/project/registry") ?? [], registry);
  for (const [ref, entries] of prepared) {
    const collision = findRefNamespaceCollision(ref, entries.keys());
    if (collision) throw new RefSyncLabelError(ref, { code: "namespace-corrupt", class: "terminal", namespace: ref,
      condition: `The withdrawn-end inverse on ${ref} collides at ${collision.path} and ${collision.other}.`,
      remedy: { text: "Repair the colliding retained source paths in a new commit, then retry the pull to withdraw the unpublished end." } });
  }
  return { targets, prepared };
}

/** Compare the original before-commit with the captured incoming tip, never a reconciled tip. */
async function readWithdrawalAncestors(context: RefBackendContext, journal: readonly WithdrawJournalStep[], basis: WithdrawalBasis): Promise<void> {
  for (const step of journal) {
    step.currentTip = basis.state.get(step.ref);
    step.publishedTip = basis.incoming.get(step.ref);
    if (!step.beforeTip || !step.publishedTip) continue;
    let ancestor: string | null;
    try { ancestor = await syncRefMergeBase(context, step.beforeTip, step.publishedTip); }
    catch (error) {
      if (!await isUnavailableGraphFailure(context, error)) throw error;
      throw new UnavailableWithdrawJournal(step.ref, "The original and published withdrawal ancestor cannot be read.");
    }
    if (!ancestor) continue;
    const trees = await readRefTrees(context, new Map([[step.ref, ancestor]])), entries = trees.get(step.ref);
    if (!entries) throw new UnavailableWithdrawJournal(step.ref, "The original and published withdrawal ancestor tree is unavailable.");
    step.ancestor = new Map(entries.map(entry => [entry.path, entry]));
  }
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
  const entries = journal.flatMap((step) => [...step.before.values(), ...step.after.values(), ...step.ancestor.values(),
    ...trees.get(step.ref) ?? [], ...published.get(step.ref) ?? []].map((entry) => ({ ref: step.ref, entry })));
  const blobs = entries.filter(({ entry }) => entry.mode !== "040000" && entry.mode !== "160000");
  const objects = await readBatchObjects(context, [...new Set(blobs.map(({ entry }) => entry.oid))]);
  for (const { ref, entry } of blobs) if (objects.get(entry.oid)?.type !== "blob") {
    throw new UnavailableWithdrawJournal(ref, `The blob at ${entry.path} required to withdraw the unpublished end is unavailable for ${ref}.`);
  }
}
