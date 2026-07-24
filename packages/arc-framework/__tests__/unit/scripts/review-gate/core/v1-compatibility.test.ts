import { describe, expect, it } from "vitest";

import {
  parseNormalizedChangeRequest,
  parseReviewRequirement,
  type ReviewRequirement,
} from "../../../../../src/scripts/review-gate/core/contracts.js";
import {
  parseGateProjection,
  parseReceiptEnvelope,
  parseReviewRequest,
  type GateProjection,
  type ReviewRequest,
} from "../../../../../src/scripts/review-gate/core/execution.js";
import { createReceipt } from "../../../../../src/scripts/review-gate/core/request-key.js";
import { validateReceiptLedger } from "../../../../../src/scripts/review-gate/core/receipt-ledger.js";
import { evaluateRequirements } from "../../../../../src/scripts/review-gate/core/requirements.js";
import { parseEvidence } from "../../../../../src/scripts/review-gate/core/evidence.js";

const bareDigest = (character: string): string => character.repeat(64);
const gitSha = (character: string): string => character.repeat(40);

const changeRequest = {
  schemaVersion: 1,
  repositoryId: "repo-1",
  changeRequestId: "change-7",
  hostRef: "opaque-change-7",
  baseRef: "main",
  baseSha: gitSha("a"),
  diffBaseSha: gitSha("b"),
  headSha: gitSha("c"),
  changeSetId: bareDigest("d"),
} as const;

const requirement: ReviewRequirement = {
  schemaVersion: 1,
  id: "standard-review",
  kind: "standard-review",
  obligation: "required",
  acceptableSources: [{ sourceKind: "agent", qualifier: "standard-review/v1" }],
  count: 1,
  initialAdmission: "automatic",
  policyVersion: bareDigest("e"),
  rubricVersion: "standard-review/v1",
  reasons: ["reviewed-sensitive"],
  changeSetId: changeRequest.changeSetId,
  headSha: changeRequest.headSha,
};

const request: ReviewRequest = {
  schemaVersion: 1,
  repositoryId: changeRequest.repositoryId,
  changeRequestId: changeRequest.changeRequestId,
  changeSetId: changeRequest.changeSetId,
  policyVersion: requirement.policyVersion,
  semanticsVersion: "review-gate/v1",
  rubricVersion: requirement.rubricVersion,
  requirementId: requirement.id,
  sourceIdentity: "agent-9",
  coverage: "full",
  coverageFromSha: changeRequest.diffBaseSha,
  coverageThroughSha: changeRequest.headSha,
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

const envelope = {
  schemaVersion: 1 as const,
  durableRecordId: "record-1",
  recordedAt: "2026-07-10T20:00:00.000Z",
  lastModifiedAt: "2026-07-10T20:00:00.000Z",
  ledgerVersion: 1,
  receipt,
};

const projection: GateProjection = {
  schemaVersion: 1,
  conclusion: "pending",
  summary: "review pending",
  blockers: [],
  requirementExecutions: [{
    requirementId: requirement.id,
    state: "queued",
    sourceIdentity: request.sourceIdentity,
    detail: "awaiting source",
  }],
  receiptRefs: [envelope.durableRecordId],
  policyDecision: {
    lane: "reviewed",
    reviewRisk: "sensitive",
    disposition: "required",
    reasons: requirement.reasons,
    policyVersion: requirement.policyVersion,
  },
  ciState: "success",
  ledgerVersion: 1,
  evidence: [],
};

describe("schema-v1 compatibility boundary", () => {
  it("keeps every legacy record family readable with exact bare identities", () => {
    expect(parseNormalizedChangeRequest(changeRequest)).toEqual(changeRequest);
    expect(parseReviewRequirement(requirement)).toEqual(requirement);
    expect(parseReviewRequest(request)).toEqual(request);
    expect(parseReceiptEnvelope(envelope)).toEqual(envelope);
    expect(parseGateProjection(projection)).toEqual(projection);
    expect(validateReceiptLedger({
      envelopes: [envelope],
      anchorVersion: 1,
      anchorCount: 1,
    })).toMatchObject({ valid: true, ledgerVersion: 1, receipts: [receipt] });
  });

  it("retains legacy satisfaction only inside the schema-v1 requirement family", () => {
    const reduction = evaluateRequirements({
      requirements: [requirement],
      candidates: [{
        requirementId: requirement.id,
        sourceKind: "agent",
        qualifier: "standard-review/v1",
        sourceIdentity: request.sourceIdentity,
      }],
      nativeReview: { requestedChanges: false, unresolvedRequiredConversations: 0 },
    });

    expect(reduction).toMatchObject({
      blockers: [],
      evaluations: [{ satisfied: true, satisfiedBy: [request.sourceIdentity] }],
    });
  });

  it.each([
    ["change request", () => parseNormalizedChangeRequest({ ...changeRequest, extra: true })],
    ["requirement", () => parseReviewRequirement({ ...requirement, extra: true })],
    ["request", () => parseReviewRequest({ ...request, extra: true })],
    ["receipt", () => parseReceiptEnvelope({ ...envelope, receipt: { ...receipt, extra: true } })],
    ["projection", () => parseGateProjection({ ...projection, extra: true })],
  ])("preserves exact keys for the %s parser", (_family, parse) => {
    expect(parse).toThrow(/unknown field/u);
  });

  it.each([
    ["change-set ID", () => parseNormalizedChangeRequest({
      ...changeRequest,
      changeSetId: `sha256:${changeRequest.changeSetId}`,
    })],
    ["policy version", () => parseReviewRequirement({
      ...requirement,
      policyVersion: `sha256:${requirement.policyVersion}`,
    })],
    ["request identity", () => parseReviewRequest({
      ...request,
      changeSetId: `sha256:${request.changeSetId}`,
    })],
    ["receipt hash", () => parseReceiptEnvelope({
      ...envelope,
      receipt: { ...receipt, receiptHash: `sha256:${receipt.receiptHash}` },
    })],
    ["projection policy", () => parseGateProjection({
      ...projection,
      policyDecision: {
        ...projection.policyDecision,
        policyVersion: `sha256:${projection.policyDecision.policyVersion}`,
      },
    })],
  ])("does not coerce canonical prefixes onto the v1 %s", (_field, parse) => {
    expect(parse).toThrow(/lowercase hexadecimal/u);
  });

  it.each(["critical", "high", "medium", "low", "info"] as const)(
    "preserves the legacy %s provider severity without forward normalization",
    (severity) => {
      const evidence = parseEvidence({
        schemaVersion: 1,
        requirementId: requirement.id,
        sourceKind: "agent",
        sourceIdentity: "agent-9",
        result: "findings",
        evidenceUrlOrId: "review:1",
        policyVersion: requirement.policyVersion,
        rubricVersion: requirement.rubricVersion,
        coverage: "full",
        coverageFromSha: changeRequest.diffBaseSha,
        coverageThroughSha: changeRequest.headSha,
        baseRef: changeRequest.baseRef,
        diffBaseSha: changeRequest.diffBaseSha,
        changeSetId: changeRequest.changeSetId,
        headSha: changeRequest.headSha,
        findings: [{ findingId: "finding-1", severity, locus: "src/a.ts:1", evidenceUrlOrId: "review:1" }],
        closures: [],
        observedAt: "2026-07-20T20:00:00.000Z",
      });
      expect(evidence.findings[0]?.severity).toBe(severity);
    },
  );
});
