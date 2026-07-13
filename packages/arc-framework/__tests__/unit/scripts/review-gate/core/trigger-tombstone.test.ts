import { describe, expect, it } from "vitest";

import { parseReviewReceipt, type ReviewRequest } from "../../../../../src/scripts/review-gate/core/execution.js";
import {
  appendTriggerDeletionTombstone,
  createTriggerDeletionReceipt,
  parseTriggerDeletionEvent,
} from "../../../../../src/scripts/review-gate/core/trigger-tombstone.js";
import type { ReceiptEnvelope } from "../../../../../src/scripts/review-gate/core/execution.js";
import type { ReviewReceiptStore } from "../../../../../src/scripts/review-gate/core/ports.js";
import { createReceipt } from "../../../../../src/scripts/review-gate/core/request-key.js";
import { validateReceiptLedger } from "../../../../../src/scripts/review-gate/core/receipt-ledger.js";

const request: ReviewRequest = {
  schemaVersion: 1,
  repositoryId: "repo-1",
  changeRequestId: "change-7",
  changeSetId: "a".repeat(64),
  policyVersion: "b".repeat(64),
  semanticsVersion: "review-gate/v1",
  rubricVersion: "independent-analysis/v1",
  requirementId: "analysis",
  sourceIdentity: "codex-pr",
  coverage: "full",
  coverageFromSha: "c".repeat(40),
  coverageThroughSha: "d".repeat(40),
  generation: 0,
  actorIdentity: "app-bot",
  requestMechanism: "user-trigger",
  requiredActorIdentity: "author-1",
  requestCommand: "@codex review",
};

const deletion = {
  schemaVersion: 1 as const,
  commentId: "123",
  actorIdentity: "author-1",
  priorBodyDigest: "e".repeat(64),
  deletedAt: "2026-07-12T20:00:00.000Z",
  observedHeadSha: request.coverageThroughSha,
  providerIdentity: "codex-pr",
  triggerClassification: "provider-trigger" as const,
  authenticatedEventRef: "github-event:run-1:issue-comment-deleted:123",
};

describe("trigger deletion tombstones", () => {
  it("creates a strict initial-schema receipt with literal stable identities", () => {
    const receipt = createTriggerDeletionReceipt({ request, deletion, expectedLedgerVersion: 3 });

    expect(parseReviewReceipt(receipt)).toEqual(receipt);
    expect(receipt.idempotencyKey).toBe("e9dea871865af8f6252371e6d3512e9debbdc0668ea343183ba7c1c59851fa38");
    expect(receipt.receiptHash).toBe("d8f3ef4f88fa0ff5eb362192547d0af1eb7dc58fff29b5a2dbfc64f5185476fb");
  });

  it("accepts a tombstone only after its request reservation", () => {
    const reserved = createReceipt({
      eventId: "reserved", previousLedgerVersion: 0, action: "reserved", request,
      result: null, evidenceUrlOrId: null, findingIds: [],
      payload: { kind: "reservation", reservedAt: null, pendingProjectionRef: null },
    });
    const tombstone = createTriggerDeletionReceipt({ request, deletion, expectedLedgerVersion: 1 });
    const receipts = [reserved, tombstone];
    const envelopes = receipts.map((receipt, index) => ({
      schemaVersion: 1 as const,
      durableRecordId: `record-${index + 1}`,
      recordedAt: deletion.deletedAt,
      lastModifiedAt: deletion.deletedAt,
      ledgerVersion: index + 1,
      receipt,
    }));
    expect(validateReceiptLedger({ envelopes, anchorVersion: 2, anchorCount: 2 })).toMatchObject({ valid: true });
    expect(validateReceiptLedger({ envelopes: envelopes.slice(1), anchorVersion: 1, anchorCount: 1 }).valid).toBe(false);
  });

  it("rejects malformed, oversized, and head/provider-incongruent tombstones", () => {
    expect(() => parseTriggerDeletionEvent({ ...deletion, priorBodyDigest: "short" })).toThrow();
    expect(() => parseTriggerDeletionEvent({ ...deletion, authenticatedEventRef: "x".repeat(2_049) })).toThrow();
    const receipt = createTriggerDeletionReceipt({ request, deletion, expectedLedgerVersion: 3 });
    expect(() => parseReviewReceipt({
      ...receipt,
      payload: { ...receipt.payload, observedHeadSha: "f".repeat(40) },
    })).toThrow(/head mismatch/u);
  });

  it("appends before re-read and adopts exact replay without a second write", async () => {
    const reserved = createReceipt({
      eventId: "reserved", previousLedgerVersion: 0, action: "reserved", request,
      result: null, evidenceUrlOrId: null, findingIds: [],
      payload: { kind: "reservation", reservedAt: null, pendingProjectionRef: null },
    });
    const envelopes: ReceiptEnvelope[] = [{
      schemaVersion: 1,
      durableRecordId: "record-1",
      recordedAt: "2026-07-12T19:00:00.000Z",
      lastModifiedAt: "2026-07-12T19:00:00.000Z",
      ledgerVersion: 1,
      receipt: reserved,
    }];
    const order: string[] = [];
    const store: ReviewReceiptStore = {
      readLedger: async () => {
        order.push("read");
        return { kind: "valid", ledgerVersion: envelopes.length, receipts: envelopes };
      },
      appendReceipt: async (receipt, expectedLedgerVersion) => {
        order.push("append");
        expect(expectedLedgerVersion).toBe(envelopes.length);
        envelopes.push({
          schemaVersion: 1,
          durableRecordId: `record-${envelopes.length + 1}`,
          recordedAt: deletion.deletedAt,
          lastModifiedAt: deletion.deletedAt,
          ledgerVersion: envelopes.length + 1,
          receipt,
        });
        const durable = envelopes.at(-1);
        if (durable === undefined) throw new Error("missing appended envelope");
        return { ledgerVersion: envelopes.length, durableEvidenceRef: durable.durableRecordId };
      },
    };

    await expect(appendTriggerDeletionTombstone({ store, changeRequestId: "change-7", deletion }))
      .resolves.toMatchObject({ status: "appended" });
    await expect(appendTriggerDeletionTombstone({ store, changeRequestId: "change-7", deletion }))
      .resolves.toMatchObject({ status: "adopted" });
    expect(order).toEqual(["read", "append", "read", "read"]);
  });
});
