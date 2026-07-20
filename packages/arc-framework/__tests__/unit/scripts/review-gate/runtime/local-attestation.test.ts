import { describe, expect, it, vi } from "vitest";

import {
  createReviewRequirement,
  createReviewTarget,
} from "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import { createLocalChangeSetCarrier } from "../../../../../src/scripts/review-gate/core/local-carrier.js";
import type { ForwardReviewReceiptStore } from "../../../../../src/scripts/review-gate/core/ports.js";
import { attestLocalReviewResult } from "../../../../../src/scripts/review-gate/runtime/local-attestation.js";
import { INDEPENDENT_ANALYSIS_RUBRIC_IDENTITY } from "../../../../../src/scripts/review-gate/policy/independent-analysis.js";

const objectId = (character: string): string => character.repeat(40);

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
      obligation: "required",
      reasons: ["sensitive-change-set"],
      rubricVersion: INDEPENDENT_ANALYSIS_RUBRIC_IDENTITY.version,
      rubricDigest: INDEPENDENT_ANALYSIS_RUBRIC_IDENTITY.digest,
      retrigger: "full-final",
      count: 1,
    },
    acceptableSources: [{ sourceKind: "agent", qualifier: "independent-analysis/v1" }],
    initialAdmission: "automatic",
  });
  if (requirement === null) throw new Error("expected requirement");
  const carrier = createLocalChangeSetCarrier({
    target,
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
      runtimeIdentity: "local-attestor-1",
      mechanism: "local-runtime",
    },
    generation: 0,
    requestMechanism: "automatic",
  });
  const appendReceipt = vi.fn<ForwardReviewReceiptStore["appendReceipt"]>(async () => ({
    ledgerVersion: 1,
    durableEvidenceRef: "local:receipt-1",
  }));
  const store: ForwardReviewReceiptStore = {
    readReceipts: async () => ({ ledgerVersion: 0, receipts: [] }),
    appendReceipt,
  };
  const result = {
    status: "complete" as const,
    result: "clean" as const,
    targetId: target.targetId,
    headSha: target.headSha,
    headTree: target.headTree,
    rubricVersion: requirement.rubricVersion,
    rubricDigest: requirement.rubricDigest,
    evaluatorIdentity: carrier.request.evaluatorIdentity,
    reviewRunId: "run-1",
    applicabilityId: null,
  };
  return { target, requirement, carrier, store, appendReceipt, result };
}

describe("local review attestation", () => {
  it.each(["clean", "findings"] as const)("attests a complete exact-head %s result", async (result) => {
    const records = fixture();
    const receipt = await attestLocalReviewResult({
      ...records,
      result: { ...records.result, result },
      currentTarget: async () => records.target,
      runtimeIdentity: records.carrier.attestation.runtimeIdentity,
      attestationMechanism: records.carrier.attestation.mechanism,
      expectedLedgerVersion: 0,
    });

    expect(receipt).toMatchObject({ result, targetId: records.target.targetId });
    expect(records.appendReceipt).toHaveBeenCalledWith(receipt, 0);
  });

  it("rejects a stale current head without appending", async () => {
    const records = fixture();
    const stale = createReviewTarget({
      schemaVersion: records.target.schemaVersion,
      semanticsVersion: records.target.semanticsVersion,
      kind: records.target.kind,
      repositoryId: records.target.repositoryId,
      baseRef: records.target.baseRef,
      diffBaseSha: records.target.diffBaseSha,
      diffBaseTree: records.target.diffBaseTree,
      headSha: objectId("e"),
      headTree: objectId("f"),
    });
    await expect(attestLocalReviewResult({
      ...records,
      currentTarget: async () => stale,
      runtimeIdentity: records.carrier.attestation.runtimeIdentity,
      attestationMechanism: records.carrier.attestation.mechanism,
      expectedLedgerVersion: 0,
    })).rejects.toThrow(/current target/iu);
    expect(records.appendReceipt).not.toHaveBeenCalled();
  });

  it.each([
    ["partial", "clean"],
    ["unavailable", null],
    ["failed", null],
  ] as const)("refuses a %s run as terminal evidence", async (status, result) => {
    const records = fixture();
    await expect(attestLocalReviewResult({
      ...records,
      result: { ...records.result, status, result },
      currentTarget: async () => records.target,
      runtimeIdentity: records.carrier.attestation.runtimeIdentity,
      attestationMechanism: records.carrier.attestation.mechanism,
      expectedLedgerVersion: 0,
    })).rejects.toThrow(/not attestable/iu);
    expect(records.appendReceipt).not.toHaveBeenCalled();
  });

  it("rejects rubric, evaluator, and attesting-runtime mismatches", async () => {
    const records = fixture();
    const base = {
      ...records,
      currentTarget: async () => records.target,
      runtimeIdentity: records.carrier.attestation.runtimeIdentity,
      attestationMechanism: records.carrier.attestation.mechanism,
      expectedLedgerVersion: 0,
    };
    await expect(attestLocalReviewResult({
      ...base,
      result: { ...records.result, rubricDigest: `sha256:${"e".repeat(64)}` },
    })).rejects.toThrow(/rubric/iu);
    await expect(attestLocalReviewResult({
      ...base,
      result: { ...records.result, evaluatorIdentity: "author-1" },
    })).rejects.toThrow(/evaluator/iu);
    await expect(attestLocalReviewResult({ ...base, runtimeIdentity: "other-attestor" }))
      .rejects.toThrow(/attesting runtime/iu);
    expect(records.appendReceipt).not.toHaveBeenCalled();
  });
});
