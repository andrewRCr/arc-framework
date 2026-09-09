/** Behavioral ports around live local and frontline review records. */

import type { ReviewReceiptV2 } from "./gate-contract-v2-schema.js";
import type { ReviewOperationState } from "./operation-state-schema.js";
import type { LocalReviewSource } from "./local-review-source.js";
import type {
  ApprovedDispositionRecord,
  FrontlineOutcomeRecord,
} from "./advisory-records.js";
import type { ReviewReduceEnvelope } from "./review-command-envelope.js";
import type { ReviewResult } from "./review-result.js";

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

/** Read-only exact-reference and target-index access to the native local receipt ledger. */
export interface ForwardReviewReceiptIndex {
  readReceiptEntries(targetId: string): Promise<Array<{
    receipt: ReviewReceiptV2;
    durableEvidenceRef: string;
  }>>;
  readReceiptReference(reference: string): Promise<ReviewReceiptV2 | null>;
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

/** One strictly parsed record from an atomic operation-namespace snapshot. */
export interface ReviewOperationStateSnapshotRecord {
  readonly version: number;
  readonly state: ReviewOperationState;
}

/** Complete-or-typed-unavailable read of every operation record at one instant. */
export type ReviewOperationStateSnapshot =
  | { readonly status: "complete"; readonly records: readonly ReviewOperationStateSnapshotRecord[] }
  | { readonly status: "incomplete"; readonly reason: string }
  | { readonly status: "unavailable"; readonly reason: string };

/** Read-only enumeration boundary, separate from keyed operation mutation. */
export interface ReviewOperationStateSnapshotIndex {
  readOperationSnapshot(): Promise<ReviewOperationStateSnapshot>;
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
 * Separate from the keyed store because lineage settlement and cursorless delivery correction begin
 * from durable response authority rather than an operation identity. Enumeration returns only readable
 * records; each consumer must fail when required identity or uniqueness cannot be established. Keyed
 * reads remain strict for exact-record callers.
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

/** Source-neutral read boundary for one immutable terminal producer result. */
export interface ReviewResultReader {
  readResult(producerId: string): Promise<ReviewResult>;
}

/** Read-only reduction boundary over durable advisory review records. */
export interface ReviewReductionPort {
  reduce(operationId: string): Promise<ReviewReduceEnvelope>;
}
