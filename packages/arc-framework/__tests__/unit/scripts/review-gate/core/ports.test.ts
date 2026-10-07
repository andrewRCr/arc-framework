import { readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";

import type {
  ApprovedDispositionRecord,
  FrontlineOutcomeRecord,
} from "../../../../../src/scripts/review-gate/core/advisory-records.js";
import type {
  ReviewReceiptV2,
} from "../../../../../src/scripts/review-gate/core/gate-contract-v2-schema.js";
import type { LocalReviewSource } from "../../../../../src/scripts/review-gate/core/local-review-source.js";
import type { ReviewOperationState } from "../../../../../src/scripts/review-gate/core/operation-state-schema.js";
import type {
  ApprovedDispositionRecordStore,
  ForwardReviewReceiptStore,
  FrontlineOutcomeStore,
  LocalReviewSourceStore,
  ReviewOperationStateStore,
  ReviewReductionPort,
} from "../../../../../src/scripts/review-gate/core/ports.js";
import type { ReviewReduceEnvelope } from "../../../../../src/scripts/review-gate/core/review-command-envelope.js";

describe("review adapter ports", () => {
  it("accepts fixture adapters for the live advisory record families", async () => {
    const receipt: ReviewReceiptV2 = {
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      requestId: canonicalDigest({ request: "fixture" }),
      targetId: canonicalDigest({ target: "fixture" }),
      requirementId: canonicalDigest({ requirement: "fixture" }),
      applicabilityId: null,
      reviewRunId: "run-1",
      evaluatorIdentity: "reviewer-1",
      attestingRuntimeIdentity: "runtime-1",
      attestationMechanism: "test",
      providerEventIdentity: null,
      rubricVersion: "standard-review/v1",
      rubricDigest: canonicalDigest({ rubric: "fixture" }),
      result: "clean",
      findings: [],
    };
    const operation = { operationId: "operation-1" } as ReviewOperationState;
    const source = { sourceRef: "source-1" } as unknown as LocalReviewSource;
    const disposition = { operationId: "operation-1" } as ApprovedDispositionRecord;
    const outcome = { operationId: "operation-1" } as FrontlineOutcomeRecord;
    const reduction = { state: "advisory-complete" } as ReviewReduceEnvelope;

    const forwardStore: ForwardReviewReceiptStore = {
      readReceipts: async () => ({ ledgerVersion: 1, receipts: [receipt] }),
      appendReceipt: async () => ({ ledgerVersion: 1, durableEvidenceRef: "forward-receipt-1" }),
    };
    const operationStore: ReviewOperationStateStore = {
      readOperation: async () => ({ version: 1, state: operation }),
      publishOperation: async () => ({ version: 2 }),
    };
    const sourceStore: LocalReviewSourceStore = {
      readSource: async () => source,
      appendSource: async () => ({ sourceRef: "source-1" }),
    };
    const dispositionStore: ApprovedDispositionRecordStore = {
      readDispositionRecord: async () => disposition,
      appendDispositionRecord: async () => ({ dispositionRecordRef: "disposition-1" }),
    };
    const outcomeStore: FrontlineOutcomeStore = {
      readOutcome: async () => ({ version: 1, record: outcome, outcomeRef: "outcome-1" }),
      appendOutcome: async () => ({ version: 2, outcomeRef: "outcome-2" }),
    };
    const reductionPort: ReviewReductionPort = {
      reduce: async () => reduction,
    };

    await expect(forwardStore.readReceipts(receipt.targetId)).resolves.toEqual({
      ledgerVersion: 1,
      receipts: [receipt],
    });
    await expect(operationStore.readOperation("operation-1")).resolves.toEqual({ version: 1, state: operation });
    await expect(sourceStore.readSource("source-1")).resolves.toBe(source);
    await expect(dispositionStore.readDispositionRecord("operation-1")).resolves.toBe(disposition);
    await expect(outcomeStore.readOutcome("operation-1")).resolves.toMatchObject({ record: outcome });
    await expect(reductionPort.reduce("operation-1")).resolves.toBe(reduction);
  });

  it("keeps the core source independent of adapter and runner vocabulary", async () => {
    const coreDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../src/scripts/review-gate/core");
    const files = (await readdir(coreDir)).filter((name) => name.endsWith(".ts"));
    const source = (await Promise.all(files.map(async (name) => readFile(join(coreDir, name), "utf8")))).join("\n");

    expect(source).not.toMatch(/GitHub|CodeRabbit|PR[- _]?number|pullRequest|check[- _]?run|workflow|harness/iu);
    expect(source).not.toMatch(/\.\.\/(?:hosts|providers|runtime)\//u);
  });

});
