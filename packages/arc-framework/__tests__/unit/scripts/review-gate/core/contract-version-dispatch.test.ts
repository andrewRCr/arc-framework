import { describe, expect, it } from "vitest";

import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import {
  parseVersionedReceiptLedgerRecord,
  parseVersionedReviewReceipt,
  parseVersionedReviewRequest,
  parseVersionedReviewRequirement,
  parseVersionedReviewTarget,
  reviewContractVersionAt,
} from "../../../../../src/scripts/review-gate/core/contract-version-dispatch.js";
import {
  classifyForwardEvidenceEligibility,
  isForwardProjectionVersion,
} from "../../../../../src/scripts/review-gate/core/forward-evidence-eligibility.js";
import type { ReviewRequirement } from "../../../../../src/scripts/review-gate/core/contracts.js";
import type { ReviewRequest } from "../../../../../src/scripts/review-gate/core/execution.js";
import {
  createReviewReceipt,
  createReviewRequest,
  createReviewRequirement,
  createReviewTarget,
} from "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import { createReceipt } from "../../../../../src/scripts/review-gate/core/request-key.js";
import { INDEPENDENT_ANALYSIS_RUBRIC_IDENTITY } from "../../../../../src/scripts/review-gate/policy/independent-analysis.js";

const bareDigest = (character: string): string => character.repeat(64);
const objectId = (character: string): string => character.repeat(40);

function legacy() {
  const target = {
    schemaVersion: 1 as const,
    repositoryId: "repo-1",
    changeRequestId: "change-7",
    hostRef: "change-7",
    baseRef: "main",
    baseSha: objectId("a"),
    diffBaseSha: objectId("b"),
    headSha: objectId("c"),
    changeSetId: bareDigest("d"),
  };
  const requirement: ReviewRequirement = {
    schemaVersion: 1,
    id: "independent-analysis",
    kind: "independent-analysis",
    obligation: "required",
    acceptableSources: [{ sourceKind: "agent", qualifier: "independent-analysis/v1" }],
    count: 1,
    initialAdmission: "automatic",
    policyVersion: bareDigest("e"),
    rubricVersion: "independent-analysis/v1",
    reasons: ["reviewed-sensitive"],
    changeSetId: target.changeSetId,
    headSha: target.headSha,
  };
  const request: ReviewRequest = {
    schemaVersion: 1,
    repositoryId: target.repositoryId,
    changeRequestId: target.changeRequestId,
    changeSetId: target.changeSetId,
    policyVersion: requirement.policyVersion,
    semanticsVersion: "review-gate/v1",
    rubricVersion: requirement.rubricVersion,
    requirementId: requirement.id,
    sourceIdentity: "agent-1",
    coverage: "full",
    coverageFromSha: target.diffBaseSha,
    coverageThroughSha: target.headSha,
    generation: 0,
    actorIdentity: "controller-1",
    requestMechanism: "automatic",
    requiredActorIdentity: "controller-1",
    requestCommand: null,
  };
  const receipt = createReceipt({
    eventId: "event-1",
    previousLedgerVersion: 0,
    action: "reserved",
    request,
    result: null,
    evidenceUrlOrId: null,
    findingIds: [],
    payload: { kind: "reservation", reservedAt: null, pendingProjectionRef: null },
  });
  return { target, requirement, request, receipt };
}

function forward() {
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
  const request = createReviewRequest(target, {
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    repositoryId: target.repositoryId,
    targetId: target.targetId,
    requirementId: requirement.requirementId,
    carrier: { kind: "change-request", adapterId: "github", changeRequestId: "pull/7" },
    authorIdentity: "author-1",
    evaluatorIdentity: "evaluator-1",
    generation: 0,
    requestMechanism: "automatic",
  });
  const receipt = createReviewReceipt({
    target,
    requirement,
    request,
    applicabilityId: null,
    reviewRunId: "run-1",
    evaluatorIdentity: request.evaluatorIdentity,
    attestingRuntimeIdentity: "host-attestor",
    attestationMechanism: "github-app",
    providerEventIdentity: "event-1",
    result: "clean",
    findings: [],
  });
  return { target, requirement, request, receipt };
}

describe("review contract version dispatch", () => {
  it("keeps v1 exact records and v2 canonical records in separate parser families", () => {
    const v1 = legacy();
    const v2 = forward();

    expect(parseVersionedReviewTarget(v1.target)).toEqual({ version: 1, record: v1.target });
    expect(parseVersionedReviewRequirement(v1.requirement, v1.target)).toEqual({ version: 1, record: v1.requirement });
    expect(parseVersionedReviewRequest(v1.request, v1.target)).toEqual({ version: 1, record: v1.request });
    expect(parseVersionedReviewReceipt(v1)).toMatchObject({ version: 1, record: v1.receipt });
    expect(parseVersionedReviewTarget(v2.target)).toEqual({ version: 2, record: v2.target });
    expect(parseVersionedReviewRequirement(v2.requirement, v2.target)).toEqual({ version: 2, record: v2.requirement });
    expect(parseVersionedReviewRequest(v2.request, v2.target)).toEqual({ version: 2, record: v2.request });
    expect(parseVersionedReviewReceipt(v2)).toEqual({ version: 2, record: v2.receipt });
  });

  it("dispatches top-level legacy envelopes and forward repository ledgers without shape guessing", () => {
    const v1 = legacy();
    const envelope = {
      schemaVersion: 1,
      durableRecordId: "record-1",
      recordedAt: "2026-07-20T20:00:00.000Z",
      lastModifiedAt: "2026-07-20T20:00:00.000Z",
      ledgerVersion: 1,
      receipt: v1.receipt,
    };
    const v2 = forward();
    const ledger = {
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      repositoryId: v2.target.repositoryId,
      ledgerVersion: 1,
      receipts: [v2.receipt],
    };

    expect(parseVersionedReceiptLedgerRecord(envelope)).toMatchObject({ version: 1 });
    expect(parseVersionedReceiptLedgerRecord(ledger)).toEqual({ version: 2, record: ledger });
  });

  it("rejects unknown versions, mismatched semantics, mixed composites, and prefix coercion", () => {
    const v1 = legacy();
    const v2 = forward();

    expect(() => reviewContractVersionAt({ schemaVersion: 3 }, "record")).toThrow(/unsupported/u);
    expect(() => reviewContractVersionAt({ schemaVersion: 2, semanticsVersion: "review-gate/v1" }, "record"))
      .toThrow(/requires review-gate\/v2/u);
    expect(() => parseVersionedReviewRequest(v2.request, v1.target)).toThrow(/mixed/u);
    expect(() => parseVersionedReviewRequirement(v1.requirement, v2.target)).toThrow(/mixed/u);
    expect(() => parseVersionedReviewTarget({
      ...v1.target,
      changeSetId: canonicalDigest({ coerced: true }),
    })).toThrow(/lowercase hexadecimal/u);
  });

  it("keeps parsed legacy history out of every forward authority key", () => {
    const v1 = legacy();
    const v2 = forward();

    expect(classifyForwardEvidenceEligibility(v1)).toMatchObject({
      eligible: false,
      version: 1,
      reason: "legacy-audit-only",
      receipt: v1.receipt,
      requestReuseKey: null,
      sourceClosureIdentity: null,
    });
    expect(classifyForwardEvidenceEligibility(v2)).toMatchObject({
      eligible: true,
      version: 2,
      requestReuseKey: v2.request.requestId,
      sourceClosureIdentity: v2.request.evaluatorIdentity,
    });
    expect(isForwardProjectionVersion({ schemaVersion: 1 })).toBe(false);
    expect(isForwardProjectionVersion({ schemaVersion: 2, semanticsVersion: "review-gate/v2" })).toBe(true);
    expect(() => classifyForwardEvidenceEligibility({ ...v1, target: v2.target })).toThrow(/mixed/u);
    expect(() => classifyForwardEvidenceEligibility({
      ...v2,
      receipt: { ...v2.receipt, schemaVersion: 1 },
    })).toThrow();
    expect(() => isForwardProjectionVersion({ schemaVersion: 2 })).toThrow(/requires review-gate\/v2/u);
  });
});
