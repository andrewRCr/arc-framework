import { readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { CapabilitySet, NormalizedChangeRequest } from "../../../../../src/scripts/review-gate/core/contracts.js";
import type { Evidence } from "../../../../../src/scripts/review-gate/core/evidence.js";
import type { GateProjection, ReceiptEnvelope, ReviewRequest, SourceCapacity } from "../../../../../src/scripts/review-gate/core/execution.js";
import type {
  GitHostAdapter,
  LifecycleTailProofAdapter,
  ReviewProviderAdapter,
  ReviewReceiptStore,
} from "../../../../../src/scripts/review-gate/core/ports.js";

describe("review adapter ports", () => {
  it("accepts fixture adapters that exchange only normalized values", async () => {
    const change = { changeRequestId: "change-7" } as NormalizedChangeRequest;
    const capabilities = { actorIdentity: "actor-4" } as CapabilitySet;
    const projection = { conclusion: "pending" } as GateProjection;
    const request = { generation: 0 } as ReviewRequest;
    const capacity = { status: "available" } as SourceCapacity;
    const evidence = [{ result: "clean" } as Evidence];
    const receipts = [{ durableRecordId: "record-1" } as ReceiptEnvelope];

    const host: GitHostAdapter = {
      resolveChangeRequest: async () => ({
        changeRequest: change,
        context: {
          changedPaths: [],
          author: { identity: "actor-4", login: "actor" },
          isDraft: false,
          isCrossRepository: false,
          mergeability: "mergeable",
        },
      }),
      resolveActorCapabilities: async () => capabilities,
      observeNativeReview: async () => ({
        nativeReview: {
          requestedChanges: false,
          unresolvedRequiredConversations: 0,
          decision: "not-configured",
        },
        peerApprovals: [],
        closures: [],
        providerReviews: [],
      }),
      publishVerdict: async () => [{ opaqueRef: "projection-1" }],
      confirmPendingProjection: async () => true,
    };
    const store: ReviewReceiptStore = {
      readLedger: async () => ({ kind: "valid", ledgerVersion: 1, receipts }),
      appendReceipt: async () => ({ ledgerVersion: 2, durableEvidenceRef: "record-2" }),
    };
    const noTailStorage: LifecycleTailProofAdapter = {
      resolveLifecycleTail: async () => null,
    };
    const provider: ReviewProviderAdapter = {
      readCapacity: async () => capacity,
      request: async () => ({
        requestIdentity: "request-1",
        acknowledgedAt: "2026-07-10T20:00:00.000Z",
        trigger: {
          eventKind: "label",
          eventId: "trigger-1",
          actorIdentity: "actor-4",
          contentDigest: "a".repeat(64),
          occurredAt: "2026-07-10T20:00:00.000Z",
          headSha: "b".repeat(40),
        },
      }),
      observe: async () => [{
        schemaVersion: 1,
        requestIdentity: "request-1",
        sourceIdentity: "agent-9",
        observedAt: "2026-07-10T20:00:00.000Z",
        opaqueRef: "observation-1",
      }],
      normalizeEvidence: async () => evidence,
    };

    await expect(host.resolveChangeRequest("opaque-change-7")).resolves.toMatchObject({ changeRequest: change });
    await expect(host.resolveActorCapabilities({ login: "actor", expectedActorId: "actor-4" }))
      .resolves.toBe(capabilities);
    await expect(host.publishVerdict({
      hostRef: change.hostRef,
      headSha: change.headSha,
      changeSetId: change.changeSetId,
      projection,
      mode: "shadow",
      expectedAppId: "app-1",
      anchorReceiptCount: 1,
      readCurrentState: async () => ({ headSha: change.headSha, changeSetId: change.changeSetId }),
    })).resolves.toEqual([{ opaqueRef: "projection-1" }]);
    await expect(store.readLedger(change.changeRequestId)).resolves.toEqual({ kind: "valid", ledgerVersion: 1, receipts });
    await expect(store.appendReceipt(receipts[0]!.receipt, 1)).resolves.toMatchObject({ ledgerVersion: 2 });
    await expect(noTailStorage.resolveLifecycleTail({
      predicateId: "lifecycle-bookkeeping-tail/v1",
      reviewedThroughSha: "a".repeat(40),
      currentHeadSha: "a".repeat(40),
      reviewed: {
        baseRef: "main", diffBaseSha: "b".repeat(40), policyVersion: "c".repeat(64),
        rubricVersion: "independent-analysis/v1", sourceIdentity: "agent-1",
      },
      current: {
        baseRef: "main", diffBaseSha: "b".repeat(40), policyVersion: "c".repeat(64),
        rubricVersion: "independent-analysis/v1", sourceIdentity: "agent-1",
      },
    })).resolves.toBeNull();
    await expect(provider.readCapacity("agent-9")).resolves.toBe(capacity);
    await expect(provider.request(request)).resolves.toMatchObject({ requestIdentity: "request-1" });
  });

  it("keeps the core source independent of adapter and runner vocabulary", async () => {
    const coreDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../src/scripts/review-gate/core");
    const files = (await readdir(coreDir)).filter((name) => name.endsWith(".ts"));
    const source = (await Promise.all(files.map(async (name) => readFile(join(coreDir, name), "utf8")))).join("\n");

    expect(source).not.toMatch(/GitHub|Actions|CodeRabbit|PR[- _]?number|pullRequest|check[- _]?run|workflow|harness/iu);
    expect(source).not.toMatch(/\.\.\/(?:hosts|providers|runtime)\//u);
  });
});
