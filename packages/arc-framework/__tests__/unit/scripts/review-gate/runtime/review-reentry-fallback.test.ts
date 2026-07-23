import { describe, expect, it, vi } from "vitest";

import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import type { ReviewSuspensionState } from "../../../../../src/scripts/review-gate/core/operation-state-schema.js";
import type { ReviewScheduledWakeupCapability } from "../../../../../src/scripts/review-gate/core/ports.js";
import type { ReviewReentryResult } from "../../../../../src/scripts/review-gate/core/review-reentry-schema.js";
import {
  armReviewWakeupFallback,
  humanReentryForTerminalWait,
  validateScheduledReviewWakeup,
} from "../../../../../src/scripts/review-gate/runtime/review-reentry-fallback.js";

const digest = (value: string): string => canonicalDigest({ value });
const suspension: ReviewSuspensionState = {
  schemaVersion: 1,
  semanticsVersion: "review-operation/v1",
  operationId: "suspension-review-architecture-1",
  updatedAt: "2026-07-20T20:00:00Z",
  kind: "review-suspension",
  vehicle: { kind: "work-unit", identity: "review-architecture" },
  repositoryId: "repo-1",
  changeRequestId: "pull/42",
  targetId: digest("target"),
  requestId: digest("request"),
  sourceIdentity: "codex-pr",
  generation: 1,
  policyVersion: digest("policy"),
  rubricVersion: "standard-review/v1",
  rubricDigest: digest("rubric"),
  deadlineAt: "2026-07-20T21:00:00Z",
  wakeupToken: digest("wakeup"),
};

const terminalResult = (state: "timed-out" | "provider-failed"): ReviewReentryResult => ({
  schemaVersion: 1,
  semanticsVersion: "review-reentry/v1",
  state,
  operationId: suspension.operationId,
  persistedVersion: 1,
  targetId: suspension.targetId,
  responsePlan: null,
  resumeText: state,
});

describe("scheduled and human review re-entry fallbacks", () => {
  it("arms a harness-native bounded wakeup with exact suspension facts", async () => {
    const schedule = vi.fn<ReviewScheduledWakeupCapability["schedule"]>(async () => ({
      status: "scheduled",
      wakeupRef: "harness:wakeup-1",
    }));

    await expect(armReviewWakeupFallback({ schedule }, suspension, "2026-07-20T20:15:00Z"))
      .resolves.toEqual({
        kind: "scheduled",
        scheduledFor: "2026-07-20T20:15:00Z",
        wakeupRef: "harness:wakeup-1",
      });
    expect(schedule).toHaveBeenCalledWith(expect.objectContaining({
      operationId: suspension.operationId,
      targetId: suspension.targetId,
      requestId: suspension.requestId,
      wakeupToken: suspension.wakeupToken,
      scheduledFor: "2026-07-20T20:15:00Z",
      deadlineAt: suspension.deadlineAt,
    }));
  });

  it("refuses a scheduled wakeup later than the suspension deadline", async () => {
    const schedule = vi.fn<ReviewScheduledWakeupCapability["schedule"]>();

    await expect(armReviewWakeupFallback({ schedule }, suspension, "2026-07-20T21:00:01Z"))
      .rejects.toThrow(/deadline/iu);
    expect(schedule).not.toHaveBeenCalled();
  });

  it("emits the exact human resume condition when scheduling is unavailable", async () => {
    await expect(armReviewWakeupFallback(null, suspension, "2026-07-20T20:15:00Z")).resolves.toEqual({
      kind: "human",
      reason: "scheduled-wakeup-unavailable",
      resumeWhen: "Resume when codex-pr changes review state, or by 2026-07-20T21:00:00Z.",
      resumeHow: "Re-enter ARC integration for work unit 'review-architecture' in repository 'repo-1'.",
    });
  });

  it("maps timeout and provider failure into the same explicit human re-entry state", () => {
    const timeout = humanReentryForTerminalWait(terminalResult("timed-out"), suspension);
    const failed = humanReentryForTerminalWait(terminalResult("provider-failed"), suspension);

    expect(timeout).toMatchObject({ kind: "human", reason: "review-timed-out" });
    expect(failed).toMatchObject({ kind: "human", reason: "provider-failed" });
    expect(timeout.resumeWhen).toBe(failed.resumeWhen);
    expect(timeout.resumeHow).toBe(failed.resumeHow);
  });

  it("accepts duplicate current wakeups idempotently and rejects stale scheduled actions", () => {
    const invocation = {
      operationId: suspension.operationId,
      targetId: suspension.targetId,
      requestId: suspension.requestId,
      generation: suspension.generation,
      wakeupToken: suspension.wakeupToken,
    };

    expect(validateScheduledReviewWakeup(invocation, suspension)).toEqual({ current: true });
    expect(validateScheduledReviewWakeup(invocation, suspension)).toEqual({ current: true });
    for (const stale of [
      { ...invocation, targetId: digest("new-target") },
      { ...invocation, generation: suspension.generation + 1 },
      { ...invocation, wakeupToken: digest("new-wakeup") },
    ]) {
      expect(validateScheduledReviewWakeup(stale, suspension)).toEqual({
        current: false,
        reason: "stale-wakeup",
      });
    }
  });
});
