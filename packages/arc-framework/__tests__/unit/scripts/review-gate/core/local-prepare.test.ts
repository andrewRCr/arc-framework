import { describe, expect, it, vi } from "vitest";

import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import {
  createReviewRequirement,
  createReviewTarget,
} from "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import { createLocalReviewAdmission } from "../../../../../src/scripts/review-gate/core/local-operation.js";
import {
  createLocalReviewSourcePayload,
  publishLocalReviewPreparation,
} from "../../../../../src/scripts/review-gate/core/local-prepare.js";
import { createLocalReviewSource } from "../../../../../src/scripts/review-gate/core/local-review-source.js";
import { projectLocalReviewGuidance } from
  "../../../../../src/scripts/review-gate/policy/local-review-guidance.js";

const digest = (value: string): string => canonicalDigest({ value });
const objectId = (character: string): string => character.repeat(40);

function fixture() {
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
  const requirement = createReviewRequirement({
    target,
    projection: {
      obligation: "recommended",
      reasons: ["routine-code"],
      rubricVersion: "standard-review/v1",
      rubricDigest: digest("rubric"),
      retrigger: "full-final",
      count: 1,
    },
    acceptableSources: [{ sourceKind: "agent", qualifier: "standard-review/v1" }],
    initialAdmission: "checkpoint",
  });
  if (requirement === null) throw new Error("expected local requirement");
  const source = createLocalReviewSource({
    schemaVersion: 1,
    semanticsVersion: "git-object-range/v1",
    repositoryId: target.repositoryId,
    targetId: target.targetId,
    objectFormat: "sha1",
    diffBaseSha: target.diffBaseSha,
    diffBaseTree: target.diffBaseTree,
    headSha: target.headSha,
    headTree: target.headTree,
    reachabilityRef: "refs/arc/review/local/pin",
    materializationRef: "/tmp/review-root",
  });
  const admission = createLocalReviewAdmission({
    target,
    requirement,
    authority: {
      vehicle: { kind: "work-unit" as const, identity: "review-surface-binding" },
      authorIdentity: "author-1",
      evaluatorIdentity: "evaluator-1",
      attestationRuntimeKind: "arc-cli",
      runtimeIdentity: "arc-cli/0.1.0",
      attestationMechanism: "local-attestation",
    },
    laneSourceId: "delegated-agent",
    lineage: { kind: "candidate" as const, candidateId: "sha256:7777777777777777777777777777777777777777777777777777777777777777" },
    logicalPass: 1,
    retryGeneration: 0,
    policyBindingDigest: digest("binding"),
    requestMechanism: "local-attestation",
  });
  return { target, source, admission };
}

describe("local prepare publication ordering", () => {
  it("publishes the immutable descriptor and operation before creating the pin", async () => {
    const records = fixture();
    const order: string[] = [];
    const appendSource = vi.fn(async () => {
      order.push("source");
      return { sourceRef: "sources/source.json" };
    });
    const publishOperation = vi.fn(async () => {
      order.push("operation");
      return { version: 1 };
    });
    const materialize = vi.fn(async () => {
      order.push("materialization");
      return { reviewRoot: records.source.materializationRef };
    });

    await expect(publishLocalReviewPreparation(records.admission, records.source, {
      sourceStore: { readSource: vi.fn(), appendSource },
      operationStore: { readOperation: vi.fn(), publishOperation },
      materialize,
      now: () => "2026-07-23T17:00:00Z",
      cleanupTtlMs: 60_000,
      guidance: projectLocalReviewGuidance(),
    })).resolves.toMatchObject({
      persistedVersion: 1,
      sourceRef: "sources/source.json",
      reviewRoot: records.source.materializationRef,
    });
    expect(order).toEqual(["source", "operation", "materialization"]);
  });

  it("leaves a recoverable published operation when materialization fails", async () => {
    const records = fixture();
    const publishOperation = vi.fn(async () => ({ version: 1 }));
    await expect(publishLocalReviewPreparation(records.admission, records.source, {
      sourceStore: {
        readSource: vi.fn(),
        appendSource: vi.fn(async () => ({ sourceRef: "sources/source.json" })),
      },
      operationStore: { readOperation: vi.fn(), publishOperation },
      materialize: async () => {
        throw new Error("pin creation interrupted");
      },
      now: () => "2026-07-23T17:00:00Z",
      cleanupTtlMs: 60_000,
      guidance: projectLocalReviewGuidance(),
    })).rejects.toThrow(/pin creation interrupted/u);
    expect(publishOperation).toHaveBeenCalledOnce();
  });

  it("delivers immutable source coordinates without a caller-worktree path", () => {
    const records = fixture();
    const payload = createLocalReviewSourcePayload(records.admission, {
      persistedVersion: 1,
      state: {} as never,
      sourceRef: "sources/source.json",
      sourceDigest: records.source.sourceDigest,
      reviewRoot: records.source.materializationRef,
    });

    expect(payload).toEqual({
      reviewRoot: records.source.materializationRef,
      diffBaseSha: records.target.diffBaseSha,
      headSha: records.target.headSha,
      sourceRef: "sources/source.json",
      sourceDigest: records.source.sourceDigest,
    });
    expect(payload).not.toHaveProperty("cwd");
    expect(payload).not.toHaveProperty("worktreePath");
  });
});
