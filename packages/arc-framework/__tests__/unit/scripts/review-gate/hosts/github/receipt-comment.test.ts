import { describe, expect, it } from "vitest";

import { createReceipt, receiptIdentityValid } from "../../../../../../src/scripts/review-gate/core/request-key.js";
import type { ReviewReceipt, ReviewRequest } from "../../../../../../src/scripts/review-gate/core/execution.js";
import {
  parseReceiptComment,
  serializeReceiptComment,
  type ParseReceiptCommentInput,
} from "../../../../../../src/scripts/review-gate/hosts/github/receipt-comment.js";

const CREATED = "2026-07-10T10:00:00Z";

function request(): ReviewRequest {
  return {
    schemaVersion: 1,
    repositoryId: "100",
    changeRequestId: "PR_node",
    changeSetId: "a".repeat(64),
    policyVersion: "b".repeat(64),
    semanticsVersion: "review-gate/v1",
    rubricVersion: "independent-analysis/v1",
    requirementId: "analysis",
    sourceIdentity: "coderabbit",
    coverage: "full",
    coverageFromSha: "0".repeat(40),
    coverageThroughSha: "f".repeat(40),
    generation: 0,
    actorIdentity: "7",
    requestMechanism: "automatic",
    requiredActorIdentity: "7",
    requestCommand: null,
  };
}

function receipt(): ReviewReceipt {
  return createReceipt({
    eventId: "evt-1",
    previousLedgerVersion: 0,
    action: "reserved",
    request: request(),
    result: null,
    evidenceUrlOrId: null,
    findingIds: [],
    payload: { kind: "reservation", reservedAt: null, pendingProjectionRef: null },
  });
}

function parseInput(body: string, overrides: Partial<ParseReceiptCommentInput> = {}): ParseReceiptCommentInput {
  return {
    body,
    commentNodeId: "IC_1",
    createdAt: CREATED,
    updatedAt: CREATED,
    expectedRepositoryId: "100",
    expectedChangeRequestId: "PR_node",
    ...overrides,
  };
}

describe("receipt comment round-trip", () => {
  it("serializes and parses back to the same receipt and ledger position", () => {
    const original = receipt();
    const body = serializeReceiptComment({ ledgerVersion: 1, receipt: original });
    const result = parseReceiptComment(parseInput(body));
    if (result.kind !== "receipt") throw new Error(`expected receipt, got ${result.kind}`);
    expect(result.envelope.receipt).toEqual(original);
    expect(result.envelope.ledgerVersion).toBe(1);
    expect(result.envelope.durableRecordId).toBe("IC_1");
    expect(result.envelope.recordedAt).toBe(CREATED);
    expect(receiptIdentityValid(result.envelope.receipt)).toBe(true);
  });

  it("takes storage time from the host comment, exposing an edit as a time divergence", () => {
    const body = serializeReceiptComment({ ledgerVersion: 1, receipt: receipt() });
    const result = parseReceiptComment(parseInput(body, { updatedAt: "2026-07-10T12:00:00Z" }));
    if (result.kind !== "receipt") throw new Error("expected receipt");
    expect(result.envelope.recordedAt).not.toBe(result.envelope.lastModifiedAt);
  });
});

describe("receipt comment fail-closed parsing", () => {
  it("treats a comment without the marker as not a receipt", () => {
    expect(parseReceiptComment(parseInput("Just a normal PR comment."))).toEqual({ kind: "not-a-receipt" });
  });

  it("rejects malformed JSON", () => {
    const body = serializeReceiptComment({ ledgerVersion: 1, receipt: receipt() }).replace("{", "{ oops");
    expect(parseReceiptComment(parseInput(body))).toMatchObject({ kind: "invalid", reason: "malformed-json" });
  });

  it("rejects a truncated payload block", () => {
    const body = serializeReceiptComment({ ledgerVersion: 1, receipt: receipt() }).replace(/```\n\n<\/details>/u, "");
    expect(parseReceiptComment(parseInput(body))).toMatchObject({ kind: "invalid", reason: "missing-payload" });
  });

  it("rejects an oversized comment", () => {
    const body = serializeReceiptComment({ ledgerVersion: 1, receipt: receipt() });
    expect(parseReceiptComment(parseInput(body, { maxBytes: 100 }))).toEqual({ kind: "invalid", reason: "oversized" });
  });

  it("rejects a comment carrying more than one machine payload", () => {
    const body = `${serializeReceiptComment({ ledgerVersion: 1, receipt: receipt() })}\n\n\`\`\`json\n{"receipt":1}\n\`\`\`\n`;
    expect(parseReceiptComment(parseInput(body))).toEqual({ kind: "invalid", reason: "duplicate-payload" });
  });

  it("rejects a payload whose repository or change request is out of scope", () => {
    const body = serializeReceiptComment({ ledgerVersion: 1, receipt: receipt() });
    expect(parseReceiptComment(parseInput(body, { expectedRepositoryId: "999" }))).toMatchObject({
      kind: "invalid",
      reason: "scope-mismatch",
    });
  });

  it("rejects obsolete receipt shapes and unknown storage fields", () => {
    const body = serializeReceiptComment({ ledgerVersion: 1, receipt: receipt() });
    const obsolete = body.replace('"semanticsVersion":"review-gate/v1",', "");
    expect(parseReceiptComment(parseInput(obsolete))).toMatchObject({ kind: "invalid" });

    const extended = body.replace('{"ledgerVersion":1,', '{"ledgerVersion":1,"legacyVersion":1,');
    expect(parseReceiptComment(parseInput(extended))).toMatchObject({ kind: "invalid", reason: /unknown field/u });
  });
});
