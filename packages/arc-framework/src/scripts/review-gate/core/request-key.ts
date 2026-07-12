/** Canonical hierarchical request and receipt identities. */

import { hashContent } from "../../../lib/manifest/hash.js";
import type { ReviewReceipt, ReviewRequest } from "./execution.js";
import { canonicalizePlainJson } from "./identity.js";

/** Receipt fields supplied before derived identities are added. */
export type ReceiptCreationInput = Omit<
  ReviewReceipt,
  "schemaVersion" | "idempotencyKey" | "receiptHash" | "reason"
> & { reason?: string | null };

/** Compute the requirement-level key shared by source requests. */
export function computeRequirementKey(request: ReviewRequest): string {
  return hashContent([
    request.repositoryId,
    request.changeRequestId,
    request.changeSetId,
    request.policyVersion,
    request.semanticsVersion,
    request.rubricVersion,
    request.requirementId,
  ].join("\0"));
}

/** Compute the source/coverage/generation-specific request key. */
export function computeRequestKey(request: ReviewRequest): string {
  return hashContent([
    computeRequirementKey(request),
    request.sourceIdentity,
    request.coverage,
    request.coverageFromSha,
    request.coverageThroughSha,
    String(request.generation),
    request.requestMechanism,
    request.requiredActorIdentity,
    request.requestCommand ?? "",
  ].join("\0"));
}

function computeIdempotencyKey(input: ReceiptCreationInput): string {
  return hashContent(canonicalizePlainJson({
    requestKey: computeRequestKey(input.request),
    action: input.action,
    ...(["required", "waived"].includes(input.action) ? { eventId: input.eventId } : {}),
    result: input.result,
    reason: input.reason ?? null,
    evidenceUrlOrId: input.evidenceUrlOrId,
    findingIds: input.findingIds,
    payload: input.payload,
    ...(input.evidence === undefined ? {} : { evidence: input.evidence }),
  }));
}

function computeReceiptHash(receipt: Omit<ReviewReceipt, "receiptHash">): string {
  return hashContent(canonicalizePlainJson(receipt));
}

/** Create a receipt with replay-stable idempotency and predecessor-bound hash. */
export function createReceipt(input: ReceiptCreationInput): ReviewReceipt {
  const withoutHash: Omit<ReviewReceipt, "receiptHash"> = {
    schemaVersion: 1,
    eventId: input.eventId,
    idempotencyKey: computeIdempotencyKey(input),
    previousLedgerVersion: input.previousLedgerVersion,
    action: input.action,
    request: input.request,
    result: input.result,
    reason: input.reason ?? null,
    evidenceUrlOrId: input.evidenceUrlOrId,
    findingIds: input.findingIds,
    payload: input.payload,
    ...(input.evidence === undefined ? {} : { evidence: input.evidence }),
  };
  return { ...withoutHash, receiptHash: computeReceiptHash(withoutHash) };
}

/** Verify both derived identities on a received receipt. */
export function receiptIdentityValid(receipt: ReviewReceipt): boolean {
  const expected = createReceipt({
    eventId: receipt.eventId,
    previousLedgerVersion: receipt.previousLedgerVersion,
    action: receipt.action,
    request: receipt.request,
    result: receipt.result,
    reason: receipt.reason,
    evidenceUrlOrId: receipt.evidenceUrlOrId,
    findingIds: receipt.findingIds,
    payload: receipt.payload,
    ...(receipt.evidence === undefined ? {} : { evidence: receipt.evidence }),
  });
  return receipt.idempotencyKey === expected.idempotencyKey && receipt.receiptHash === expected.receiptHash;
}
