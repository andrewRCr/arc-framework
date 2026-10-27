/** Prove later independent retirements before an earlier batch's inverse can touch their retained history. */
import { OwnerIdentitySchema, type OwnerIdentity } from "../identity.js";
import { parseLineageRecord } from "../kinds/lineage/index.js";
import { expandStoredPath } from "../stored-path.js";
import { ownerPrimaryReference } from "./archive-refresh.js";
import { readBatchObjects, readRefTrees } from "./batch-read.js";
import type { RefBackendContext } from "./context.js";
import { isUnavailableGraphFailure } from "./history-graph.js";
import { parseRefMetadata } from "./metadata.js";
import { syncRefIsAncestor } from "./sync-graph.js";
import { readItemEndCandidates } from "./sync-lifecycle-log.js";
import { UnavailableWithdrawJournal, type WithdrawJournalStep } from "./sync-withdraw-journal.js";
import type { WithdrawalBasis } from "./sync-withdraw-prepare.js";

/** Preserve a terminal sibling's exact current tree only when its independent later end is witnessed. */
export async function laterSiblingRetirements(context: RefBackendContext, basis: WithdrawalBasis,
  journal: readonly WithdrawJournalStep[]): Promise<Set<string>> {
  const retained = new Set<string>();
  for (const step of journal) {
    if (!step.ref.startsWith("refs/arc/history/work/") || !basis.state.has(step.ref)
      || basis.state.has(step.ref.replace("refs/arc/history/", "refs/arc/"))) continue;
    try {
      const owner = await originalPrimaryOwner(context, step);
      if (!owner || !await hasTerminalLineage(context, basis, owner)) continue;
      const original = basis.journal.find(({ ref }) => ref === step.ref)?.after, tip = basis.state.get(step.ref);
      if (!original || !tip) throw new UnavailableWithdrawJournal(step.ref, "The original contribution's history coordinate is unavailable.");
      if (await hasLaterRetirement(context, step.ref, tip, owner, original, basis.batches)) retained.add(step.ref);
    } catch (error) {
      if (!await isUnavailableGraphFailure(context, error)) throw error;
      throw new UnavailableWithdrawJournal(step.ref, `History required to preserve a later retirement on ${step.ref} is unavailable.`);
    }
  }
  return retained;
}

async function originalPrimaryOwner(context: RefBackendContext, step: WithdrawJournalStep): Promise<OwnerIdentity | undefined> {
  const uid = step.ref.split("/").at(-1), entry = step.after.get(`metadata-${uid}.json`);
  // An original retirement has no after primary; its own inverse must remain possible.
  if (!entry) return;
  const objects = await readBatchObjects(context, [entry.oid]), metadata = parseRefMetadata(objects.get(entry.oid));
  if (!metadata) throw new UnavailableWithdrawJournal(step.ref, "The original contribution's metadata cannot be decoded.");
  if (!metadata.primary || !metadata.slug) return;
  const owner = OwnerIdentitySchema.parse({ type: "work-item", uid, name: metadata.slug });
  const primary = expandStoredPath(ownerPrimaryReference(owner, metadata), { registry: context.registry });
  return step.after.has(primary.path) ? owner : undefined;
}

async function hasTerminalLineage(context: RefBackendContext, basis: WithdrawalBasis, owner: OwnerIdentity): Promise<boolean> {
  const ref = "refs/arc/project/registry", tip = basis.state.get(ref);
  if (!tip || !("uid" in owner)) return false;
  const entries = (await readRefTrees(context, new Map([[ref, tip]]))).get(ref);
  if (!entries) throw new UnavailableWithdrawJournal(ref, "The registry tree required to establish a later terminal owner is unavailable.");
  const entry = entries.find(({ path }) => path === `lineage/${owner.uid}.json`);
  if (!entry) return false;
  const object = (await readBatchObjects(context, [entry.oid])).get(entry.oid);
  const lineage = object?.type === "blob" ? parseLineageRecord(new TextDecoder().decode(object.bytes)) : null;
  if (!lineage || lineage.origin.uid !== owner.uid) throw new UnavailableWithdrawJournal(ref, "The terminal owner's retained lineage cannot be decoded.");
  return lineage.kind !== "rename";
}

async function hasLaterRetirement(context: RefBackendContext, ref: string, tip: string, owner: OwnerIdentity,
  original: string, batches: ReadonlySet<string>): Promise<boolean> {
  const evidence = await readItemEndCandidates(context, tip, owner, "retirement");
  if (evidence.unavailable.size) throw new UnavailableWithdrawJournal(ref, "A tree required to establish the terminal owner's later retirement is unavailable.");
  for (const candidate of evidence.candidates) {
    if (candidate.commit !== original && !batches.has(candidate.batch)
      && await syncRefIsAncestor(context, original, candidate.commit)) return true;
  }
  return false;
}
