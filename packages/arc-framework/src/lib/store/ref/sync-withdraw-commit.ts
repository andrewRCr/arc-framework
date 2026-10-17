/** Commit a lifecycle withdrawal as one ordered-lock, compare-and-swap transaction. */

import { randomUUID } from "node:crypto";
import { RecordReferenceSchema, type OwnerIdentity } from "../identity.js";
import { renderStoreCommitMessage } from "../commit-provenance.js";
import type { RefBackendContext } from "./context.js";
import type { RefMergeOptions, RefMergeResult } from "./sync-merge.js";
import { readWithdrawJournal } from "./sync-withdraw-journal.js";
import { readEarlierWithdrawLineage } from "./sync-withdraw-earlier-lineage.js";
import { withdrawRefTargets, withdrawGroupReference } from "./sync-withdraw-targets.js";
import { inverseWithdrawStep } from "./sync-withdraw-inverse.js";
import { readRefTrees, type RefTreeEntry } from "./batch-read.js";
import { readSyncRefs } from "./sync-graph.js";
import { withRefLocks } from "./write-locks.js";
import { commitRefStep } from "./commit-step.js";
import { readObjectFormat } from "./manifest.js";
import { writeRefTree } from "./tree-write.js";
import { updateRefTransaction, type RefChange } from "../../git/ref-transaction.js";
import type { PullNotice } from "../sync.js";

/** One unpublished end whose record still stands beside another machine's published end. */
export interface WithdrawEnd { owner: OwnerIdentity; live: string; history: string; batch: string }

/** Invert original contributions together before merging surrounding writes into the published end. */
export async function commitWithdrawEnd(context: RefBackendContext, end: WithdrawEnd, held: ReadonlyMap<string, string>,
  state: ReadonlyMap<string, string>, incoming: ReadonlyMap<string, string>, options: RefMergeOptions): Promise<RefMergeResult> {
  const reference = RecordReferenceSchema.parse({ owner: end.owner, kind: end.owner.type === "cohort" ? "cohort/document" : "work-item/meta" }), batches = new Set([end.batch]);
  const journal = [...await readWithdrawJournal(context, held, batches, reference, end.history),
    ...await readEarlierWithdrawLineage(context, held, incoming, end)];
  if (!journal.length) throw new Error("An unpublished end has no original batch contributions");
  const targets = await withdrawRefTargets(context, journal, incoming, batches);
  const watched = new Set([...journal.map(({ ref }) => ref), ...targets.values()]);
  return withRefLocks({ ...context, lock: options.lock }, [...watched].map((ref) => options.targetRef?.(ref) ?? ref), async () => {
    const captured = await readSyncRefs(context, "refs/arc/");
    if ([...watched].some((ref) => captured.get(options.targetRef?.(ref) ?? ref) !== state.get(ref))) return { status: "restart" };
    const refs = new Set(journal.map(({ ref }) => ref));
    const selected = new Map([...state].filter(([ref]) => refs.has(ref)));
    const trees = selected.size ? await readRefTrees(context, selected) : new Map<string, RefTreeEntry[]>();
    const published = new Map([...incoming].filter(([ref]) => refs.has(ref)));
    const remoteTrees = published.size ? await readRefTrees(context, published) : new Map<string, RefTreeEntry[]>();
    const staged = { ...context, blobStage: { format: await readObjectFormat(context), blobs: new Map<string, Uint8Array>() } };
    const prepared = new Map<string, Map<string, RefTreeEntry>>();
    for (const step of journal) {
      const current = prepared.get(step.ref) ?? new Map((trees.get(step.ref) ?? []).map((entry) => [entry.path, entry]));
      prepared.set(step.ref, await inverseWithdrawStep(staged, step, current, batches, new Map((remoteTrees.get(step.ref) ?? []).map((entry) => [entry.path, entry]))));
    }
    const batch = randomUUID(), identity = await context.identity(), actor = identity === null ? undefined : await context.actor(identity);
    const committed = await commitRefStep(staged, async (physical) => {
      const changes: RefChange[] = [];
      for (const [ref, entries] of prepared) {
        const parent = state.get(ref), tree = await writeRefTree(physical, entries.values());
        const subject = await withdrawGroupReference(physical, ref, entries, reference);
        const message = renderStoreCommitMessage({ verb: "sync", lifecycleAction: "withdraw-end" }, subject, batch, actor)
          + `Arc-Withdrawn-End: ${end.batch}\n`;
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
  });
}
