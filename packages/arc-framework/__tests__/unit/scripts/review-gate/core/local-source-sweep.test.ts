import { describe, expect, it, vi } from "vitest";

import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import {
  createReviewRequirement,
  createReviewTarget,
} from "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import { createLocalChangeSetCarrier } from "../../../../../src/scripts/review-gate/core/local-carrier.js";
import type { LocalReviewState } from "../../../../../src/scripts/review-gate/core/operation-state-schema.js";
import { sweepLocalReviewSources } from "../../../../../src/scripts/review-gate/core/local-source-sweep.js";
import { projectLocalReviewGuidance } from
  "../../../../../src/scripts/review-gate/policy/local-review-guidance.js";

const digest = (value: string): string => canonicalDigest({ value });
const objectId = (character: string): string => character.repeat(40);

function state(
  operationId: string,
  updatedAt: string,
  cleanupTtlMs = 60_000,
  head = "c",
): LocalReviewState {
  const target = createReviewTarget({
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
  const lineage = { kind: "candidate" as const, candidateId: digest("candidate") };
  const guidance = projectLocalReviewGuidance();
  const carrier = createLocalChangeSetCarrier({
    target,
    lineage,
    logicalPass: 1,
    requirementId: requirement.requirementId,
    snapshot: {
      state: "exact",
      repositoryId: target.repositoryId,
      baseRef: target.baseRef,
      diffBaseSha: target.diffBaseSha,
      diffBaseTree: target.diffBaseTree,
      headSha: target.headSha,
      headTree: target.headTree,
    },
    authorIdentity: "author-1",
    evaluatorIdentity: "evaluator-1",
    attestation: {
      evaluatorIdentity: "evaluator-1",
      runtimeIdentity: "arc-cli/0.1.0",
      mechanism: "local-attestation",
    },
    generation: 0,
    requestMechanism: "local-attestation",
  });
  return {
    schemaVersion: 1,
    semanticsVersion: "review-operation/v1",
    kind: "local-review",
    operationId,
    updatedAt,
    vehicle: { kind: "work-unit", identity: "review-surface-binding" },
    lineage,
    logicalPass: 1,
    retryGeneration: 0,
    coverageAdmission: { requestedCoverage: "complete" },
    repositoryId: "repo-1",
    targetId: target.targetId,
    requestId: carrier.request.requestId,
    policyVersion: requirement.policyVersion,
    policyBindingDigest: digest("binding"),
    laneSourceId: "delegated-agent",
    scopeMode: "whole-target",
    attestationRuntimeKind: "arc-cli",
    sourceRef: "source.json",
    sourceDigest: digest("source"),
    guidance: guidance.projection,
    guidanceDigest: guidance.guidanceDigest,
    reviewerInstructions: guidance.reviewerInstructions,
    target,
    requirement,
    request: carrier.request,
    attestation: carrier.attestation,
    cleanupTtlMs,
  };
}

describe("local review source sweep", () => {
  it("reaps true orphan pins and terminally expired operations without receipts", async () => {
    const release = vi.fn(async () => undefined);
    const records = new Map([
      ["orphan", null],
      ["expired", state("expired", "2026-07-23T16:00:00Z")],
    ]);

    await expect(sweepLocalReviewSources({
      listOperationIds: async () => [...records.keys()],
      readOperation: async (operationId) => ({ version: records.get(operationId) === null ? 0 : 1, state: records.get(operationId) ?? null }),
      readReceipts: async () => ({ ledgerVersion: 0, receipts: [] }),
      release,
      now: () => "2026-07-23T17:00:00Z",
    })).resolves.toEqual({
      reaped: [
        { operationId: "orphan", reason: "orphan" },
        { operationId: "expired", reason: "terminally-expired" },
      ],
    });
    expect(release).toHaveBeenCalledTimes(2);
  });

  it("retains a live operation and reaps completed crash residue", async () => {
    const live = state("live", "2026-07-23T16:59:30Z");
    const completed = state("completed", "2026-07-23T16:00:00Z", 60_000, "d");
    const release = vi.fn(async () => undefined);

    await expect(sweepLocalReviewSources({
      listOperationIds: async () => ["live", "completed"],
      readOperation: async (operationId) => ({
        version: 1,
        state: operationId === "live" ? live : completed,
      }),
      readReceipts: async (targetId) => ({
        ledgerVersion: 1,
        receipts: targetId === completed.targetId ? [{ requestId: completed.requestId }] as never[] : [],
      }),
      release,
      now: () => "2026-07-23T17:00:00Z",
    })).resolves.toEqual({
      reaped: [{ operationId: "completed", reason: "completed" }],
    });

    expect(release).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledWith("completed");
  });

  it("never reaps a live unexpired source during concurrent sweeps", async () => {
    const live = state("live", "2026-07-23T16:59:30Z");
    const release = vi.fn(async () => undefined);
    const dependencies = {
      listOperationIds: async () => ["live"],
      readOperation: async () => ({ version: 1, state: live }),
      readReceipts: async () => ({ ledgerVersion: 0, receipts: [] }),
      release,
      now: () => "2026-07-23T17:00:00Z",
    };

    await expect(Promise.all([
      sweepLocalReviewSources(dependencies),
      sweepLocalReviewSources(dependencies),
    ])).resolves.toEqual([{ reaped: [] }, { reaped: [] }]);

    expect(release).not.toHaveBeenCalled();
  });
});
