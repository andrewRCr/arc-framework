import { describe, expect, it } from "vitest";

import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import {
  createReviewRequest,
  createReviewTarget,
  validateReviewRequest,
  validateReviewTarget,
} from "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";

const objectId = (character: string): string => character.repeat(40);

describe("review gate v2 target and request", () => {
  it("derives one exact change-set target from its registered preimage", () => {
    const target = createReviewTarget({
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      kind: "change-set",
      repositoryId: "repo-1",
      baseRef: "main",
      diffBaseSha: objectId("a"),
      diffBaseTree: objectId("b"),
      headSha: objectId("c"),
      headTree: objectId("d"),
    });

    expect(target).toEqual({
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      kind: "change-set",
      targetId: canonicalDigest({
        domain: "arc.review-gate.target-id/v2",
        schemaVersion: 2,
        semanticsVersion: "review-gate/v2",
        kind: "change-set",
        repositoryId: "repo-1",
        baseRef: "main",
        diffBaseSha: objectId("a"),
        diffBaseTree: objectId("b"),
        headSha: objectId("c"),
        headTree: objectId("d"),
      }),
      repositoryId: "repo-1",
      baseRef: "main",
      diffBaseSha: objectId("a"),
      diffBaseTree: objectId("b"),
      headSha: objectId("c"),
      headTree: objectId("d"),
    });
  });

  it("derives one actor-separated request for one hosted carrier", () => {
    const target = createReviewTarget({
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      kind: "change-set",
      repositoryId: "repo-1",
      baseRef: "main",
      diffBaseSha: objectId("a"),
      diffBaseTree: objectId("b"),
      headSha: objectId("c"),
      headTree: objectId("d"),
    });
    const requirementId = canonicalDigest({ requirement: "independent-analysis" });
    const request = createReviewRequest(target, {
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      repositoryId: target.repositoryId,
      targetId: target.targetId,
      requirementId,
      carrier: {
        kind: "change-request",
        adapterId: "github",
        changeRequestId: "pull/42",
      },
      authorIdentity: "andrew",
      evaluatorIdentity: "reviewer-1",
      generation: 0,
      requestMechanism: "automatic",
    });

    expect(request.requestId).toBe(canonicalDigest({
      domain: "arc.review-gate.request-id/v2",
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      repositoryId: "repo-1",
      targetId: target.targetId,
      requirementId,
      carrier: {
        kind: "change-request",
        adapterId: "github",
        changeRequestId: "pull/42",
      },
      authorIdentity: "andrew",
      evaluatorIdentity: "reviewer-1",
      generation: 0,
      requestMechanism: "automatic",
    }));
    expect(request.targetId).toBe(target.targetId);
    expect(request.requirementId).toBe(requirementId);
  });

  it("keeps semantic IDs canonical while Git object IDs remain bare", () => {
    const target = createReviewTarget({
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      kind: "change-set",
      repositoryId: "repo-1",
      baseRef: "main",
      diffBaseSha: objectId("a"),
      diffBaseTree: objectId("b"),
      headSha: objectId("c"),
      headTree: objectId("d"),
    });

    expect(target.targetId).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(target.headSha).toMatch(/^[0-9a-f]{40}$/u);
    expect(() => createReviewTarget({
      ...target,
      headSha: `sha256:${target.headSha}`,
    })).toThrow();
    expect(() => createReviewRequest(target, {
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      repositoryId: target.repositoryId,
      targetId: target.targetId,
      requirementId: objectId("e"),
      carrier: { kind: "local-change-set", adapterId: "local", changeRequestId: null },
      authorIdentity: "andrew",
      evaluatorIdentity: "reviewer-1",
      generation: 0,
      requestMechanism: "automatic",
    })).toThrow();
  });

  it("rejects invalid binding, hosted identity, actor, and envelope shapes", () => {
    const target = createReviewTarget({
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      kind: "change-set",
      repositoryId: "repo-1",
      baseRef: "main",
      diffBaseSha: objectId("a"),
      diffBaseTree: objectId("b"),
      headSha: objectId("c"),
      headTree: objectId("d"),
    });
    const base = {
      schemaVersion: 2 as const,
      semanticsVersion: "review-gate/v2" as const,
      repositoryId: target.repositoryId,
      targetId: target.targetId,
      requirementId: canonicalDigest({ requirement: "analysis" }),
      carrier: { kind: "change-request" as const, adapterId: "github", changeRequestId: "pull/42" },
      authorIdentity: "andrew",
      evaluatorIdentity: "reviewer-1",
      generation: 0,
      requestMechanism: "automatic",
    };

    expect(() => createReviewRequest(target, { ...base, repositoryId: "repo-2" })).toThrow(/repository/u);
    expect(() => createReviewRequest(target, { ...base, targetId: canonicalDigest({ target: "other" }) }))
      .toThrow(/target/u);
    expect(() => createReviewRequest(target, { ...base, evaluatorIdentity: "andrew" })).toThrow(/differ/u);
    expect(() => createReviewRequest(target, {
      ...base,
      carrier: { kind: "change-request", adapterId: "github", changeRequestId: null },
    } as unknown as Parameters<typeof createReviewRequest>[1])).toThrow();
    expect(() => createReviewRequest(target, {
      ...base,
      ambientObservation: "ignored",
    } as Parameters<typeof createReviewRequest>[1])).toThrow(/unrecognized key/iu);
  });

  it("rejects target and carrier retargeting without a newly derived ID", () => {
    const target = createReviewTarget({
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      kind: "change-set",
      repositoryId: "repo-1",
      baseRef: "main",
      diffBaseSha: objectId("a"),
      diffBaseTree: objectId("b"),
      headSha: objectId("c"),
      headTree: objectId("d"),
    });
    const request = createReviewRequest(target, {
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      repositoryId: target.repositoryId,
      targetId: target.targetId,
      requirementId: canonicalDigest({ requirement: "analysis" }),
      carrier: { kind: "change-request", adapterId: "github", changeRequestId: "pull/42" },
      authorIdentity: "andrew",
      evaluatorIdentity: "reviewer-1",
      generation: 0,
      requestMechanism: "automatic",
    });

    expect(() => validateReviewTarget({ ...target, headSha: objectId("f") })).toThrow(/target ID/u);
    expect(() => validateReviewRequest(target, {
      ...request,
      carrier: { ...request.carrier, changeRequestId: "pull/43" },
    })).toThrow(/request ID/u);
  });
});
