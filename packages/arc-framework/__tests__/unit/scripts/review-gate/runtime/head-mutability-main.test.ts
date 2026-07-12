import { describe, expect, it } from "vitest";

import type { ReviewReceipt } from "../../../../../src/scripts/review-gate/core/execution.js";
import type { HeadMutabilityReader } from "../../../../../src/scripts/review-gate/runtime/head-mutability-main.js";
import { runAssertHeadMutable } from "../../../../../src/scripts/review-gate/runtime/head-mutability-main.js";

const CURRENT = "a".repeat(40);
const OUTGOING = "b".repeat(40);

function reader(overrides: Partial<Awaited<ReturnType<HeadMutabilityReader["read"]>>> = {}): HeadMutabilityReader {
  return {
    read: async () => ({
      repositoryId: "repo-1",
      changeRequestId: "change-7",
      headSha: CURRENT,
      receipts: [],
      observations: [],
      ...overrides,
    }),
  };
}

describe("exact-head mutability main", () => {
  it("returns a typed refusal when no repair authorization exists", async () => {
    await expect(runAssertHeadMutable({
      repositoryId: "repo-1", changeRequestId: "change-7", currentHeadSha: CURRENT,
      proposedHeadSha: OUTGOING, authorizationReceiptHash: null,
    }, reader())).resolves.toEqual({
      schemaVersion: 1,
      kind: "refuse",
      repositoryId: "repo-1",
      changeRequestId: "change-7",
      currentHeadSha: CURRENT,
      proposedHeadSha: OUTGOING,
      reason: "missing-authorization",
      authorizationReceiptHash: null,
    });
  });

  it("fails closed when canonical scope moves or cannot be read", async () => {
    await expect(runAssertHeadMutable({
      repositoryId: "repo-1", changeRequestId: "change-7", currentHeadSha: CURRENT,
      proposedHeadSha: OUTGOING, authorizationReceiptHash: null,
    }, reader({ headSha: "c".repeat(40) }))).resolves.toMatchObject({
      kind: "refuse", reason: "canonical-state-moved",
    });
    await expect(runAssertHeadMutable({
      repositoryId: "repo-1", changeRequestId: "change-7", currentHeadSha: CURRENT,
      proposedHeadSha: OUTGOING, authorizationReceiptHash: null,
    }, { read: () => Promise.reject(new Error("ledger unavailable")) })).resolves.toMatchObject({
      kind: "refuse", reason: "controller-state-unavailable",
    });
  });

  it("requires an explicitly supplied authorization hash to match the canonical allowance", async () => {
    const authorization = {
      action: "begin-fix",
      receiptHash: "c".repeat(64),
      payload: {
        kind: "head-update-authorization",
        oldHeadSha: CURRENT,
        targetHeadSha: OUTGOING,
      },
    } as ReviewReceipt;
    await expect(runAssertHeadMutable({
      repositoryId: "repo-1", changeRequestId: "change-7", currentHeadSha: CURRENT,
      proposedHeadSha: OUTGOING, authorizationReceiptHash: "d".repeat(64),
    }, reader({ receipts: [authorization] }))).resolves.toMatchObject({
      kind: "refuse", reason: "authorization-mismatch",
    });
  });
});
