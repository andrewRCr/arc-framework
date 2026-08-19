import { describe, expect, it, vi } from "vitest";

import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import {
  createReviewRequirement,
  createReviewTarget,
} from "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import { createLocalReviewAdmission } from "../../../../../src/scripts/review-gate/core/local-operation.js";
import type {
  LocalReviewAuthority,
} from "../../../../../src/scripts/review-gate/core/local-review-authority.js";
import { createLocalReviewSource } from "../../../../../src/scripts/review-gate/core/local-review-source.js";
import type { LocalReviewState } from "../../../../../src/scripts/review-gate/core/operation-state-schema.js";
import { bindReviewSourceReference } from "../../../../../src/scripts/review-gate/core/review-source-reference.js";
import { attestLocalReviewCommand } from "../../../../../src/scripts/review-gate/runtime/local-attest-command.js";
import { createLocalReviewReceipt } from "../../../../../src/scripts/review-gate/runtime/local-attestation.js";

const digest = (value: string): string => canonicalDigest({ value });
const objectId = (character: string): string => character.repeat(40);
const receiptRef = (operationId: string, durableRef: string) => bindReviewSourceReference({
  kind: "attested-local",
  operationId,
  durableRef,
});
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
const releaseMaterialization = async (): Promise<void> => undefined;
const withSourceLock = async <T>(action: () => Promise<T>): Promise<T> => action();

const DELIVERABLE_ID = `sha256:${"a".repeat(64)}`;
const memberVehicle = { kind: "delivery-member", identity: DELIVERABLE_ID } as const;
const workUnitVehicle = { kind: "work-unit", identity: "review-surface-binding" } as const;

function fixture(vehicle: LocalReviewAuthority["vehicle"] = workUnitVehicle) {
  const target = createReviewTarget({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    kind: vehicle.kind === "delivery-member" ? "delivery-member" : "change-set",
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
      vehicle,
      authorIdentity: "author-1",
      evaluatorIdentity: "evaluator-1",
      attestationRuntimeKind: "arc-cli",
      runtimeIdentity: "arc-cli/0.1.0",
      attestationMechanism: "local-attestation",
    },
    laneSourceId: "delegated-agent",
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
    laneSourceId: admission.laneSourceId,
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
    repositoryId: target.repositoryId,
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
  const evaluatorResult = {
    status: result.status,
    result: result.result,
    evaluatorIdentity: result.evaluatorIdentity,
    reviewRunId: result.reviewRunId,
    applicabilityId: result.applicabilityId,
    findings: result.findings,
  };
  return { admission, evaluatorResult, operation, result, source };
}

describe("local attest command", () => {
  it("injects runtime-owned bindings into evaluator-authored terminal output", async () => {
    const records = fixture();
    const appendReceipt = vi.fn(async () => ({
      ledgerVersion: 1,
      durableEvidenceRef: "receipt.json#1",
    }));
    const publishOperation = vi.fn();

    await expect(attestLocalReviewCommand({
      schemaVersion: 1,
      operationId: records.operation.operationId,
      result: { ...records.evaluatorResult, status: "complete" },
    }, {
      withSourceLock,
      operationStore: {
        readOperation: async () => ({ version: 1, state: records.operation }),
        publishOperation,
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
      releaseMaterialization,
      now: () => "2026-07-23T21:00:00Z",
    })).resolves.toMatchObject({
      state: "attested-current",
      nextAction: "reduce",
    });
    expect(appendReceipt).toHaveBeenCalledWith(expect.objectContaining({
      targetId: records.operation.targetId,
      rubricVersion: records.operation.requirement.rubricVersion,
      rubricDigest: records.operation.requirement.rubricDigest,
    }), 0);
    expect(publishOperation).toHaveBeenCalledWith(expect.objectContaining({
      kind: "lane-progress",
      completedPasses: 1,
      attempts: [{
        attemptId: records.operation.operationId,
        sourceId: records.operation.laneSourceId,
        outcome: "clean",
        chunkSeriesComplete: true,
      }],
    }), 1);
  });

  it("returns not-attestable for a non-terminal result without reading source or receipts", async () => {
    const records = fixture();
    const readSource = vi.fn();
    const readReceipts = vi.fn();

    await expect(attestLocalReviewCommand({
      schemaVersion: 1,
      operationId: records.operation.operationId,
      result: records.result,
    }, {
      withSourceLock,
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
      releaseMaterialization,
      now: () => "2026-07-23T21:00:00Z",
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

  it.each([
    ["unavailable", "transient-unavailable"],
    ["failed", "terminal-failure"],
  ] as const)("persists and releases a %s evaluator attempt before recomposition", async (status, outcome) => {
    const records = fixture();
    const publishOperation = vi.fn();
    const release = vi.fn(async () => undefined);
    const readSource = vi.fn();
    const readReceipts = vi.fn();

    await expect(attestLocalReviewCommand({
      schemaVersion: 1,
      operationId: records.operation.operationId,
      result: {
        ...records.evaluatorResult,
        status,
        result: null,
        findings: [],
      },
    }, {
      withSourceLock,
      operationStore: {
        readOperation: async () => ({ version: 1, state: records.operation }),
        publishOperation,
      },
      sourceStore: { readSource, appendSource: vi.fn() },
      receiptStore: { readReceipts, appendReceipt: vi.fn() },
      resolveAuthority: vi.fn(),
      resolveGuidanceDigest: vi.fn(),
      confirmTarget: vi.fn(),
      inspectMaterialization: vi.fn(),
      releaseMaterialization: release,
      now: () => "2026-07-23T21:00:00Z",
    })).resolves.toMatchObject({
      state: "not-attestable",
      nextAction: "rerun-review",
      payload: { result: { status, result: null } },
    });
    expect(publishOperation).toHaveBeenCalledWith(expect.objectContaining({
      kind: "lane-progress",
      completedPasses: 0,
      attempts: [{
        attemptId: records.operation.operationId,
        sourceId: records.operation.laneSourceId,
        outcome,
      }],
    }), 1);
    expect(release).toHaveBeenCalledWith(records.operation.operationId);
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
      withSourceLock,
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
      releaseMaterialization,
      now: () => "2026-07-23T21:00:00Z",
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
      withSourceLock,
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
      releaseMaterialization,
      now: () => "2026-07-23T21:00:00Z",
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
      withSourceLock,
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
      releaseMaterialization,
      now: () => "2026-07-23T21:00:00Z",
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

  it.each(["authority", "guidance"] as const)(
    "returns stale-target before current %s drift can mask the moved head",
    async (drift) => {
      const records = fixture();
      const appendReceipt = vi.fn();
      const resolveAuthority = vi.fn(async () => drift === "authority"
        ? { ...records.admission.authority, runtimeIdentity: "arc-cli/changed" }
        : records.admission.authority);
      const resolveGuidanceDigest = vi.fn(async () => drift === "guidance"
        ? digest("changed-guidance")
        : records.operation.guidanceDigest);
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
        withSourceLock,
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
        resolveAuthority,
        resolveGuidanceDigest,
        confirmTarget: async () => ({
          state: "stale-target",
          attemptedTarget: records.operation.target,
          currentTarget,
        }),
        inspectMaterialization: async () => "materialized",
        releaseMaterialization,
        now: () => "2026-07-23T21:00:00Z",
      })).resolves.toMatchObject({
        state: "stale-target",
        nextAction: "prepare-current-target",
        payload: {
          receiptRecorded: false,
          attemptedTarget: records.operation.target,
          currentTarget,
        },
      });
      expect(resolveAuthority).not.toHaveBeenCalled();
      expect(resolveGuidanceDigest).not.toHaveBeenCalled();
      expect(appendReceipt).not.toHaveBeenCalled();
    },
  );

  it("appends once and returns attested-current when the target remains unchanged", async () => {
    const records = fixture();
    const order: string[] = [];
    const appendReceipt = vi.fn(async () => {
      order.push("receipt");
      return {
        ledgerVersion: 1,
        durableEvidenceRef: "receipt.json#1",
      };
    });
    const releaseMaterialization = vi.fn(async () => {
      order.push("release");
    });

    await expect(attestLocalReviewCommand({
      schemaVersion: 1,
      operationId: records.operation.operationId,
      result: { ...records.result, status: "complete" },
    }, {
      withSourceLock,
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
      releaseMaterialization,
      now: () => "2026-07-23T21:00:00Z",
    })).resolves.toMatchObject({
      state: "attested-current",
      nextAction: "reduce",
      payload: {
        receiptRef: receiptRef(records.operation.operationId, "receipt.json#1"),
        receiptRecorded: true,
        target: records.operation.target,
        sourceRef: records.operation.sourceRef,
      },
    });
    expect(appendReceipt).toHaveBeenCalledOnce();
    expect(releaseMaterialization).toHaveBeenCalledWith(records.operation.operationId);
    expect(order).toEqual(["receipt", "release"]);
  });

  it("reloads and retries after an unrelated concurrent receipt publication", async () => {
    const records = fixture();
    const readReceipts = vi.fn()
      .mockResolvedValueOnce({ ledgerVersion: 0, receipts: [] })
      .mockResolvedValueOnce({ ledgerVersion: 1, receipts: [] });
    const versionConflict = Object.assign(new Error("version-conflict"), {
      code: "version-conflict",
    });
    const appendReceipt = vi.fn()
      .mockRejectedValueOnce(versionConflict)
      .mockResolvedValueOnce({
        ledgerVersion: 2,
        durableEvidenceRef: "receipt.json#2",
      });

    await expect(attestLocalReviewCommand({
      schemaVersion: 1,
      operationId: records.operation.operationId,
      result: { ...records.result, status: "complete" },
    }, {
      withSourceLock,
      operationStore: {
        readOperation: async () => ({ version: 1, state: records.operation }),
        publishOperation: vi.fn(),
      },
      sourceStore: {
        readSource: async () => records.source,
        appendSource: vi.fn(),
      },
      receiptStore: { readReceipts, appendReceipt },
      resolveAuthority: async () => records.admission.authority,
      resolveGuidanceDigest: async () => records.operation.guidanceDigest,
      confirmTarget: async () => ({ state: "current", target: records.operation.target }),
      inspectMaterialization: async () => "materialized",
      releaseMaterialization,
      now: () => "2026-07-23T21:00:00Z",
    })).resolves.toMatchObject({
      state: "attested-current",
      payload: {
        receiptRecorded: true,
        receiptRef: receiptRef(records.operation.operationId, "receipt.json#2"),
      },
    });
    expect(appendReceipt).toHaveBeenNthCalledWith(1, expect.any(Object), 0);
    expect(appendReceipt).toHaveBeenNthCalledWith(2, expect.any(Object), 1);
  });

  it("refuses a divergent receipt published during retry", async () => {
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
    const readReceipts = vi.fn()
      .mockResolvedValueOnce({ ledgerVersion: 0, receipts: [] })
      .mockResolvedValueOnce({
        ledgerVersion: 1,
        receipts: [{ ...receipt, runtimeIdentity: "arc-cli/conflicting" }],
      });
    const appendReceipt = vi.fn().mockRejectedValue(
      Object.assign(new Error("version-conflict"), { code: "version-conflict" }),
    );

    await expect(attestLocalReviewCommand({
      schemaVersion: 1,
      operationId: records.operation.operationId,
      result,
    }, {
      withSourceLock,
      operationStore: {
        readOperation: async () => ({ version: 1, state: records.operation }),
        publishOperation: vi.fn(),
      },
      sourceStore: {
        readSource: async () => records.source,
        appendSource: vi.fn(),
      },
      receiptStore: { readReceipts, appendReceipt },
      resolveAuthority: async () => records.admission.authority,
      resolveGuidanceDigest: async () => records.operation.guidanceDigest,
      confirmTarget: async () => ({ state: "current", target: records.operation.target }),
      inspectMaterialization: async () => "materialized",
      releaseMaterialization,
      now: () => "2026-07-23T21:00:00Z",
    })).rejects.toMatchObject({ code: "corrupt-state" });
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
      withSourceLock,
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
      releaseMaterialization,
      now: () => "2026-07-23T21:00:00Z",
    })).resolves.toMatchObject({
      state: "stale-target",
      nextAction: "prepare-current-target",
      payload: {
        receiptRecorded: true,
        receiptRef: receiptRef(records.operation.operationId, "receipt.json#1"),
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
    const releaseMaterialization = vi.fn();

    await expect(attestLocalReviewCommand({
      schemaVersion: 1,
      operationId: records.operation.operationId,
      result,
    }, {
      withSourceLock,
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
      releaseMaterialization,
      now: () => "2026-07-23T21:00:00Z",
    })).resolves.toMatchObject({
      state: "attested-current",
      payload: {
        receiptRef: receiptRef(records.operation.operationId, "receipt.json#1"),
        receiptRecorded: true,
      },
    });
    expect(appendReceipt).toHaveBeenCalledWith(receipt, 1);
    expect(releaseMaterialization).toHaveBeenCalledWith(records.operation.operationId);
    expect(inspectMaterialization).not.toHaveBeenCalled();
  });

  it("rejects multiple terminal receipts for one local operation", async () => {
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
    const appendReceipt = vi.fn();

    await expect(attestLocalReviewCommand({
      schemaVersion: 1,
      operationId: records.operation.operationId,
      result,
    }, {
      withSourceLock,
      operationStore: {
        readOperation: async () => ({ version: 1, state: records.operation }),
        publishOperation: vi.fn(),
      },
      sourceStore: {
        readSource: async () => records.source,
        appendSource: vi.fn(),
      },
      receiptStore: {
        readReceipts: async () => ({ ledgerVersion: 2, receipts: [receipt, receipt] }),
        appendReceipt,
      },
      resolveAuthority: async () => records.admission.authority,
      resolveGuidanceDigest: async () => records.operation.guidanceDigest,
      confirmTarget: async () => ({ state: "current", target: records.operation.target }),
      inspectMaterialization: vi.fn(),
      releaseMaterialization: vi.fn(),
      now: () => "2026-07-23T21:00:00Z",
    })).rejects.toMatchObject({
      code: "corrupt-state",
      message: "local review operation has multiple terminal receipts",
    });
    expect(appendReceipt).not.toHaveBeenCalled();
  });

  describe("member attestation", () => {
    const attest = (
      records: ReturnType<typeof fixture>,
      resolveAuthority: (
        evaluatorIdentity: string,
        memberHeadObjectId?: string,
      ) => Promise<LocalReviewAuthority>,
    ) => attestLocalReviewCommand({
      schemaVersion: 1,
      operationId: records.operation.operationId,
      result: { ...records.result, status: "complete" },
    }, {
      withSourceLock,
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
        appendReceipt: async () => ({ ledgerVersion: 1, durableEvidenceRef: "receipt.json#1" }),
      },
      resolveAuthority,
      resolveGuidanceDigest: async () => records.operation.guidanceDigest,
      confirmTarget: async () => ({ state: "current", target: records.operation.target }),
      inspectMaterialization: async () => "materialized",
      releaseMaterialization,
      now: () => "2026-07-23T21:00:00Z",
    });

    it("re-resolves the persisted member vehicle from the head its target pins", async () => {
      const records = fixture(memberVehicle);
      // The control locus resolves its own work unit unless a member head is named,
      // so a resolution that never receives the selector derives the wrong vehicle.
      const resolveAuthority = vi.fn(async (
        _evaluatorIdentity: string,
        memberHeadObjectId?: string,
      ): Promise<LocalReviewAuthority> => ({
        ...records.admission.authority,
        vehicle: memberHeadObjectId === records.operation.target.headSha
          ? memberVehicle
          : workUnitVehicle,
      }));

      await expect(attest(records, resolveAuthority)).resolves.toMatchObject({
        state: "attested-current",
        nextAction: "reduce",
      });
      expect(resolveAuthority).toHaveBeenCalledWith(
        records.operation.request.evaluatorIdentity,
        records.operation.target.headSha,
      );
    });

    it("names no member for a work-unit operation whose head is itself delivery-bound", async () => {
      const records = fixture();
      // A terminal member's pull request is opened from the control branch, so that
      // head resolves to a member — an unconditional supply would adopt it here.
      const resolveAuthority = vi.fn(async (
        _evaluatorIdentity: string,
        memberHeadObjectId?: string,
      ): Promise<LocalReviewAuthority> => ({
        ...records.admission.authority,
        vehicle: memberHeadObjectId === undefined ? workUnitVehicle : memberVehicle,
      }));

      await expect(attest(records, resolveAuthority)).resolves.toMatchObject({
        state: "attested-current",
        nextAction: "reduce",
      });
      expect(resolveAuthority).toHaveBeenCalledWith(
        records.operation.request.evaluatorIdentity,
        undefined,
      );
    });

    it("refuses a member operation whose re-resolved vehicle names another member", async () => {
      const records = fixture(memberVehicle);
      const resolveAuthority = vi.fn(async (): Promise<LocalReviewAuthority> => ({
        ...records.admission.authority,
        vehicle: { kind: "delivery-member", identity: `sha256:${"b".repeat(64)}` },
      }));

      await expect(attest(records, resolveAuthority)).rejects.toMatchObject({
        code: "invalid-input",
        message: "local review attestation authority mismatch",
      });
    });
  });
});
