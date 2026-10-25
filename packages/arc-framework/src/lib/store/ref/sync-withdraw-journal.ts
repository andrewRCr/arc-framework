/** Recover the exact before and after trees written by one unpublished lifecycle batch. */

import type { RecordReference } from "../identity.js";
import { parseStoreCommitProvenance } from "../commit-provenance.js";
import type { RefBackendContext } from "./context.js";
import { readRefTrees, type RefTreeEntry } from "./batch-read.js";
import { isStateRef } from "./manifest.js";

/** One ref's complete contribution to the original batch, including its conflict commit. */
export interface WithdrawJournalStep {
  ref: string;
  lineageOnly?: string;
  before: Map<string, RefTreeEntry>;
  after: Map<string, RefTreeEntry>;
}

/** Immutable commit coordinates can be discovered before holding the refs they will invert. */
export interface WithdrawJournalDescription { ref: string; before?: string; after: string }

/** Missing original evidence holds the entire end without swallowing unrelated read failures. */
export class UnavailableWithdrawJournal extends Error {
  constructor(readonly ref: string, message: string) { super(message); }
}

/** Read original writes from captured local tips, excluding unrelated item creations. */
export async function readWithdrawJournal(context: RefBackendContext, held: ReadonlyMap<string, string>,
  batches: ReadonlySet<string>, reference: RecordReference, origin: string): Promise<WithdrawJournalStep[]> {
  return materializeWithdrawJournal(context, await describeWithdrawJournal(context, held, batches, reference, origin));
}

/** Find original contributions without acquiring mutable object availability evidence. */
export async function describeWithdrawJournal(context: RefBackendContext, held: ReadonlyMap<string, string>,
  batches: ReadonlySet<string>, reference: RecordReference, origin: string): Promise<WithdrawJournalDescription[]> {
  const descriptions: WithdrawJournalDescription[] = [];
  for (const [ref, tip] of held) {
    if (!isStateRef(ref)) continue;
    if (/^refs\/arc\/(?:history\/)?work\//u.test(ref) && ref !== origin) continue;
    const { stdout } = await context.exec("git", ["log", "--first-parent", "--format=%H %P%n%B%x00", tip],
      { cwd: context.checkoutRoot, objectAccess: "local-only" });
    const rows = stdout.split("\0").flatMap((block) => {
      const [header = "", ...message] = block.trimStart().split("\n"), [commit, ...parents] = header.split(" ");
      const provenance = parseStoreCommitProvenance(message.join("\n"), reference);
      return commit && "batchId" in provenance && provenance.batchId && batches.has(provenance.batchId) ? [{ commit, parents }] : [];
    });
    const first = rows.at(-1), last = rows[0];
    if (!first || !last) continue;
    descriptions.push({ ref, before: first.parents[0], after: last.commit });
  }
  return descriptions;
}

/** Read every original tree only after the caller holds the complete withdrawal lock set. */
export async function materializeWithdrawJournal(context: RefBackendContext,
  descriptions: readonly WithdrawJournalDescription[]): Promise<WithdrawJournalStep[]> {
  const tips = new Map(descriptions.flatMap(({ before, after }) => [[after, after], ...before ? [[before, before]] : []] as [string, string][]));
  const trees = await readRefTrees(context, tips);
  return descriptions.map(({ ref, before, after }) => {
    const afterTree = trees.get(after), beforeTree = before ? trees.get(before) : [];
    if (!afterTree || !beforeTree) throw new UnavailableWithdrawJournal(ref, "An unpublished lifecycle batch has an unavailable original tree.");
    return { ref, before: new Map(beforeTree.map((entry) => [entry.path, entry])),
      after: new Map(afterTree.map((entry) => [entry.path, entry])) };
  });
}
