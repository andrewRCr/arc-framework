import { describe, expect, it } from "vitest";

import type { ReviewRequest } from "../../../../../../src/scripts/review-gate/core/execution.js";
import {
  ReceiptBackedCodeRabbitObservationLocator,
  ReceiptBackedCodeRabbitRequestLocator,
  type CodeRabbitLocatorDeps,
} from "../../../../../../src/scripts/review-gate/providers/coderabbit/locators.js";

const request: ReviewRequest = {
  schemaVersion: 1,
  repositoryId: "100",
  changeRequestId: "PR_node",
  changeSetId: "a".repeat(64),
  policyVersion: "b".repeat(64),
  semanticsVersion: "review-gate/v1",
  rubricVersion: "independent-analysis/v1",
  requirementId: "independent-analysis",
  sourceIdentity: "coderabbit-pr",
  coverage: "full",
  coverageFromSha: "c".repeat(40),
  coverageThroughSha: "d".repeat(40),
  generation: 0,
  actorIdentity: "302312524",
  requestMechanism: "automatic",
  requiredActorIdentity: "302312524",
};

const deps: CodeRabbitLocatorDeps = {
  pullRequestNumber: 7,
  resolveChange: async () => ({
    kind: "resolved" as const,
    changeRequest: {
      schemaVersion: 1 as const,
      repositoryId: "100",
      changeRequestId: "PR_node",
      hostRef: "github:o/r/pull/7",
      baseRef: "main",
      baseSha: "e".repeat(40),
      diffBaseSha: "c".repeat(40),
      headSha: "d".repeat(40),
      changeSetId: "a".repeat(64),
    },
    context: {
      changedPaths: [],
      author: { identity: "7", nodeId: "U_7", login: "author", kind: "user" as const },
      isDraft: false,
      isCrossRepository: false,
      mergeability: "mergeable" as const,
    },
  }),
  readLedger: async () => ({
    kind: "degraded" as const,
    diagnostics: ["ledger-unavailable" as const],
    observedLedgerVersion: null,
    receipts: [],
  }),
};

describe("receipt-backed CodeRabbit locators", () => {
  it("fails closed when request or observation lookup sees a degraded ledger", async () => {
    const requestLocator = new ReceiptBackedCodeRabbitRequestLocator(deps);
    const observationLocator = new ReceiptBackedCodeRabbitObservationLocator(deps);

    await expect(requestLocator.resolve(request)).rejects.toMatchObject({ code: "receipt-ledger-degraded" });
    await expect(observationLocator.resolveRun("request-1")).rejects.toMatchObject({ code: "receipt-ledger-degraded" });
  });
});
