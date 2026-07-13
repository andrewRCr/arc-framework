/** Bounded authenticated deletion events and their initial-schema receipts. */

import type { ReviewReceipt, ReviewRequest } from "./execution.js";
import type { ReviewReceiptStore } from "./ports.js";
import { parseReviewReceiptPayload, type TriggerDeletedPayload } from "./receipt-payload.js";
import { createReceipt } from "./request-key.js";

export type TriggerDeletionEvent = Omit<TriggerDeletedPayload, "kind"> & { schemaVersion: 1 };

/** Validate the bounded transport payload before it reaches receipt construction. */
export function parseTriggerDeletionEvent(input: unknown): TriggerDeletionEvent {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("trigger-deletion: expected an object");
  }
  const record = input as Record<string, unknown>;
  const { schemaVersion, ...fields } = record;
  const parsed = parseReviewReceiptPayload(
    { ...fields, kind: "trigger-deleted" },
    "trigger-deletion",
  );
  if (parsed.kind !== "trigger-deleted") throw new Error("trigger-deletion: invalid kind");
  if (schemaVersion !== 1) throw new Error("trigger-deletion.schemaVersion: expected 1");
  const { kind, ...payload } = parsed;
  void kind;
  return { schemaVersion: 1, ...payload };
}

/** Create one replay-stable deletion tombstone for a known request generation. */
export function createTriggerDeletionReceipt(input: {
  request: ReviewRequest;
  deletion: TriggerDeletionEvent;
  expectedLedgerVersion: number;
}): ReviewReceipt {
  const deletion: TriggerDeletedPayload = {
    kind: "trigger-deleted",
    commentId: input.deletion.commentId,
    actorIdentity: input.deletion.actorIdentity,
    priorBodyDigest: input.deletion.priorBodyDigest,
    deletedAt: input.deletion.deletedAt,
    observedHeadSha: input.deletion.observedHeadSha,
    providerIdentity: input.deletion.providerIdentity,
    triggerClassification: input.deletion.triggerClassification,
    authenticatedEventRef: input.deletion.authenticatedEventRef,
  };
  return createReceipt({
    eventId: `trigger-deleted:${input.deletion.commentId}`,
    previousLedgerVersion: input.expectedLedgerVersion,
    action: "trigger-deleted",
    request: input.request,
    result: null,
    reason: "authenticated trigger deletion",
    evidenceUrlOrId: input.deletion.authenticatedEventRef,
    findingIds: [],
    payload: deletion,
  });
}

export type TriggerDeletionAppendResult =
  | { status: "appended" | "adopted"; receiptHash: string }
  | { status: "no-matching-window"; receiptHash: null };

/** Append and canonically confirm a deletion before ordinary reconciliation re-queries provider state. */
export async function appendTriggerDeletionTombstone(input: {
  store: ReviewReceiptStore;
  changeRequestId: string;
  deletion: TriggerDeletionEvent;
}): Promise<TriggerDeletionAppendResult> {
  const ledger = await input.store.readLedger(input.changeRequestId);
  if (ledger.kind !== "valid") throw new Error("trigger-deletion: receipt ledger unavailable");
  const existing = ledger.receipts.find((envelope) => envelope.receipt.action === "trigger-deleted"
    && envelope.receipt.payload.kind === "trigger-deleted"
    && envelope.receipt.payload.commentId === input.deletion.commentId);
  if (existing !== undefined) return { status: "adopted", receiptHash: existing.receipt.receiptHash };
  const reservations = ledger.receipts
    .map((envelope) => envelope.receipt)
    .filter((receipt) => receipt.action === "reserved"
      && receipt.request.coverageThroughSha === input.deletion.observedHeadSha
      && (input.deletion.providerIdentity === "unknown"
        || receipt.request.sourceIdentity === input.deletion.providerIdentity))
    .sort((left, right) => right.request.generation - left.request.generation);
  const request = reservations[0]?.request;
  if (request === undefined) return { status: "no-matching-window", receiptHash: null };
  const receipt = createTriggerDeletionReceipt({
    request,
    deletion: { ...input.deletion, providerIdentity: request.sourceIdentity },
    expectedLedgerVersion: ledger.ledgerVersion,
  });
  await input.store.appendReceipt(receipt, ledger.ledgerVersion);
  const confirmed = await input.store.readLedger(input.changeRequestId);
  const durable = confirmed.kind === "valid"
    ? confirmed.receipts.find((envelope) => envelope.receipt.receiptHash === receipt.receiptHash)
    : undefined;
  if (durable === undefined) throw new Error("trigger-deletion: tombstone not durable after append");
  return { status: "appended", receiptHash: receipt.receiptHash };
}
