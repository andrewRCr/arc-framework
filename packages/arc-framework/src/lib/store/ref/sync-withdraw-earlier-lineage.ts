/** Find an unpublished lineage created before the end that relied on it. */

import { RecordReferenceSchema } from "../identity.js";
import { parseStoreCommitProvenance } from "../commit-provenance.js";
import type { RefBackendContext } from "./context.js";
import type { WithdrawEnd } from "./sync-withdraw-commit.js";
import { lifecycleBatches } from "./sync-lifecycle.js";
import { readWithdrawJournal, type WithdrawJournalStep } from "./sync-withdraw-journal.js";

/** Include only the earlier lineage, preserving every other write from its original batch. */
export async function readEarlierWithdrawLineage(context: RefBackendContext, held: ReadonlyMap<string, string>,
  incoming: ReadonlyMap<string, string>, end: WithdrawEnd): Promise<WithdrawJournalStep[]> {
  const ref = "refs/arc/project/registry", tip = held.get(ref);
  if (!tip || end.owner.type !== "work-item" || !end.owner.uid) return [];
  const uid = end.owner.uid;
  const reference = RecordReferenceSchema.parse({ owner: end.owner, kind: "lineage/transition" });
  const { stdout } = await context.exec("git", ["log", "--first-parent", "-1", "--format=%B", tip,
    "--", `:(literal)lineage/${end.owner.uid}.json`], { cwd: context.checkoutRoot, objectAccess: "local-only" });
  const provenance = parseStoreCommitProvenance(stdout, reference);
  if (!("batchId" in provenance) || !provenance.batchId || provenance.batchId === end.batch) return [];
  if ((await lifecycleBatches(context, incoming.get(ref), end.owner)).has(provenance.batchId)) return [];
  const steps = await readWithdrawJournal(context, new Map([[ref, tip]]), new Set([provenance.batchId]), reference, end.history);
  return steps.map((step) => ({ ...step, lineageOnly: uid }));
}
