import { describe, expect, it } from "vitest";

import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import {
  FrontlineRunStateSchema,
  LocalReviewStateSchema,
  ReviewOperationStateSchema,
  ReviewSuspensionStateSchema,
  type ReviewOperationState,
} from "../../../../../src/scripts/review-gate/core/operation-state-schema.js";
import type { ReviewOperationStateStore } from "../../../../../src/scripts/review-gate/core/ports.js";

const digest = (value: string) => canonicalDigest({ value });

const frontline = {
  schemaVersion: 1 as const,
  semanticsVersion: "review-operation/v1" as const,
  operationId: "frontline-1",
  updatedAt: "2026-07-20T20:00:00Z",
  kind: "frontline-run" as const,
  targetId: digest("target"),
  sourceIdentity: "local-frontline",
  generation: 0,
  outcome: "findings" as const,
  passCount: 1,
  policyVersion: digest("policy"),
  sourceBindingId: digest("source-binding"),
};

const suspension = {
  schemaVersion: 1 as const,
  semanticsVersion: "review-operation/v1" as const,
  operationId: "suspension-1",
  updatedAt: "2026-07-20T20:00:00Z",
  kind: "review-suspension" as const,
  vehicle: { kind: "work-unit" as const, identity: "review-architecture" },
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

const localReview = {
  schemaVersion: 1 as const,
  semanticsVersion: "review-operation/v1" as const,
  operationId: "local-1",
  updatedAt: "2026-07-20T20:00:00Z",
  kind: "local-review" as const,
  vehicle: { kind: "work-unit" as const, identity: "review-surface-binding" },
  repositoryId: "repo-1",
  targetId: digest("target"),
  requestId: digest("request"),
  policyVersion: digest("policy"),
  policyBindingDigest: digest("binding"),
  attestationRuntimeKind: "delegated-agent",
  sourceRef: "refs/arc/review/local-1",
  sourceDigest: digest("source"),
  cleanupTtlMs: 86_400_000,
};

describe("review operation state schemas", () => {
  it("round-trips the immutable local-review operation and rejects missing or extra fields", () => {
    expect(LocalReviewStateSchema.parse(localReview)).toEqual(localReview);
    expect(() => LocalReviewStateSchema.parse({ ...localReview, sourceRef: undefined })).toThrow();
    expect(() => LocalReviewStateSchema.parse({ ...localReview, phase: "ready" })).toThrow();
  });

  it("accepts the new frontline terminal outcomes", () => {
    expect(FrontlineRunStateSchema.parse({ ...frontline, outcome: "timed-out" }).outcome).toBe("timed-out");
    expect(FrontlineRunStateSchema.parse({ ...frontline, outcome: "stale-target" }).outcome).toBe("stale-target");
  });

  it("discriminates all three registered operation variants", () => {
    const records: ReviewOperationState[] = [
      FrontlineRunStateSchema.parse(frontline),
      ReviewSuspensionStateSchema.parse(suspension),
      LocalReviewStateSchema.parse(localReview),
    ];
    expect(records.map((record) => record.kind)).toEqual(["frontline-run", "review-suspension", "local-review"]);
    expect(() => ReviewOperationStateSchema.parse({ ...frontline, kind: "controller-verdict" })).toThrow();
  });

  it("rejects evidence, approval, authorization, and unknown fields", () => {
    for (const forbidden of [
      { approval: { approvedBy: "maintainer" } },
      { receipt: { result: "clean" } },
      { fixAuthorization: digest("authorization") },
      { nextAction: "Resume review" },
    ]) {
      expect(() => ReviewOperationStateSchema.parse({ ...suspension, ...forbidden })).toThrow();
    }
  });

  it("crosses storage only through the injected versioned port", async () => {
    let state: ReviewOperationState | null = null;
    let version = 0;
    const store: ReviewOperationStateStore = {
      readOperation: async () => ({ version, state }),
      publishOperation: async (next, expectedVersion) => {
        if (expectedVersion !== version) throw new Error("operation-state-version-conflict");
        state = ReviewOperationStateSchema.parse(next);
        version += 1;
        return { version };
      },
    };
    await expect(store.publishOperation(frontline, 0)).resolves.toEqual({ version: 1 });
    await expect(store.readOperation("frontline-1")).resolves.toEqual({ version: 1, state: frontline });
  });
});
