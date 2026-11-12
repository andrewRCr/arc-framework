/** The hosted pre-effect guard admits only an exact, independently proved response-head continuation. */

import { describe, expect, it } from "vitest";
import { hostedFixSettlementPerformed } from "../../../src/handlers/review.js";

const fixHead = "b".repeat(40);
const recordHead = "c".repeat(40);
const performance = { schemaVersion: 1 as const, producerId: "producer",
  dispositionSetId: `sha256:${"d".repeat(64)}` as const, originatingHeadSha: "a".repeat(40),
  producedHeadSha: fixHead, performedAt: "2026-10-03T12:00:00Z" };
const input = { attemptId: performance.producerId, originatingHeadSha: performance.originatingHeadSha,
  dispositionSetId: performance.dispositionSetId, producedHeadSha: recordHead, responsePerformance: performance,
  confirmedContinuation: { fromHeadSha: fixHead, toHeadSha: recordHead } };

describe("hosted response record-head guard", () => {
  it("accepts the current record head while leaving the verified performance unchanged", () => {
    expect(hostedFixSettlementPerformed(input)).toBe(true);
    expect(performance.producedHeadSha).toBe(fixHead);
  });

  it("refuses absent, foreign, and wrong-endpoint proof", () => {
    expect(() => hostedFixSettlementPerformed({ ...input, confirmedContinuation: undefined }))
      .toThrow("durable response-performance evidence");
    expect(() => hostedFixSettlementPerformed({ ...input, attemptId: "foreign" }))
      .toThrow("durable response-performance evidence");
    expect(() => hostedFixSettlementPerformed({ ...input, confirmedContinuation: {
      fromHeadSha: recordHead, toHeadSha: recordHead } })).toThrow("durable response-performance evidence");
    expect(() => hostedFixSettlementPerformed({ ...input, confirmedContinuation: {
      fromHeadSha: fixHead, toHeadSha: fixHead } })).toThrow("durable response-performance evidence");
  });
});
