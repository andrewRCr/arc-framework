/** Commit a lifecycle withdrawal as one ordered-lock, compare-and-swap transaction. */

import { appendStoreCreationReceipt } from "../commit-creation-receipt.js";
import { randomUUID } from "node:crypto";
import { RecordReferenceSchema, type OwnerIdentity } from "../identity.js";
import { renderStoreCommitMessage } from "../commit-provenance.js";
import type { RefBackendContext } from "./context.js";
import type { RefMergeOptions, RefMergeResult } from "./sync-merge.js";
import { describeWithdrawJournal, UnavailableWithdrawJournal } from "./sync-withdraw-journal.js";
import { prepareWithdrawEnd, type WithdrawalBasis } from "./sync-withdraw-prepare.js";
import { withdrawGroupReference } from "./sync-withdraw-targets.js";
import type { RefTreeEntry } from "./batch-read.js";
import { readSyncRefs } from "./sync-graph.js";
import { withRefLocks } from "./write-locks.js";
import { commitRefStep } from "./commit-step.js";
import { readObjectFormat } from "./manifest.js";
import { writeRefTree } from "./tree-write.js";
import { updateRefTransaction, type RefChange } from "../../git/ref-transaction.js";
import type { PullNotice } from "../sync.js";
import { corruptRef } from "./namespace-health.js";
import { isArchiveRef } from "./archive-read.js";

/** One unpublished end whose record still stands beside another machine's published end. */
export interface WithdrawEnd { owner: OwnerIdentity; live: string; history: string; batch: string }

/** Invert original contributions together before merging surrounding writes into the published end. */
export async function commitWithdrawEnd(context: RefBackendContext, end: WithdrawEnd, held: ReadonlyMap<string, string>,
  state: ReadonlyMap<string, string>, incoming: ReadonlyMap<string, string>, options: RefMergeOptions): Promise<RefMergeResult> {
  const reference = RecordReferenceSchema.parse({ owner: end.owner, kind: end.owner.type === "cohort" ? "cohort/document" : "work-item/meta" }), batches = new Set([end.batch]);
  const journal = await describeWithdrawJournal(context, held, batches, reference, end.history);
  const watched = new Set([end.live, end.history, ...journal.map(({ ref }) => ref),
    ...journal.filter(({ ref }) => /^refs\/arc\/history\/(?:work|cohort)\//u.test(ref)).map(({ ref }) => ref.replace("refs/arc/history/", "refs/arc/")),
    ...held.has("refs/arc/project/registry") || state.has("refs/arc/project/registry") ? ["refs/arc/project/registry"] : [],
    ...journal.some(({ ref }) => /^refs\/arc\/history\/(?:work|cohort)\//u.test(ref) && ref !== end.history)
      ? [...state.keys()].filter(isArchiveRef) : []]);
  const basis: WithdrawalBasis = { end, held, state, incoming, reference, batches, journal };
  return withRefLocks({ ...context, lock: options.lock }, [...watched].map((ref) => options.targetRef?.(ref) ?? ref), async () => {
    const captured = await readSyncRefs(context, "refs/arc/");
    if ([...watched].some((ref) => captured.get(options.targetRef?.(ref) ?? ref) !== state.get(ref))) return { status: "restart" };
    // Prior reads may retain objects that disappeared before the lock was acquired. This hold starts fresh.
    const fresh = { ...context, batchReader: undefined, lifecycleEvidence: undefined, writeEvidence: { objects: new Map(), trees: new Map() } };
    const staged = { ...fresh, blobStage: { format: await readObjectFormat(fresh), blobs: new Map<string, Uint8Array>() } };
    try {
      const plan = await prepareWithdrawEnd(staged, basis);
      return await commitWithdrawal(staged, basis, plan, watched, options);
    } catch (error) {
      if (!(error instanceof UnavailableWithdrawJournal)) throw error;
      return heldWithdrawal(error, end);
    }
  });
}

async function commitWithdrawal(context: RefBackendContext, basis: WithdrawalBasis,
  plan: { targets: ReadonlyMap<string, string>; prepared: ReadonlyMap<string, ReadonlyMap<string, RefTreeEntry>> },
  watched: ReadonlySet<string>, options: RefMergeOptions): Promise<RefMergeResult> {
  const { end, state, reference } = basis, { targets, prepared } = plan;
  const batch = randomUUID(), identity = await context.identity(), actor = identity === null ? undefined : await context.actor(identity);
  const committed = await commitRefStep(context, async (physical) => {
    const changes: RefChange[] = [];
    for (const [ref, entries] of prepared) {
      const parent = state.get(ref), tree = await writeRefTree(physical, entries.values());
      const subject = await withdrawGroupReference(physical, ref, entries, reference);
      const message = appendStoreCreationReceipt(renderStoreCommitMessage({ verb: "sync", lifecycleAction: "withdraw-end" }, subject, batch, actor)
        + `Arc-Withdrawn-End: ${end.batch}\n`, { schemaVersion: 1, batchId: batch, createdOwners: [] });
      const { stdout } = await physical.exec("git", ["commit-tree", tree, ...parent ? ["-p", parent] : [], "-m", message], { cwd: context.checkoutRoot });
      const destination = targets.get(ref) ?? ref;
      changes.push({ ref: options.targetRef?.(destination) ?? destination, next: stdout.trim(), expected: state.get(destination) ?? null });
      if (destination !== ref && parent) changes.push({ ref: options.targetRef?.(ref) ?? ref, delete: true, expected: parent });
    }
    return { applied: changes, transaction: await updateRefTransaction(physical, changes, { cwd: context.checkoutRoot }) };
  }, options.commitMode);
  if (committed.status === "layout-changed" || committed.result.transaction.status === "lost-race") return { status: "restart" };
  const notices: PullNotice[] = [{ kind: "end-withdrawn", item: end.owner,
    condition: `The unpublished end ${end.batch} was withdrawn because another end published first.`,
    remedy: { text: "Review the published end and any retained late-write conflicts before making further lifecycle changes." } }];
  for (const change of committed.result.applied) if ("next" in change) {
    const canonical = [...watched].find((ref) => (options.targetRef?.(ref) ?? ref) === change.ref) ?? change.ref;
    await options.onApplied?.(context, canonical, state.get(canonical) ?? null, change.next, canonical === end.history ? notices : []);
  }
  return { status: "complete", changed: true, notices };
}

/** A ref whose tree no longer reads cannot be inverted: commit nothing, and withdraw once its objects are restored. */
function heldWithdrawal(error: UnavailableWithdrawJournal, end: WithdrawEnd): RefMergeResult {
  const refs = new Set([error.ref, end.live, end.history]);
  const { remedy } = corruptRef(error.ref, true);
  const notices: PullNotice[] = [...refs].map((ref) => ({ kind: "namespace-corrupt", ref, condition: error.message, remedy }));
  return { status: "complete", changed: false, notices };
}
