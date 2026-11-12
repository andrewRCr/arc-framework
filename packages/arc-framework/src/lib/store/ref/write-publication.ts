/** Publish the prepared record batch and rebuild after outside-writer contention. */
import type { RefChange } from "../../git/ref-transaction.js";
import { updateStoreRefTransaction } from "./ref-transaction.js";
import type { BatchResult } from "../write.js";
import type { StoreResult } from "../refusal.js";
import type { RefBackendContext } from "./context.js";
import type { RefWriteRetry } from "./write-retry.js";

/** A lost expected value requires rebuilding the complete batch from fresh tips. */
export async function publishRefBatchChanges(context: RefBackendContext, changes: readonly RefChange[],
  destinations: ReadonlyMap<string, string | null>, result: BatchResult): Promise<StoreResult<BatchResult> | RefWriteRetry> {
  if (!changes.length) return { status: "ok", result };
  const outcome = await updateStoreRefTransaction(context, changes, { cwd: context.checkoutRoot });
  if (outcome.status === "committed") return { status: "ok", result };
  return { status: "retry", destinations,
    observed: new Map(outcome.refs.filter(({ ref }) => destinations.has(ref)).map(({ ref, actual }) => [ref, actual])) };
}
