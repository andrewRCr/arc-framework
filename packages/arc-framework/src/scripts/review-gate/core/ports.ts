/** Behavioral ports around live local and frontline review records. */

import type { ReviewReceiptV2 } from "./gate-contract-v2-schema.js";
import type { ReviewOperationState } from "./operation-state-schema.js";
import type { LocalReviewSource } from "./local-review-source.js";
import type {
  ApprovedDispositionRecord,
  FrontlineOutcomeRecord,
} from "./advisory-records.js";
import type { ReviewReduceEnvelope } from "./review-command-envelope.js";

/** Versioned forward receipt snapshot, optionally filtered to one target. */
export interface ForwardReceiptLedger {
  ledgerVersion: number;
  receipts: ReviewReceiptV2[];
}

/** Receipt persistence boundary for advisory local review. */
export interface ForwardReviewReceiptStore {
  readReceipts(targetId: string): Promise<ForwardReceiptLedger>;
  appendReceipt(
    receipt: ReviewReceiptV2,
    expectedLedgerVersion: number,
  ): Promise<{ ledgerVersion: number; durableEvidenceRef: string }>;
}

/** Versioned storage boundary for resumable, explicitly non-evidentiary review operations. */
export interface ReviewOperationStateStore {
  readOperation(operationId: string): Promise<{
    version: number;
    state: ReviewOperationState | null;
  }>;
  publishOperation(
    state: ReviewOperationState,
    expectedVersion: number,
  ): Promise<{ version: number }>;
}

/** Path-agnostic immutable source storage for local review materializations. */
export interface LocalReviewSourceStore {
  readSource(sourceRef: string): Promise<LocalReviewSource | null>;
  appendSource(source: LocalReviewSource): Promise<{ sourceRef: string }>;
}

/** Append-only approved-disposition storage keyed by the exact operation. */
export interface ApprovedDispositionRecordStore {
  readDispositionRecord(operationId: string): Promise<ApprovedDispositionRecord | null>;
  appendDispositionRecord(record: ApprovedDispositionRecord): Promise<{ dispositionRecordRef: string }>;
}

/**
 * Enumeration boundary for consumers holding a disposition-set identity rather than an operation.
 *
 * Separate from the keyed store because only the integration checkpoint needs it: its input is the
 * Candidate lineage, which records the approved set each response settled and not the operation
 * that produced it. Enumeration returns only readable records; the consumer must fail when a
 * disposition identity it requires is absent. Keyed reads remain strict for exact-record callers.
 */
export interface ApprovedDispositionRecordIndex {
  listDispositionRecords(): Promise<readonly ApprovedDispositionRecord[]>;
}

/** Version-checked durable frontline outcome storage. */
export interface FrontlineOutcomeStore {
  readOutcome(operationId: string): Promise<{
    version: number;
    record: FrontlineOutcomeRecord | null;
    outcomeRef: string | null;
  }>;
  appendOutcome(
    record: FrontlineOutcomeRecord,
    expectedVersion: number,
  ): Promise<{ version: number; outcomeRef: string }>;
}

/** Read-only reduction boundary over durable advisory review records. */
export interface ReviewReductionPort {
  reduce(operationId: string): Promise<ReviewReduceEnvelope>;
}
