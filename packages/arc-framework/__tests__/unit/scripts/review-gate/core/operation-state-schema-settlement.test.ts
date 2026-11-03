import { describe, expect, it } from "vitest";
import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import { HostedSettlementEvidenceSchema, LaneAttemptSchema, validateHostedDispositionSetSettlement } from
  "../../../../../src/scripts/review-gate/core/operation-state-schema.js";

import { hostedOutcome } from "../../../../fixtures/review-outcome.js";

const dispositionSetId = canonicalDigest({ set: 1 });
const otherSet = canonicalDigest({ set: 2 });
const action = { findingId: "finding-1", disposition: "defer" as const, channelAction: "record-only" as const };
const evidence = HostedSettlementEvidenceSchema.parse({ ...action, dispositionSetId,
  performedAt: "2026-10-19T13:00:00Z", carriedFromDispositionSetId: null });
const valid = { dispositionSetId, predecessorDispositionSetId: null, findingActions: [action], evidence: [evidence] };

describe("per-set hosted settlement", () => {
  it.each([
    { ...valid, findingActions: [action, action] },
    { ...valid, evidence: [evidence, evidence] },
    { ...valid, evidence: [{ ...evidence, dispositionSetId: otherSet }] },
    { ...valid, evidence: [{ ...evidence, findingId: "unknown-finding" }] },
    { ...valid, evidence: [{ ...evidence, disposition: "reject" as const }] },
    { ...valid, findingActions: [{ ...action, channelAction: "reply-and-resolve" as const }] },
    { ...valid, evidence: [{ ...evidence, carriedFromDispositionSetId: otherSet }] },
  ])("refuses duplicate or unbound settlement facts", (input) => {
    expect(validateHostedDispositionSetSettlement(input).length).toBeGreaterThan(0);
    expect(validateHostedDispositionSetSettlement(valid)).toEqual([]);
  });
  it("admits settlement carried from the direct predecessor", () => {
    expect(validateHostedDispositionSetSettlement({ ...valid, predecessorDispositionSetId: otherSet,
      evidence: [{ ...evidence, carriedFromDispositionSetId: otherSet }] })).toEqual([]);
  });

  it("keeps aggregate settlement with an unknown set refused after per-set grouping", () => {
    const outcome = hostedOutcome({ outcome: "findings", findings: [{ findingId: "finding-1", sourceOrdinal: 1,
      severity: "major", origin: "review-body", reviewId: "review-1", fingerprint: "finding-1", settlement: "not-applicable",
      locus: "src/main.ts:1", url: "https://example.invalid/review", body: "A retained review-body finding." }] });
    const hosted = { ...outcome.hosted, dispositionSetId, settledFindingIds: ["finding-1"],
      dispositionSetLineage: [{ dispositionSetId, predecessorDispositionSetId: null, successorDispositionSetId: null,
        findingActions: [action] }], settlementEvidence: [evidence] };
    const schema = LaneAttemptSchema.shape.hosted.unwrap();
    expect(schema.safeParse(hosted).success).toBe(true);
    expect(schema.safeParse({ ...hosted,
      settlementEvidence: [evidence, { ...evidence, dispositionSetId: otherSet }] }).success).toBe(false);
  });
});
