import { describe, expect, it, vi } from "vitest";

import type { LocalReviewState } from "../../../../../src/scripts/review-gate/core/operation-state-schema.js";
import { sweepLocalReviewSources } from "../../../../../src/scripts/review-gate/core/local-source-sweep.js";

function state(operationId: string, updatedAt: string, cleanupTtlMs = 60_000): LocalReviewState {
  return {
    schemaVersion: 1,
    semanticsVersion: "review-operation/v1",
    kind: "local-review",
    operationId,
    updatedAt,
    vehicle: { kind: "work-unit", identity: "review-surface-binding" },
    repositoryId: "repo-1",
    targetId: `sha256:${"a".repeat(64)}`,
    requestId: `sha256:${"b".repeat(64)}`,
    policyVersion: `sha256:${"c".repeat(64)}`,
    policyBindingDigest: `sha256:${"d".repeat(64)}`,
    attestationRuntimeKind: "arc-cli",
    sourceRef: "source.json",
    sourceDigest: `sha256:${"e".repeat(64)}`,
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

  it("never reaps a live operation or an expired operation with a complete receipt", async () => {
    const live = state("live", "2026-07-23T16:59:30Z");
    const completed = state("completed", "2026-07-23T16:00:00Z");
    const release = vi.fn(async () => undefined);

    await sweepLocalReviewSources({
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
    });

    expect(release).not.toHaveBeenCalled();
  });
});
