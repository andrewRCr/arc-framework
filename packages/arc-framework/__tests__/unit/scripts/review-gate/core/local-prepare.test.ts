import { describe, expect, it, vi } from "vitest";

import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import type { LocalReviewAdmission } from "../../../../../src/scripts/review-gate/core/local-operation.js";
import {
  createLocalReviewSourcePayload,
  publishLocalReviewPreparation,
} from "../../../../../src/scripts/review-gate/core/local-prepare.js";
import { createLocalReviewSource } from "../../../../../src/scripts/review-gate/core/local-review-source.js";

const digest = (value: string): string => canonicalDigest({ value });
const objectId = (character: string): string => character.repeat(40);

function fixture() {
  const target = {
    schemaVersion: 2 as const,
    semanticsVersion: "review-gate/v2" as const,
    kind: "change-set" as const,
    repositoryId: "repo-1",
    baseRef: "main",
    diffBaseSha: objectId("a"),
    diffBaseTree: objectId("b"),
    headSha: objectId("c"),
    headTree: objectId("d"),
    targetId: digest("target"),
  };
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
  const admission = {
    operationId: `local-${"e".repeat(64)}`,
    target,
    requirement: { policyVersion: digest("policy") },
    authority: {
      vehicle: { kind: "work-unit" as const, identity: "review-surface-binding" },
      attestationRuntimeKind: "arc-cli",
    },
    policyBindingDigest: digest("binding"),
    carrier: { request: { requestId: digest("request") } },
  } as LocalReviewAdmission;
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
