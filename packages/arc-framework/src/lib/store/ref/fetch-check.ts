/** Interpret failed tracking updates by graph evidence rather than localized Git messages. */

import type { FetchOutcome } from "../../git/fetch.js";
import { updateRefTransaction } from "../../git/ref-transaction.js";
import type { PullNotice } from "../sync.js";
import type { RefBackendContext } from "./context.js";
import type { RefDesignation, RefRemoteDesignation } from "./designation.js";
import { readSyncRefs, syncRefIsAncestor } from "./sync-graph.js";
import { refFetchRewriteRemedy } from "./fetch-remedy.js";
import { checkSeenRefFetch, type RefFetchBasis } from "./fetch-seen.js";

/** A failed fast-forward update is a local tracking failure; other rejected updates are rewrites. */
export async function checkRefFetchUpdates(context: RefBackendContext, remote: RefRemoteDesignation,
  designation: RefDesignation, fetched: FetchOutcome, basis: RefFetchBasis, failed = false): Promise<PullNotice[]> {
  if (fetched.status !== "refs") return [];
  if (failed) await markUncommittedUpdates(context, remote.name, fetched);
  const { notices, blocked } = await checkSeenRefFetch(context, remote, designation, fetched, basis);
  for (const row of fetched.refs) {
    if (row.flag !== "!" || blocked.has(row.ref)) continue;
    const prefix = `refs/arc-remotes/${remote.name}/`;
    if (!row.ref.startsWith(prefix)) continue;
    const ref = `refs/arc/${row.ref.slice(prefix.length)}`;
    if (ref === "refs/arc/project/moved") {
      await updateRefTransaction(context, [{ ref: row.ref, next: row.next, expected: /^0+$/u.test(row.old) ? null : row.old }],
        { cwd: context.checkoutRoot });
      continue;
    }
    if (/^0+$/u.test(row.old) || /^0+$/u.test(row.next) || await syncRefIsAncestor(context, row.old, row.next)) {
      notices.push({ kind: "tracking-update-failed", ref,
        condition: `Git could not update ${row.ref} even though its fetched history does not diverge.`,
        remedy: { text: "Pull state again. If the update keeps failing, stop the holder or remove its stale Git ref lock, then retry." } });
    } else notices.push({ kind: "history-diverged", ref, local: row.old, remote: row.next,
      condition: `The fetched tip of ${ref} does not descend from the last head seen; its local and tracking tips were kept.`,
      remedy: await refFetchRewriteRemedy(context, remote, designation, ref, row.next) });
  }
  return notices;
}

async function markUncommittedUpdates(context: RefBackendContext, remote: string,
  fetched: Extract<FetchOutcome, { status: "refs" }>): Promise<void> {
  const prefix = `refs/arc-remotes/${remote}/`, current = await readSyncRefs(context, prefix);
  for (const row of fetched.refs) {
    if (!row.ref.startsWith(prefix) || row.flag === "!" || row.flag === "=") continue;
    const actual = current.get(row.ref);
    if (/^0+$/u.test(row.next)) { if (actual) row.flag = "!"; continue; }
    if (actual && (actual === row.next || await syncRefIsAncestor(context, row.next, actual))) continue;
    row.flag = "!";
  }
}
