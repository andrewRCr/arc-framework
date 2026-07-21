import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import type { ReviewSuspensionState } from "../../../../../src/scripts/review-gate/core/operation-state-schema.js";
import type { ReviewWakeupCapability } from "../../../../../src/scripts/review-gate/core/ports.js";
import {
  armPreferredReviewWakeup,
} from "../../../../../src/scripts/review-gate/runtime/review-wakeup-capability.js";

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
  rubricVersion: "independent-analysis/v1",
  rubricDigest: digest("rubric"),
  deadlineAt: "2026-07-20T21:00:00Z",
  wakeupToken: digest("wakeup"),
};

describe("promoted review wakeup capability", () => {
  it("prefers an injected watcher and binds its arm request to the suspension token", async () => {
    const arm = vi.fn<ReviewWakeupCapability["arm"]>(async () => ({
      status: "armed",
      wakeupRef: "watcher:wakeup-1",
    }));

    await expect(armPreferredReviewWakeup({ arm }, suspension)).resolves.toEqual({
      kind: "watcher",
      wakeupRef: "watcher:wakeup-1",
    });
    expect(arm).toHaveBeenCalledWith({
      operationId: suspension.operationId,
      vehicle: suspension.vehicle,
      repositoryId: suspension.repositoryId,
      changeRequestId: suspension.changeRequestId,
      targetId: suspension.targetId,
      requestId: suspension.requestId,
      sourceIdentity: suspension.sourceIdentity,
      generation: suspension.generation,
      deadlineAt: suspension.deadlineAt,
      wakeupToken: suspension.wakeupToken,
    });
  });

  it("treats watcher absence as an ordinary fallback without inventing provider state", async () => {
    await expect(armPreferredReviewWakeup(null, suspension)).resolves.toEqual({
      kind: "fallback",
      reason: "promoted-watcher-unavailable",
    });
  });

  it("does not couple the capability seam to the current controller wakeup runtime", () => {
    const packageRoot = resolve(import.meta.dirname, "../../../../..");
    const source = readFileSync(
      resolve(packageRoot, "src/scripts/review-gate/runtime/review-wakeup-capability.ts"),
      "utf8",
    );

    expect(source).not.toMatch(/from ["']\.\/wakeup\.js["']/u);
    expect(source).not.toMatch(/SELF_HOSTING_REVIEW_GATE|runAwaitMain|normalizeWakeup/u);
  });
});
