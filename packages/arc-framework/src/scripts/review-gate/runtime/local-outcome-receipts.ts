/** Local receipt publication through either the repository ledger or immutable outcome facts. */
import { canonicalize } from "../../../lib/kernel/index.js";
import { LocalReceiptStoreError } from "../hosts/local/receipt-store.js";
import { recordLocalReceiptConclusion } from "../lane-progress.js";
import { reviewOutcomeKey } from "../../../lib/store/kinds/review/outcome/key.js";
import type { ForwardReceiptLedger, ForwardReviewReceiptStore, ReviewOperationStateStore, ReviewOutcomePort } from "../core/ports.js";
import type { LocalReviewState } from "../core/operation-state-schema.js";
import type { ReviewReceiptV2 } from "../core/gate-contract-v2-schema.js";

/** Selected local receipt access and its admitted execution owner. */
export interface LocalReceiptPublicationContext {
  operationStore: ReviewOperationStateStore;
  receiptStore: ForwardReviewReceiptStore;
  outcomes?: ReviewOutcomePort;
}

/** Publish one exact receipt while retaining its full admission until the result is durable. */
export async function publishLocalReviewReceipt(context: LocalReceiptPublicationContext, input: {
  state: LocalReviewState; receipt: ReviewReceiptV2; expectedLedgerVersion: number; now: () => string;
}): Promise<{ ledgerVersion: number; durableEvidenceRef: string }> {
  if (context.outcomes === undefined) return context.receiptStore.appendReceipt(input.receipt, input.expectedLedgerVersion);
  const prior = await context.outcomes.read(input.state.operationId);
  if (prior !== null && (prior.value.local?.receipt === undefined
    || canonicalize(prior.value.local.receipt) !== canonicalize(input.receipt))) throw new LocalReceiptStoreError("conflicting-replay");
  await recordLocalReceiptConclusion(context.operationStore, { state: input.state, receipt: input.receipt, now: input.now() });
  const stored = await context.outcomes.read(input.state.operationId);
  if (stored === null || stored.value.local?.receipt === undefined) throw new Error("Native local receipt outcome is unavailable.");
  return { ledgerVersion: 0, durableEvidenceRef: reviewOutcomeKey(stored.value) };
}

/** Read terminal local receipts through the invocation's selected fact source. */
export async function readLocalReviewReceipts(context: Pick<LocalReceiptPublicationContext, "receiptStore" | "outcomes">,
  targetId: string): Promise<ForwardReceiptLedger> {
  if (context.outcomes === undefined) return context.receiptStore.readReceipts(targetId);
  const listing = await context.outcomes.list();
  if (listing.status !== "complete") throw new LocalReceiptStoreError(listing.reason);
  return { ledgerVersion: 0, receipts: listing.records.flatMap(({ value }) =>
    value.target.targetId === targetId && value.local?.receipt !== undefined ? [value.local.receipt] : []) };
}
