import { describe, expect, it, vi } from "vitest";

import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import { createReviewTarget } from "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import type { ReviewSuspensionState } from "../../../../../src/scripts/review-gate/core/operation-state-schema.js";
import type { ReviewOperationStateStore } from "../../../../../src/scripts/review-gate/core/ports.js";
import {
  resolveReviewReentry,
  type ReviewReentryObservation,
} from "../../../../../src/scripts/review-gate/runtime/review-reentry.js";

const objectId = (character: string): string => character.repeat(40);
const digest = (value: string): string => canonicalDigest({ value });

function target(head: string) {
  return createReviewTarget({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    kind: "change-set",
    repositoryId: "repo-1",
    baseRef: "main",
    diffBaseSha: objectId("a"),
    diffBaseTree: objectId("b"),
    headSha: objectId(head),
    headTree: objectId(head),
  });
}

const suspendedTarget = target("c");
const suspension: ReviewSuspensionState = {
  schemaVersion: 1,
  semanticsVersion: "review-operation/v1",
  operationId: "suspension-review-architecture-1",
  updatedAt: "2026-07-20T20:00:00Z",
  kind: "review-suspension",
  vehicle: { kind: "work-unit", identity: "review-architecture" },
  repositoryId: "repo-1",
  changeRequestId: "pull/42",
  targetId: suspendedTarget.targetId,
  requestId: digest("request"),
  sourceIdentity: "codex-pr",
  generation: 1,
  policyVersion: digest("policy"),
  rubricVersion: "standard-review/v1",
  rubricDigest: digest("rubric"),
  deadlineAt: "2026-07-20T21:00:00Z",
  wakeupToken: digest("wakeup"),
};

function memoryStore(initial: ReviewSuspensionState | null = suspension): ReviewOperationStateStore {
  let state = initial;
  let version = initial === null ? 0 : 1;
  return {
    readOperation: async () => ({ version, state }),
    publishOperation: async (next, expectedVersion) => {
      if (version !== expectedVersion) throw new Error("version-conflict");
      state = next.kind === "review-suspension" ? next : null;
      version += 1;
      return { version };
    },
  };
}

const observe = (observation: ReviewReentryObservation) => vi.fn(async () => observation);
const observation = (
  reviewState: ReviewReentryObservation["reviewState"],
  currentTarget = suspendedTarget,
  responseInput: unknown = null,
): ReviewReentryObservation => ({ currentTarget, reviewState, responseInput });

const responseInput = {
  currentTarget: suspendedTarget,
  findings: [{
    findingId: "finding-1",
    severity: "major" as const,
    locus: "src/index.ts:7",
    evidenceUrlOrId: "review:finding-1",
  }],
  routing: {
    schemaVersion: 1 as const,
    authorSelfReview: "required" as const,
    frontlineAction: "attempt" as const,
    standardReview: "required" as const,
    retrigger: "full-final" as const,
    assuranceMode: "terminal-aggregate" as const,
    reasons: ["sensitive-change-set" as const],
  },
  dispositionState: null,
  candidateTarget: null,
  persistedTargetId: null,
  verificationPassed: false,
  verificationRefs: [],
  capabilities: { approve: true, fix: true, persist: true, close: true, reroute: true },
  channel: "local" as const,
  conversations: [],
};

describe("durable review re-entry", () => {
  it("reconstructs an absent operation record before deriving a clean live result", async () => {
    const store = memoryStore(null);
    const observer = observe(observation("clean"));

    await expect(resolveReviewReentry(store, {
      suspension,
      observedAt: "2026-07-20T20:30:00Z",
    }, { observe: observer })).resolves.toMatchObject({
      state: "review-complete",
      persistedVersion: 1,
      responsePlan: null,
      resumeText: "Review completed cleanly for the current exact target.",
    });
    await expect(store.readOperation(suspension.operationId)).resolves.toEqual({ version: 1, state: suspension });
    expect(observer).toHaveBeenCalledOnce();
  });

  it("reroutes a stale exact head before interpreting the provider result", async () => {
    await expect(resolveReviewReentry(memoryStore(), {
      suspension,
      observedAt: "2026-07-20T20:30:00Z",
    }, { observe: observe(observation("clean", target("d"))) })).resolves.toMatchObject({
      state: "stale-target",
      responsePlan: null,
      resumeText: "The review target changed; recompute routing and request state from the current head.",
    });
  });

  it("derives the live response plan when findings arrive", async () => {
    await expect(resolveReviewReentry(memoryStore(), {
      suspension,
      observedAt: "2026-07-20T20:30:00Z",
    }, { observe: observe(observation("findings", suspendedTarget, responseInput)) })).resolves.toMatchObject({
      state: "respond-to-findings",
      responsePlan: { state: "awaiting-approval", allowedCapabilities: ["approve"] },
      resumeText: "Review findings require the freshly derived review-response action.",
    });
  });

  it("keeps a pending review suspended before its deadline", async () => {
    await expect(resolveReviewReentry(memoryStore(), {
      suspension,
      observedAt: "2026-07-20T20:30:00Z",
    }, { observe: observe(observation("pending")) })).resolves.toMatchObject({
      state: "suspended",
      resumeText: "Review remains pending; preserve Integrating state and re-enter by the declared deadline.",
    });
  });

  it("turns a bounded pending wait into an explicit timeout", async () => {
    await expect(resolveReviewReentry(memoryStore(), {
      suspension,
      observedAt: "2026-07-20T21:00:00Z",
    }, { observe: observe(observation("pending")) })).resolves.toMatchObject({
      state: "timed-out",
      responsePlan: null,
      resumeText: "Review wait reached its deadline; human re-entry is required.",
    });
  });

  it.each(["failed", "unavailable"] as const)("surfaces %s provider state without calling it clean", async (reviewState) => {
    await expect(resolveReviewReentry(memoryStore(), {
      suspension,
      observedAt: "2026-07-20T20:30:00Z",
    }, { observe: observe(observation(reviewState)) })).resolves.toMatchObject({
      state: "provider-failed",
      responsePlan: null,
    });
  });

  it("refuses an absent-record version conflict before reading live review state", async () => {
    const observer = observe(observation("clean"));
    const store = memoryStore(null);
    store.publishOperation = async () => { throw new Error("version-conflict"); };

    await expect(resolveReviewReentry(store, {
      suspension,
      observedAt: "2026-07-20T20:30:00Z",
    }, { observe: observer })).rejects.toThrow(/version-conflict/u);
    expect(observer).not.toHaveBeenCalled();
  });
});
