/** Validation and duplicate reduction for receipt-ledger envelopes. */

import type { ReceiptEnvelope, ReviewReceipt } from "./execution.js";
import { receiptIdentityValid } from "./request-key.js";

/** Inputs from paginated storage plus its stable anchor. */
export interface ReceiptLedgerInput {
  envelopes: ReceiptEnvelope[];
  anchorVersion: number;
  anchorCount: number;
}

/** Validated ledger or fail-closed diagnostics. */
export interface ReceiptLedgerResult {
  valid: boolean;
  ledgerVersion: number;
  receipts: ReviewReceipt[];
  errors: string[];
}

/** Validate hashes, linear versions, edits, duplicates, and anchor parity. */
export function validateReceiptLedger(input: ReceiptLedgerInput): ReceiptLedgerResult {
  const errors: string[] = [];
  const byVersion = new Map<number, ReceiptEnvelope>();
  const idempotencyVersions = new Map<string, number>();
  for (const envelope of input.envelopes) {
    if (envelope.recordedAt !== envelope.lastModifiedAt) errors.push(`edited-record:${envelope.durableRecordId}`);
    if (!receiptIdentityValid(envelope.receipt)) errors.push(`invalid-receipt-hash:${envelope.durableRecordId}`);
    const prior = byVersion.get(envelope.ledgerVersion);
    if (prior === undefined) {
      byVersion.set(envelope.ledgerVersion, envelope);
    } else if (
      prior.receipt.receiptHash !== envelope.receipt.receiptHash
      || prior.receipt.idempotencyKey !== envelope.receipt.idempotencyKey
    ) {
      errors.push(`divergent-ledger-version:${envelope.ledgerVersion}`);
    }
    const priorIdempotencyVersion = idempotencyVersions.get(envelope.receipt.idempotencyKey);
    if (priorIdempotencyVersion === undefined) {
      idempotencyVersions.set(envelope.receipt.idempotencyKey, envelope.ledgerVersion);
    } else if (priorIdempotencyVersion !== envelope.ledgerVersion) {
      errors.push(`replayed-idempotency-key:${envelope.receipt.idempotencyKey}`);
    }
  }

  const ordered = [...byVersion.values()].sort((left, right) => left.ledgerVersion - right.ledgerVersion);
  for (let index = 0; index < ordered.length; index += 1) {
    const expectedVersion = index + 1;
    const envelope = ordered[index];
    if (envelope?.ledgerVersion !== expectedVersion) errors.push(`missing-ledger-version:${expectedVersion}`);
    if (envelope?.receipt.previousLedgerVersion !== expectedVersion - 1) {
      errors.push(`forked-predecessor:${envelope?.ledgerVersion ?? expectedVersion}`);
    }
  }
  if (input.anchorVersion !== ordered.length) errors.push("anchor-version-mismatch");
  if (input.anchorCount !== ordered.length) errors.push("anchor-count-mismatch");
  return {
    valid: errors.length === 0,
    ledgerVersion: ordered.length,
    receipts: ordered.map((envelope) => envelope.receipt),
    errors,
  };
}
