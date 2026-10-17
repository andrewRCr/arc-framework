/** Recover the exact before and after trees written by one unpublished lifecycle batch. */

import type { RecordReference } from "../identity.js";
import { parseStoreCommitProvenance } from "../commit-provenance.js";
import type { RefBackendContext } from "./context.js";
import { readRefTrees, type RefTreeEntry } from "./batch-read.js";
import { isManifestRef } from "./manifest.js";

/** One ref's complete contribution to the original batch, including its conflict commit. */
export interface WithdrawJournalStep {
  ref: string;
  lineageOnly?: string;
  before: Map<string, RefTreeEntry>;
  after: Map<string, RefTreeEntry>;
}

/** Read original writes from captured local tips, excluding unrelated item creations. */
export async function readWithdrawJournal(context: RefBackendContext, held: ReadonlyMap<string, string>,
  batches: ReadonlySet<string>, reference: RecordReference, origin: string): Promise<WithdrawJournalStep[]> {
  const steps: WithdrawJournalStep[] = [];
  for (const [ref, tip] of held) {
    if (!isManifestRef(ref) && !ref.startsWith("refs/arc/history/")) continue;
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
    const before = first.parents[0];
    const trees = await readRefTrees(context, new Map([["after", last.commit], ...before ? [["before", before] as const] : []]));
    const afterTree = trees.get("after"), beforeTree = before ? trees.get("before") : [];
    if (!afterTree || !beforeTree) throw new Error("An unpublished lifecycle batch has an unavailable original tree");
    steps.push({ ref, before: new Map(beforeTree.map((entry) => [entry.path, entry])),
      after: new Map(afterTree.map((entry) => [entry.path, entry])) });
  }
  return steps;
}
