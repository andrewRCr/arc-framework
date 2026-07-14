import { describe, expect, it } from "vitest";

import { computeChangeSetId } from "../../../../../../src/scripts/review-gate/core/identity.js";
import { createReceipt, computeRequestKey } from "../../../../../../src/scripts/review-gate/core/request-key.js";
import type { ReceiptEnvelope, ReviewRequest } from "../../../../../../src/scripts/review-gate/core/execution.js";
import { buildCodexReviewCommand } from "../../../../../../src/scripts/review-gate/providers/codex/adapter.js";
import { resolveCodexGuidance } from "../../../../../../src/scripts/review-gate/providers/codex/guidance.js";
import { ReceiptBackedCodexLocator } from "../../../../../../src/scripts/review-gate/providers/codex/locators.js";

const HEAD = "a".repeat(40);
const DIFF_BASE = "b".repeat(40);
const ROOT = `# Agent Bootstrap

## Review guidelines

Rubric: independent-analysis/v1
Intent and scope; correctness and failure behavior; trust and compatibility; verification; coherence and maintainability.
`;

describe("receipt-backed Codex locators", () => {
  it("recovers an acknowledged exact-head run with the effective guidance digest", async () => {
    const reader = {
      readText: async (_headSha: string, path: string) => path === "AGENTS.md"
        ? { kind: "ok" as const, observedHeadSha: HEAD, content: ROOT }
        : { kind: "missing" as const },
    };
    const guidance = await resolveCodexGuidance({
      headSha: HEAD,
      changes: [{ status: "modified", path: "src/a.ts" }],
      reader,
    });
    if (!guidance.qualified) throw new Error("guidance fixture failed");
    const request: ReviewRequest = {
      schemaVersion: 1,
      repositoryId: "100",
      changeRequestId: "PR_1",
      changeSetId: computeChangeSetId({ baseRef: "main", diffBaseSha: DIFF_BASE, headSha: HEAD }),
      policyVersion: "c".repeat(64),
      semanticsVersion: "review-gate/v1",
      rubricVersion: "independent-analysis/v1",
      requirementId: "independent-analysis",
      sourceIdentity: "codex-pr",
      coverage: "full",
      coverageFromSha: DIFF_BASE,
      coverageThroughSha: HEAD,
      generation: 0,
      actorIdentity: "302312524",
      requestMechanism: "user-trigger",
      requiredActorIdentity: "7",
      requestCommand: buildCodexReviewCommand(guidance.digest),
    };
    const reserved = createReceipt({
      eventId: "reserved", previousLedgerVersion: 0, action: "reserved", request,
      result: null, evidenceUrlOrId: null, findingIds: [],
      payload: { kind: "reservation", reservedAt: null, pendingProjectionRef: null },
    });
    const acknowledged = createReceipt({
      eventId: "acknowledged", previousLedgerVersion: 1, action: "acknowledged", request,
      result: null, evidenceUrlOrId: "https://github.test/trigger", findingIds: [],
      payload: {
        kind: "acknowledgement",
        acknowledgedAt: "2026-07-12T20:01:00Z",
        acknowledgementRef: "https://github.test/trigger",
        trigger: {
          mechanism: "user-trigger",
          eventKind: "comment",
          eventId: "IC_trigger",
          actorIdentity: "7",
          occurredAt: "2026-07-12T20:01:00Z",
          headSha: HEAD,
          contentDigest: "d".repeat(64),
        },
      },
    });
    const envelopes: ReceiptEnvelope[] = [reserved, acknowledged].map((receipt, index) => ({
      schemaVersion: 1,
      durableRecordId: `record-${index + 1}`,
      recordedAt: `2026-07-12T20:0${index}:00Z`,
      lastModifiedAt: `2026-07-12T20:0${index}:00Z`,
      ledgerVersion: index + 1,
      receipt,
    }));
    const locator = new ReceiptBackedCodexLocator({
      pullRequestNumber: 7,
      resolveChange: async () => ({
        kind: "resolved",
        changeRequest: {
          schemaVersion: 1,
          repositoryId: "100",
          changeRequestId: "PR_1",
          hostRef: "github:o/r/pull/7",
          baseRef: "main",
          baseSha: "e".repeat(40),
          diffBaseSha: DIFF_BASE,
          headSha: HEAD,
          changeSetId: request.changeSetId,
        },
        context: {
          changedPaths: [{ status: "modified", path: "src/a.ts" }],
          author: { identity: "7", nodeId: "U_7", login: "author", kind: "user" },
          isDraft: false,
          isCrossRepository: false,
          mergeability: "mergeable",
        },
      }),
      readLedger: async () => ({ kind: "valid", ledgerVersion: 2, receipts: envelopes }),
      guidanceReader: reader,
    });

    await expect(locator.resolveRequestGuidance(request)).resolves.toEqual({
      qualified: true,
      guidanceDigest: guidance.digest,
    });
    await expect(locator.resolveRun(computeRequestKey(request))).resolves.toMatchObject({
      pullNumber: 7,
      context: {
        headSha: HEAD,
        triggerEventId: "IC_trigger",
        guidanceDigest: guidance.digest,
      },
    });
  });
});
