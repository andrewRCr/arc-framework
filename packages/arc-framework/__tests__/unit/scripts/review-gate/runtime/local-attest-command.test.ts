import { describe, expect, it, vi } from "vitest";

import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import {
  createReviewRequirement,
  createReviewTarget,
} from "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import { createLocalReviewAdmission } from "../../../../../src/scripts/review-gate/core/local-operation.js";
import { createLocalReviewSource } from "../../../../../src/scripts/review-gate/core/local-review-source.js";
import type { LocalReviewState } from "../../../../../src/scripts/review-gate/core/operation-state-schema.js";
import { attestLocalReviewCommand } from "../../../../../src/scripts/review-gate/runtime/local-attest-command.js";
import { createLocalReviewReceipt } from "../../../../../src/scripts/review-gate/runtime/local-attestation.js";

const digest = (value: string): string => canonicalDigest({ value });
const objectId = (character: string): string => character.repeat(40);
const targetInput = (target: LocalReviewState["target"]) => ({
  schemaVersion: target.schemaVersion,
  semanticsVersion: target.semanticsVersion,
  kind: target.kind,
  repositoryId: target.repositoryId,
  baseRef: target.baseRef,
  diffBaseSha: target.diffBaseSha,
  diffBaseTree: target.diffBaseTree,
  headSha: target.headSha,
  headTree: target.headTree,
});

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
  const admission = createLocalReviewAdmission({
    target,
    requirement,
    authority: {
      vehicle: { kind: "work-unit", identity: "review-surface-binding" },
      authorIdentity: "author-1",
      evaluatorIdentity: "evaluator-1",
      attestationRuntimeKind: "arc-cli",
      runtimeIdentity: "arc-cli/0.1.0",
      attestationMechanism: "local-attestation",
    },
    policyBindingDigest: digest("binding"),
    requestMechanism: "local-attestation",
  });
  const operation: LocalReviewState = {
    schemaVersion: 1,
    semanticsVersion: "review-operation/v1",
    kind: "local-review",
    operationId: admission.operationId,
    updatedAt: "2026-07-23T17:00:00Z",
    vehicle: admission.authority.vehicle,
    repositoryId: target.repositoryId,
    targetId: target.targetId,
    requestId: admission.carrier.request.requestId,
    policyVersion: requirement.policyVersion,
    policyBindingDigest: admission.policyBindingDigest,
    attestationRuntimeKind: admission.authority.attestationRuntimeKind,
    sourceRef: "source.json",
    sourceDigest: digest("source"),
    guidanceDigest: digest("guidance"),
    target,
    requirement,
    request: admission.carrier.request,
    attestation: admission.carrier.attestation,
    cleanupTtlMs: 60_000,
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
    reachabilityRef: `refs/arc/review/local/${admission.operationId}`,
    materializationRef: `/tmp/${admission.operationId}`,
  });
  operation.sourceDigest = source.sourceDigest;
  const result = {
    status: "partial" as const,
    result: "clean" as const,
    targetId: target.targetId,
    headSha: target.headSha,
    headTree: target.headTree,
    rubricVersion: requirement.rubricVersion,
    rubricDigest: requirement.rubricDigest,
    sourceDigest: operation.sourceDigest,
    guidanceDigest: operation.guidanceDigest,
    evaluatorIdentity: admission.authority.evaluatorIdentity,
    reviewRunId: "run-1",
    applicabilityId: null,
    findings: [],
  };
  return { admission, operation, result, source };
}

describe("local attest command", () => {
  it("returns not-attestable for a non-terminal result without reading source or receipts", async () => {
    const records = fixture();
    const readSource = vi.fn();
    const readReceipts = vi.fn();

    await expect(attestLocalReviewCommand({
      schemaVersion: 1,
      operationId: records.operation.operationId,
      result: records.result,
    }, {
      operationStore: {
        readOperation: async () => ({ version: 1, state: records.operation }),
        publishOperation: vi.fn(),
      },
      sourceStore: { readSource, appendSource: vi.fn() },
      receiptStore: { readReceipts, appendReceipt: vi.fn() },
      resolveAuthority: vi.fn(),
      resolveGuidanceDigest: vi.fn(),
      confirmTarget: vi.fn(),
      inspectMaterialization: vi.fn(),
    })).resolves.toMatchObject({
      state: "not-attestable",
      nextAction: "rerun-review",
      payload: {
        operationId: records.operation.operationId,
        persistedVersion: 1,
        result: records.result,
      },
    });
    expect(readSource).not.toHaveBeenCalled();
    expect(readReceipts).not.toHaveBeenCalled();
  });

  it("rejects a terminal result that echoes a different source digest", async () => {
    const records = fixture();
    const appendReceipt = vi.fn();

    await expect(attestLocalReviewCommand({
      schemaVersion: 1,
      operationId: records.operation.operationId,
      result: {
        ...records.result,
        status: "complete",
        sourceDigest: digest("different-source"),
      },
    }, {
      operationStore: {
        readOperation: async () => ({ version: 1, state: records.operation }),
        publishOperation: vi.fn(),
      },
      sourceStore: {
        readSource: async () => records.source,
        appendSource: vi.fn(),
      },
      receiptStore: {
        readReceipts: async () => ({ ledgerVersion: 0, receipts: [] }),
        appendReceipt,
      },
      resolveAuthority: async () => records.admission.authority,
      resolveGuidanceDigest: async () => records.operation.guidanceDigest,
      confirmTarget: async () => ({ state: "current", target: records.operation.target }),
      inspectMaterialization: async () => "materialized",
    })).rejects.toThrow(/source/iu);
    expect(appendReceipt).not.toHaveBeenCalled();
  });

  it("returns expired without appending when no receipt or materialization remains", async () => {
    const records = fixture();
    const appendReceipt = vi.fn();

    await expect(attestLocalReviewCommand({
      schemaVersion: 1,
      operationId: records.operation.operationId,
      result: { ...records.result, status: "complete" },
    }, {
      operationStore: {
        readOperation: async () => ({ version: 1, state: records.operation }),
        publishOperation: vi.fn(),
      },
      sourceStore: {
        readSource: async () => records.source,
        appendSource: vi.fn(),
      },
      receiptStore: {
        readReceipts: async () => ({ ledgerVersion: 0, receipts: [] }),
        appendReceipt,
      },
      resolveAuthority: async () => records.admission.authority,
      resolveGuidanceDigest: async () => records.operation.guidanceDigest,
      confirmTarget: vi.fn(),
      inspectMaterialization: async () => "absent",
    })).resolves.toMatchObject({
      state: "expired",
      nextAction: "rerun-review",
      payload: {
        operationId: records.operation.operationId,
        persistedVersion: 1,
      },
    });
    expect(appendReceipt).not.toHaveBeenCalled();
  });

  it("returns stale-target without appending when the target changed before publication", async () => {
    const records = fixture();
    const appendReceipt = vi.fn();
    const currentTarget = createReviewTarget({
      ...targetInput(records.operation.target),
      headSha: objectId("e"),
      headTree: objectId("f"),
    });

    await expect(attestLocalReviewCommand({
      schemaVersion: 1,
      operationId: records.operation.operationId,
      result: { ...records.result, status: "complete" },
    }, {
      operationStore: {
        readOperation: async () => ({ version: 1, state: records.operation }),
        publishOperation: vi.fn(),
      },
      sourceStore: {
        readSource: async () => records.source,
        appendSource: vi.fn(),
      },
      receiptStore: {
        readReceipts: async () => ({ ledgerVersion: 0, receipts: [] }),
        appendReceipt,
      },
      resolveAuthority: async () => records.admission.authority,
      resolveGuidanceDigest: async () => records.operation.guidanceDigest,
      confirmTarget: async () => ({
        state: "stale-target",
        attemptedTarget: records.operation.target,
        currentTarget,
      }),
      inspectMaterialization: async () => "materialized",
    })).resolves.toMatchObject({
      state: "stale-target",
      nextAction: "prepare-current-target",
      payload: {
        receiptRecorded: false,
        attemptedTarget: records.operation.target,
        currentTarget,
      },
    });
    expect(appendReceipt).not.toHaveBeenCalled();
  });

  it("appends once and returns attested-current when the target remains unchanged", async () => {
    const records = fixture();
    const appendReceipt = vi.fn(async () => ({
      ledgerVersion: 1,
      durableEvidenceRef: "receipt.json#1",
    }));

    await expect(attestLocalReviewCommand({
      schemaVersion: 1,
      operationId: records.operation.operationId,
      result: { ...records.result, status: "complete" },
    }, {
      operationStore: {
        readOperation: async () => ({ version: 1, state: records.operation }),
        publishOperation: vi.fn(),
      },
      sourceStore: {
        readSource: async () => records.source,
        appendSource: vi.fn(),
      },
      receiptStore: {
        readReceipts: async () => ({ ledgerVersion: 0, receipts: [] }),
        appendReceipt,
      },
      resolveAuthority: async () => records.admission.authority,
      resolveGuidanceDigest: async () => records.operation.guidanceDigest,
      confirmTarget: async () => ({ state: "current", target: records.operation.target }),
      inspectMaterialization: async () => "materialized",
    })).resolves.toMatchObject({
      state: "attested-current",
      nextAction: "reduce",
      payload: {
        receiptRef: "receipt.json#1",
        receiptRecorded: true,
        target: records.operation.target,
        sourceRef: records.operation.sourceRef,
      },
    });
    expect(appendReceipt).toHaveBeenCalledOnce();
  });

  it("retains the receipt and returns stale-target when the target changes after append", async () => {
    const records = fixture();
    const currentTarget = createReviewTarget({
      ...targetInput(records.operation.target),
      headSha: objectId("e"),
      headTree: objectId("f"),
    });
    const appendReceipt = vi.fn(async () => ({
      ledgerVersion: 1,
      durableEvidenceRef: "receipt.json#1",
    }));
    const confirmTarget = vi.fn()
      .mockResolvedValueOnce({ state: "current", target: records.operation.target })
      .mockResolvedValueOnce({
        state: "stale-target",
        attemptedTarget: records.operation.target,
        currentTarget,
      });

    await expect(attestLocalReviewCommand({
      schemaVersion: 1,
      operationId: records.operation.operationId,
      result: { ...records.result, status: "complete" },
    }, {
      operationStore: {
        readOperation: async () => ({ version: 1, state: records.operation }),
        publishOperation: vi.fn(),
      },
      sourceStore: {
        readSource: async () => records.source,
        appendSource: vi.fn(),
      },
      receiptStore: {
        readReceipts: async () => ({ ledgerVersion: 0, receipts: [] }),
        appendReceipt,
      },
      resolveAuthority: async () => records.admission.authority,
      resolveGuidanceDigest: async () => records.operation.guidanceDigest,
      confirmTarget,
      inspectMaterialization: async () => "materialized",
    })).resolves.toMatchObject({
      state: "stale-target",
      nextAction: "prepare-current-target",
      payload: {
        receiptRecorded: true,
        receiptRef: "receipt.json#1",
        attemptedTarget: records.operation.target,
        currentTarget,
      },
    });
    expect(appendReceipt).toHaveBeenCalledOnce();
  });

  it("replays an exact recorded receipt without requiring the reaped materialization", async () => {
    const records = fixture();
    const result = { ...records.result, status: "complete" as const };
    const receipt = createLocalReviewReceipt({
      target: records.operation.target,
      requirement: records.operation.requirement,
      carrier: {
        target: records.operation.target,
        request: records.operation.request,
        attestation: records.operation.attestation,
      },
      result,
      runtimeIdentity: records.operation.attestation.runtimeIdentity,
      attestationMechanism: records.operation.attestation.mechanism,
      sourceDigest: records.operation.sourceDigest,
      guidanceDigest: records.operation.guidanceDigest,
    });
    const appendReceipt = vi.fn(async () => ({
      ledgerVersion: 1,
      durableEvidenceRef: "receipt.json#1",
    }));
    const inspectMaterialization = vi.fn();

    await expect(attestLocalReviewCommand({
      schemaVersion: 1,
      operationId: records.operation.operationId,
      result,
    }, {
      operationStore: {
        readOperation: async () => ({ version: 1, state: records.operation }),
        publishOperation: vi.fn(),
      },
      sourceStore: {
        readSource: async () => records.source,
        appendSource: vi.fn(),
      },
      receiptStore: {
        readReceipts: async () => ({ ledgerVersion: 1, receipts: [receipt] }),
        appendReceipt,
      },
      resolveAuthority: async () => records.admission.authority,
      resolveGuidanceDigest: async () => records.operation.guidanceDigest,
      confirmTarget: async () => ({ state: "current", target: records.operation.target }),
      inspectMaterialization,
    })).resolves.toMatchObject({
      state: "attested-current",
      payload: { receiptRef: "receipt.json#1", receiptRecorded: true },
    });
    expect(appendReceipt).toHaveBeenCalledWith(receipt, 1);
    expect(inspectMaterialization).not.toHaveBeenCalled();
  });
});
