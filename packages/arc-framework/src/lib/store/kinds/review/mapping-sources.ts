/** Decode original persistence envelopes for pure cross-source review joins. */
import { z } from "zod";
import { ReviewOperationStoreRecordSchema, FrontlineOutcomeStoreRecordSchema } from "../../../../scripts/review-gate/core/repository-record-schemas.js";
import { ForwardReceiptLedgerRecordSchema } from "../../../../scripts/review-gate/core/forward-receipt-ledger-schema.js";
import type { FrontlineOutcomeRecord } from "../../../../scripts/review-gate/core/advisory-records.js";
import type { ReviewOperationState, LocalReviewState } from "../../../../scripts/review-gate/core/operation-state-schema.js";
import type { ReviewReceiptV2 } from "../../../../scripts/review-gate/core/gate-contract-v2-schema.js";
import type { ReviewMappingSource } from "./mapping-listing.js";
import { mapReviewSource } from "./mapping-error.js";

const FrontlineIdentityHeaderSchema = FrontlineOutcomeStoreRecordSchema.extend({ record: z.object({
  operationId: FrontlineOutcomeStoreRecordSchema.shape.record.shape.operationId,
  repositoryId: FrontlineOutcomeStoreRecordSchema.shape.record.shape.repositoryId,
}) });

/** Legacy facts and identity headers indexed without filesystem or registry access. */
export interface ReviewMappingSources {
  discarded: Map<string, string>;
  operations: Map<string, ReviewOperationState>;
  operationVersions: Map<string, number>;
  frontline: Map<string, { operationId: string; value: unknown }>;
  receipts: { source: string; receipts: ReviewReceiptV2[] }[];
}

/** Decode JSON bytes from one supplied file. */
export function decodeReviewMappingSource(source: Extract<ReviewMappingSource, { kind: "gate" }>): unknown {
  return JSON.parse(new TextDecoder().decode(source.bytes)) as unknown;
}

function indexOperation(source: Extract<ReviewMappingSource, { kind: "gate" }>, projectId: string,
  index: ReviewMappingSources): void {
  const record = ReviewOperationStoreRecordSchema.parse(decodeReviewMappingSource(source));
  if (record.operationId !== record.state.operationId) throw new Error(`Operation identity mismatch: ${source.source}`);
  if (record.state.repositoryId === projectId) {
    index.operations.set(source.source, record.state);
    index.operationVersions.set(source.source, record.version);
  }
  else index.discarded.set(source.source, "Record names another repository ID.");
}

function indexFrontline(source: Extract<ReviewMappingSource, { kind: "gate" }>, projectId: string,
  index: ReviewMappingSources): void {
  const value = decodeReviewMappingSource(source);
  const record = FrontlineIdentityHeaderSchema.parse(value);
  if (record.operationId !== record.record.operationId) throw new Error(`Outcome identity mismatch: ${source.source}`);
  if (record.record.repositoryId === projectId) index.frontline.set(source.source, { operationId: record.operationId, value });
  else index.discarded.set(source.source, "Record names another repository ID.");
}

/** Decode the exact frontline outcome only when a live mapped attempt needs its payload. */
export function mappingFrontlineOutcome(sources: ReviewMappingSources, operationId: string): FrontlineOutcomeRecord {
  const matches = [...sources.frontline.values()].filter((record) => record.operationId === operationId);
  const match = matches[0];
  if (matches.length !== 1 || match === undefined) throw new Error(`Expected one frontline outcome for ${operationId}.`);
  return FrontlineOutcomeStoreRecordSchema.parse(match.value).record;
}

function indexReceipts(source: Extract<ReviewMappingSource, { kind: "gate" }>, projectId: string,
  index: ReviewMappingSources): void {
  const record = ForwardReceiptLedgerRecordSchema.parse(decodeReviewMappingSource(source));
  if (record.repositoryId === projectId) index.receipts.push({ source: source.source, receipts: record.receipts });
  else index.discarded.set(source.source, "Record names another repository ID.");
}

/** Gather join inputs from active source namespaces belonging to the adopted repository. */
export function indexReviewMappingSources(sources: readonly ReviewMappingSource[], projectId: string): ReviewMappingSources {
  const index: ReviewMappingSources = { discarded: new Map(), operations: new Map(), operationVersions: new Map(), frontline: new Map(), receipts: [] };
  for (const source of sources) {
    if (source.kind !== "gate" || !source.source.endsWith(".json")) continue;
    mapReviewSource(source.source, () => {
      if (source.source.startsWith("arc/review-gate/operations/")) indexOperation(source, projectId, index);
      else if (source.source.startsWith("arc/review-gate/outcomes/")) indexFrontline(source, projectId, index);
      else if (source.source === "arc/review-gate/evidence/receipts-v2.json") indexReceipts(source, projectId, index);
    });
  }
  return index;
}

/** Resolve exactly one original local operation; duplicates are ambiguous rather than guessed. */
export function mappingLocalOperation(sources: ReviewMappingSources, operationId: string): LocalReviewState {
  const matches = [...sources.operations.values()].filter((state): state is LocalReviewState =>
    state.kind === "local-review" && state.operationId === operationId);
  const match = matches[0];
  if (matches.length !== 1 || match === undefined) throw new Error(`Expected one local operation for ${operationId}; found ${matches.length}.`);
  return match;
}
