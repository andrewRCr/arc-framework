/** Bound response source and settlement checks for pre-publication continuation. */

import { describe, expect, it } from "vitest";

import { parseReviewSourceReference } from
  "../../../../../src/scripts/review-gate/core/review-source-reference.js";
import { currentDispositionSettled, projectPendingResponseSource } from
  "../../../../../src/scripts/review-gate/policy/pre-publication-request.js";
import type { LanePolicyAttempt } from
  "../../../../../src/scripts/review-gate/lane-progress.js";

describe("pre-publication pending response source", () => {
  it("keeps a superseding no-fix disposition pending until that exact set settles", () => {
    const result = { kind: "attested-local" as const, producerId: "local-1", receiptRef: "receipt-1" };
    const attempt: LanePolicyAttempt = {
      attemptId: "local-1",
      logicalPass: 1,
      sourceId: "delegated-agent",
      outcome: "settled-findings",
      responsePerformance: {
        schemaVersion: 1,
        producerId: "local-1",
        dispositionSetId: `sha256:${"1".repeat(64)}`,
        originatingHeadSha: "a".repeat(40),
        producedHeadSha: "a".repeat(40),
        performedAt: "2026-09-25T12:00:00.000Z",
      },
    };
    const successorId = `sha256:${"2".repeat(64)}`;
    const priorSettlement = currentDispositionSettled(result, attempt, successorId, false);
    expect(priorSettlement).toBe(false);
    expect(projectPendingResponseSource(result, "performed", priorSettlement)).toMatchObject({
      kind: "attested-local",
    });
    const originalPerformance = attempt.responsePerformance;
    if (originalPerformance === undefined) throw new Error("expected prior response performance");
    const successorAttempt: LanePolicyAttempt = {
      ...attempt,
      responsePerformance: { ...originalPerformance, dispositionSetId: successorId },
    };
    expect(currentDispositionSettled(result, successorAttempt, successorId, true)).toBe(false);
    const settled = currentDispositionSettled(result, successorAttempt, successorId, false);
    expect(settled).toBe(true);
    expect(projectPendingResponseSource(result, "performed", settled)).toBeNull();
  });

  it("rejects a hosted predecessor settlement until its successor binding is current", () => {
    const result = { kind: "hosted" as const, producerId: "attempt-1" };
    const prior = {
      attemptId: "attempt-1", logicalPass: 1, sourceId: "codex-pr", outcome: "settled-findings",
      hosted: { dispositionSetId: `sha256:${"1".repeat(64)}` },
    } as LanePolicyAttempt;
    const successorId = `sha256:${"2".repeat(64)}`;
    expect(currentDispositionSettled(result, prior, successorId, false)).toBe(false);
    expect(currentDispositionSettled(result, {
      ...prior,
      hosted: { ...prior.hosted, dispositionSetId: successorId },
    } as LanePolicyAttempt, successorId, false)).toBe(true);
  });

  it("keeps an approved no-fix response pending until its exact lane attempt settles", () => {
    const result = { kind: "attested-local" as const, producerId: "local-1", receiptRef: "receipt-1" };
    const pending = projectPendingResponseSource(result, "performed", false);
    expect(pending?.kind).toBe("attested-local");
    if (pending?.kind !== "attested-local") throw new Error("expected local response source");
    expect(parseReviewSourceReference(pending.receiptRef, "attested-local")).toEqual({
      kind: "attested-local", operationId: "local-1", durableRef: "receipt-1",
    });
    expect(projectPendingResponseSource(result, "performed", true)).toBeNull();
    expect(projectPendingResponseSource(result, "incomplete", true)).toEqual(pending);
  });

  it("retains the original frontline and hosted producer across an unsettled response", () => {
    const frontline = { kind: "frontline" as const, producerId: "frontline-1", outcomeRef: "outcome-1" };
    const hosted = { kind: "hosted" as const, producerId: "attempt-1", laneOperationId: "lane-1" };
    const frontlineSource = projectPendingResponseSource(frontline, "performed", false);
    const hostedSource = projectPendingResponseSource(hosted, "performed", false);
    expect(frontlineSource?.kind).toBe("frontline");
    expect(hostedSource?.kind).toBe("hosted");
    if (frontlineSource?.kind !== "frontline" || hostedSource?.kind !== "hosted") {
      throw new Error("expected bound response sources");
    }
    expect(parseReviewSourceReference(frontlineSource.outcomeRef, "frontline")).toEqual({
      kind: "frontline", operationId: "frontline-1", durableRef: "outcome-1",
    });
    expect(parseReviewSourceReference(hostedSource.attemptRef, "hosted")).toEqual({
      kind: "hosted", operationId: "lane-1", durableRef: "attempt-1",
    });
    expect(projectPendingResponseSource(hosted, "performed", true)).toBeNull();
  });
});
