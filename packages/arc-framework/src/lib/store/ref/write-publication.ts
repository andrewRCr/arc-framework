/** Publish the prepared record batch without retrying a changed history destination under its held lock. */
import { updateRefTransaction, type RefChange } from "../../git/ref-transaction.js";
import type { BatchResult } from "../write.js";
import type { StoreResult } from "../refusal.js";
import type { RefBackendContext } from "./context.js";
import { historyDestinationFailure } from "./write-history.js";

/** Ordinary contention retries; a live-to-history destination changed outside its lock requires repair. */
export async function publishRefBatchChanges(context: RefBackendContext, changes: readonly RefChange[],
  historyDestinations: ReadonlySet<string>, result: BatchResult): Promise<StoreResult<BatchResult> | "retry"> {
  if (!changes.length) return { status: "ok", result };
  const outcome = await updateRefTransaction(context, changes, { cwd: context.checkoutRoot });
  if (outcome.status === "committed") return { status: "ok", result };
  const history = outcome.refs.find(({ ref }) => historyDestinations.has(ref));
  return history ? { status: "refused", refusal: historyDestinationFailure(history.ref,
    `The locked history destination ${history.ref} changed during the write; the record transaction was not published.`) } : "retry";
}
