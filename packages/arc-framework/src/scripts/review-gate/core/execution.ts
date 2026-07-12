/** Request, receipt, capacity, execution, and verdict contracts. */

import { parseEvidence, type CoverageKind, type Evidence, type EvidenceResult } from "./evidence.js";
import {
  parseReviewReceiptPayload,
  type RequestMechanism,
  type ReviewReceiptPayload,
} from "./receipt-payload.js";
import {
  arrayAt,
  digestAt,
  enumAt,
  exactKeys,
  integerAt,
  objectAt,
  schemaOneAt,
  stringAt,
  timestampAt,
} from "./validation.js";

/** Stable request contract identity. */
export const REVIEW_REQUEST_CONTRACT = "arc.review-request";
/** Initial live request schema. */
export const REVIEW_REQUEST_SCHEMA_VERSION = 1;
/** Stable receipt contract identity. */
export const REVIEW_RECEIPT_CONTRACT = "arc.review-receipt";
/** Initial live receipt schema. */
export const REVIEW_RECEIPT_SCHEMA_VERSION = 1;
/** Current neutral semantics bound into request identity. */
export const REVIEW_SEMANTICS_VERSION = "review-gate/v1";

export type { RequestMechanism, ReviewReceiptPayload } from "./receipt-payload.js";

/** Request admitted for one source and exact coverage range. */
export interface ReviewRequest {
  schemaVersion: 1;
  repositoryId: string;
  changeRequestId: string;
  changeSetId: string;
  policyVersion: string;
  semanticsVersion: string;
  rubricVersion: string;
  requirementId: string;
  sourceIdentity: string;
  coverage: CoverageKind;
  coverageFromSha: string;
  coverageThroughSha: string;
  generation: number;
  actorIdentity: string;
  requestMechanism: RequestMechanism;
  requiredActorIdentity: string;
  requestCommand: string | null;
}

/** Capacity state for a candidate source. */
export interface SourceCapacity {
  schemaVersion: 1;
  sourceIdentity: string;
  status: "available" | "exhausted" | "unknown";
  reason: "provider-reported" | "not-observable" | "lookup-failed";
  provenance: string;
  observedAt: string;
}

/** Durable transition recorded around a request or explicit decision. */
export interface ReviewReceipt {
  schemaVersion: 1;
  eventId: string;
  idempotencyKey: string;
  previousLedgerVersion: number;
  receiptHash: string;
  action:
    | "reserved" | "acknowledged" | "terminal-failure" | "required" | "dismissed" | "waived"
    | "attested" | "unadmitted" | "finding-opened" | "finding-settled" | "contaminated" | "superseded"
    | "running" | "abandoned" | "begin-fix" | "head-update-consumed" | "trigger-deleted";
  request: ReviewRequest;
  result: EvidenceResult | null;
  reason: string | null;
  evidenceUrlOrId: string | null;
  findingIds: string[];
  payload: ReviewReceiptPayload;
  evidence?: Evidence;
}

/** Store-validated envelope around one receipt. */
export interface ReceiptEnvelope {
  schemaVersion: 1;
  durableRecordId: string;
  recordedAt: string;
  lastModifiedAt: string;
  ledgerVersion: number;
  receipt: ReviewReceipt;
}

/** Reduced execution state for one requirement. */
export type RequirementExecutionState =
  | "not-requested"
  | "queued"
  | "running"
  | "clean"
  | "findings"
  | "failed"
  | "unavailable"
  | "waived"
  | "stale";

/** Requirement state exposed through the neutral projection. */
export interface RequirementExecution {
  requirementId: string;
  state: RequirementExecutionState;
  sourceIdentity: string | null;
  detail: string;
}

/** Machine-readable blocker in a verdict. */
export interface GateBlocker {
  code: string;
  detail: string;
}

/** Policy facts retained in the neutral projection. */
export interface PolicyDecisionProjection {
  lane: "auto" | "reviewed";
  reviewRisk: "routine" | "sensitive";
  disposition: "required" | "recommended" | "exempt";
  reasons: string[];
  policyVersion: string;
}

/** Evidence detail retained for a requirement summary. */
export interface GateEvidenceProjection {
  requirementId: string;
  sourceIdentity: string;
  coverage: "full" | "incremental";
  evidenceRef: string;
}

/** Host-neutral readiness projection. */
export interface GateProjection {
  schemaVersion: 1;
  conclusion: "pending" | "failure" | "success";
  summary: string;
  blockers: GateBlocker[];
  requirementExecutions: RequirementExecution[];
  receiptRefs: string[];
  policyDecision: PolicyDecisionProjection;
  ciState: "pending" | "failure" | "success";
  ledgerVersion: number | null;
  evidence: GateEvidenceProjection[];
}

function nullableAt<T>(value: unknown, path: string, parse: (input: unknown, path: string) => T): T | null {
  return value === null ? null : parse(value, path);
}

/** Validate a source-specific request identity. */
export function parseReviewRequest(input: unknown, path = "request"): ReviewRequest {
  const record = objectAt(input, path);
  exactKeys(record, [
    "schemaVersion", "repositoryId", "changeRequestId", "changeSetId", "policyVersion", "semanticsVersion", "rubricVersion",
    "requirementId", "sourceIdentity", "coverage", "coverageFromSha", "coverageThroughSha", "generation",
    "actorIdentity", "requestMechanism", "requiredActorIdentity", "requestCommand",
  ], path);
  const requestMechanism = enumAt(
    record.requestMechanism,
    ["automatic", "user-trigger", "authorized-command", "attestation"],
    `${path}.requestMechanism`,
  );
  const requestCommand = nullableAt(record.requestCommand, `${path}.requestCommand`, stringAt);
  if ((requestMechanism === "user-trigger") !== (requestCommand !== null)) {
    throw new Error(`${path}: user-trigger mechanism and request command are incongruent`);
  }
  return {
    schemaVersion: schemaOneAt(record.schemaVersion, `${path}.schemaVersion`),
    repositoryId: stringAt(record.repositoryId, `${path}.repositoryId`),
    changeRequestId: stringAt(record.changeRequestId, `${path}.changeRequestId`),
    changeSetId: digestAt(record.changeSetId, `${path}.changeSetId`),
    policyVersion: digestAt(record.policyVersion, `${path}.policyVersion`),
    semanticsVersion: stringAt(record.semanticsVersion, `${path}.semanticsVersion`),
    rubricVersion: stringAt(record.rubricVersion, `${path}.rubricVersion`),
    requirementId: stringAt(record.requirementId, `${path}.requirementId`),
    sourceIdentity: stringAt(record.sourceIdentity, `${path}.sourceIdentity`),
    coverage: enumAt(record.coverage, ["full", "incremental"], `${path}.coverage`),
    coverageFromSha: digestAt(record.coverageFromSha, `${path}.coverageFromSha`, 40),
    coverageThroughSha: digestAt(record.coverageThroughSha, `${path}.coverageThroughSha`, 40),
    generation: integerAt(record.generation, `${path}.generation`),
    actorIdentity: stringAt(record.actorIdentity, `${path}.actorIdentity`),
    requestMechanism,
    requiredActorIdentity: stringAt(record.requiredActorIdentity, `${path}.requiredActorIdentity`),
    requestCommand,
  };
}

/** Validate source capacity and its reason pairing. */
export function parseCapacity(input: unknown): SourceCapacity {
  const path = "capacity";
  const record = objectAt(input, path);
  exactKeys(record, ["schemaVersion", "sourceIdentity", "status", "reason", "provenance", "observedAt"], path);
  const status = enumAt(record.status, ["available", "exhausted", "unknown"], `${path}.status`);
  const reason = enumAt(record.reason, ["provider-reported", "not-observable", "lookup-failed"], `${path}.reason`);
  if ((status === "unknown") !== (reason !== "provider-reported")) {
    throw new Error(`${path}: status and reason do not form a valid pair`);
  }
  return {
    schemaVersion: schemaOneAt(record.schemaVersion, `${path}.schemaVersion`),
    sourceIdentity: stringAt(record.sourceIdentity, `${path}.sourceIdentity`),
    status,
    reason,
    provenance: stringAt(record.provenance, `${path}.provenance`),
    observedAt: timestampAt(record.observedAt, `${path}.observedAt`),
  };
}

/** Validate one receipt before storage or reduction. */
export function parseReviewReceipt(input: unknown, path = "receipt"): ReviewReceipt {
  const record = objectAt(input, path);
  exactKeys(record, [
    "schemaVersion", "eventId", "idempotencyKey", "previousLedgerVersion", "receiptHash", "action", "request",
    "result", "reason", "evidenceUrlOrId", "findingIds", "payload", "evidence",
  ], path);
  const action = enumAt(
    record.action,
    [
      "reserved", "acknowledged", "terminal-failure", "required", "dismissed", "waived", "attested", "unadmitted",
      "finding-opened", "finding-settled", "contaminated", "superseded", "running", "abandoned", "begin-fix",
      "head-update-consumed", "trigger-deleted",
    ],
    `${path}.action`,
  );
  const request = parseReviewRequest(record.request, `${path}.request`);
  const result = nullableAt(record.result, `${path}.result`, (value, itemPath) =>
    enumAt(value, ["clean", "findings", "failed", "unavailable"], itemPath));
  const evidenceUrlOrId = nullableAt(record.evidenceUrlOrId, `${path}.evidenceUrlOrId`, stringAt);
  const findingIds = arrayAt(record.findingIds, `${path}.findingIds`, stringAt);
  const payload = parseReviewReceiptPayload(record.payload, `${path}.payload`);
  const evidence = record.evidence === undefined ? undefined : parseEvidence(record.evidence);
  const attestationAction = action === "attested" || action === "unadmitted";
  if (attestationAction !== (evidence !== undefined)) {
    throw new Error(`${path}.evidence: required only for attestation receipts`);
  }
  if (evidence !== undefined) validateReceiptEvidenceCongruence({ request, result, evidenceUrlOrId, findingIds }, evidence, path);
  validatePayloadCongruence({ action, request, result, evidenceUrlOrId, findingIds, payload }, path);
  return {
    schemaVersion: schemaOneAt(record.schemaVersion, `${path}.schemaVersion`),
    eventId: stringAt(record.eventId, `${path}.eventId`),
    idempotencyKey: stringAt(record.idempotencyKey, `${path}.idempotencyKey`),
    previousLedgerVersion: integerAt(record.previousLedgerVersion, `${path}.previousLedgerVersion`),
    receiptHash: digestAt(record.receiptHash, `${path}.receiptHash`),
    action,
    request,
    result,
    reason: nullableAt(record.reason, `${path}.reason`, stringAt),
    evidenceUrlOrId,
    findingIds,
    payload,
    ...(evidence === undefined ? {} : { evidence }),
  };
}

function validatePayloadCongruence(
  receipt: Pick<ReviewReceipt, "action" | "request" | "result" | "evidenceUrlOrId" | "findingIds" | "payload">,
  path: string,
): void {
  const expected = receipt.action === "reserved"
    ? "reservation"
    : receipt.action === "acknowledged"
      ? "acknowledgement"
      : ["attested", "unadmitted", "terminal-failure"].includes(receipt.action)
        ? "terminal-evidence"
        : ["finding-opened", "finding-settled"].includes(receipt.action)
          ? "finding-lifecycle"
          : receipt.action === "contaminated"
            ? "contamination"
            : receipt.action === "superseded"
              ? "supersession"
              : ["running", "abandoned"].includes(receipt.action)
                ? "flight-state"
                : receipt.action === "begin-fix"
                  ? "head-update-authorization"
                  : receipt.action === "head-update-consumed"
                    ? "head-update-consumption"
                    : receipt.action === "trigger-deleted" ? "trigger-deleted" : "decision";
  const payload = receipt.payload;
  if (payload.kind !== expected) throw new Error(`${path}.payload: action mismatch`);
  if (payload.kind === "acknowledgement") {
    if (payload.trigger.mechanism !== receipt.request.requestMechanism) {
      throw new Error(`${path}.payload: mechanism mismatch`);
    }
    if (payload.trigger.actorIdentity !== receipt.request.requiredActorIdentity) {
      throw new Error(`${path}.payload: actor identity mismatch`);
    }
    if (payload.trigger.headSha !== receipt.request.coverageThroughSha) throw new Error(`${path}.payload: head mismatch`);
    if (payload.acknowledgementRef !== receipt.evidenceUrlOrId) throw new Error(`${path}.payload: reference mismatch`);
  }
  if (payload.kind === "terminal-evidence") {
    if (!sameStrings(payload.findingIds, receipt.findingIds)) throw new Error(`${path}.payload: finding mismatch`);
    if (receipt.evidenceUrlOrId !== null && !payload.evidenceRefs.includes(receipt.evidenceUrlOrId)) {
      throw new Error(`${path}.payload: terminal evidence mismatch`);
    }
  }
  if (payload.kind === "finding-lifecycle") {
    if (payload.origin.sourceIdentity !== receipt.request.sourceIdentity) {
      throw new Error(`${path}.payload: source identity mismatch`);
    }
    if (payload.origin.headSha !== receipt.request.coverageThroughSha) {
      throw new Error(`${path}.payload: origin head mismatch`);
    }
    if (!receipt.findingIds.includes(payload.findingId)) throw new Error(`${path}.payload: finding identity mismatch`);
  }
  if (payload.kind === "flight-state" && payload.state !== receipt.action) {
    throw new Error(`${path}.payload: flight state mismatch`);
  }
  if (payload.kind === "flight-state" && payload.evidenceRef !== receipt.evidenceUrlOrId) {
    throw new Error(`${path}.payload: reference mismatch`);
  }
  if (payload.kind === "head-update-authorization") {
    if (payload.oldHeadSha !== receipt.request.coverageThroughSha) throw new Error(`${path}.payload: old head mismatch`);
    if (!sameStrings(payload.findingIds, receipt.findingIds)) throw new Error(`${path}.payload: finding mismatch`);
  }
  if (payload.kind === "head-update-consumption") {
    if (payload.oldHeadSha !== receipt.request.coverageThroughSha) throw new Error(`${path}.payload: old head mismatch`);
    if (!sameStrings(payload.findingIds, receipt.findingIds)) throw new Error(`${path}.payload: finding mismatch`);
  }
  if (payload.kind === "trigger-deleted") {
    if (payload.observedHeadSha !== receipt.request.coverageThroughSha) throw new Error(`${path}.payload: head mismatch`);
    if (payload.providerIdentity !== receipt.request.sourceIdentity) throw new Error(`${path}.payload: provider mismatch`);
    if (payload.authenticatedEventRef !== receipt.evidenceUrlOrId) throw new Error(`${path}.payload: reference mismatch`);
    if (receipt.result !== null || receipt.findingIds.length > 0) throw new Error(`${path}.payload: result mismatch`);
  }
}

function sameStrings(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function validateReceiptEvidenceCongruence(
  receipt: Pick<ReviewReceipt, "request" | "result" | "evidenceUrlOrId" | "findingIds">,
  evidence: Evidence,
  path: string,
): void {
  const request = receipt.request;
  const identitiesMatch = evidence.requirementId === request.requirementId
    && evidence.sourceIdentity === request.sourceIdentity
    && evidence.changeSetId === request.changeSetId
    && evidence.policyVersion === request.policyVersion
    && evidence.rubricVersion === request.rubricVersion
    && evidence.coverage === request.coverage
    && evidence.coverageFromSha === request.coverageFromSha
    && evidence.coverageThroughSha === request.coverageThroughSha;
  if (!identitiesMatch) throw new Error(`${path}.evidence: request identity mismatch`);
  if (evidence.submitterIdentity !== undefined && evidence.submitterIdentity !== request.requiredActorIdentity) {
    throw new Error(`${path}.evidence: actor identity mismatch`);
  }
  if (evidence.result !== receipt.result) throw new Error(`${path}.evidence: result mismatch`);
  if (evidence.evidenceUrlOrId !== receipt.evidenceUrlOrId) throw new Error(`${path}.evidence: reference mismatch`);
  const evidenceFindingIds = evidence.findings.map((finding) => finding.findingId);
  if (
    evidenceFindingIds.length !== receipt.findingIds.length
    || evidenceFindingIds.some((findingId, index) => findingId !== receipt.findingIds[index])
  ) throw new Error(`${path}.evidence: finding identity mismatch`);
}

/** Validate a receipt and its storage-assigned envelope. */
export function parseReceiptEnvelope(input: unknown): ReceiptEnvelope {
  const path = "envelope";
  const record = objectAt(input, path);
  exactKeys(record, ["schemaVersion", "durableRecordId", "recordedAt", "lastModifiedAt", "ledgerVersion", "receipt"], path);
  return {
    schemaVersion: schemaOneAt(record.schemaVersion, `${path}.schemaVersion`),
    durableRecordId: stringAt(record.durableRecordId, `${path}.durableRecordId`),
    recordedAt: timestampAt(record.recordedAt, `${path}.recordedAt`),
    lastModifiedAt: timestampAt(record.lastModifiedAt, `${path}.lastModifiedAt`),
    ledgerVersion: integerAt(record.ledgerVersion, `${path}.ledgerVersion`),
    receipt: parseReviewReceipt(record.receipt, `${path}.receipt`),
  };
}

function parseBlocker(input: unknown, path: string): GateBlocker {
  const record = objectAt(input, path);
  exactKeys(record, ["code", "detail"], path);
  return { code: stringAt(record.code, `${path}.code`), detail: stringAt(record.detail, `${path}.detail`) };
}

function parseRequirementExecution(input: unknown, path: string): RequirementExecution {
  const record = objectAt(input, path);
  exactKeys(record, ["requirementId", "state", "sourceIdentity", "detail"], path);
  return {
    requirementId: stringAt(record.requirementId, `${path}.requirementId`),
    state: enumAt(record.state, [
      "not-requested", "queued", "running", "clean", "findings", "failed", "unavailable", "waived", "stale",
    ], `${path}.state`),
    sourceIdentity: nullableAt(record.sourceIdentity, `${path}.sourceIdentity`, stringAt),
    detail: stringAt(record.detail, `${path}.detail`),
  };
}

function parsePolicyDecision(input: unknown, path: string): PolicyDecisionProjection {
  const record = objectAt(input, path);
  exactKeys(record, ["lane", "reviewRisk", "disposition", "reasons", "policyVersion"], path);
  return {
    lane: enumAt(record.lane, ["auto", "reviewed"], `${path}.lane`),
    reviewRisk: enumAt(record.reviewRisk, ["routine", "sensitive"], `${path}.reviewRisk`),
    disposition: enumAt(record.disposition, ["required", "recommended", "exempt"], `${path}.disposition`),
    reasons: arrayAt(record.reasons, `${path}.reasons`, stringAt),
    policyVersion: digestAt(record.policyVersion, `${path}.policyVersion`),
  };
}

function parseGateEvidence(input: unknown, path: string): GateEvidenceProjection {
  const record = objectAt(input, path);
  exactKeys(record, ["requirementId", "sourceIdentity", "coverage", "evidenceRef"], path);
  return {
    requirementId: stringAt(record.requirementId, `${path}.requirementId`),
    sourceIdentity: stringAt(record.sourceIdentity, `${path}.sourceIdentity`),
    coverage: enumAt(record.coverage, ["full", "incremental"], `${path}.coverage`),
    evidenceRef: stringAt(record.evidenceRef, `${path}.evidenceRef`),
  };
}

/** Validate a neutral readiness projection. */
export function parseGateProjection(input: unknown): GateProjection {
  const path = "projection";
  const record = objectAt(input, path);
  exactKeys(record, [
    "schemaVersion", "conclusion", "summary", "blockers", "requirementExecutions", "receiptRefs",
    "policyDecision", "ciState", "ledgerVersion", "evidence",
  ], path);
  return {
    schemaVersion: schemaOneAt(record.schemaVersion, `${path}.schemaVersion`),
    conclusion: enumAt(record.conclusion, ["pending", "failure", "success"], `${path}.conclusion`),
    summary: stringAt(record.summary, `${path}.summary`),
    blockers: arrayAt(record.blockers, `${path}.blockers`, parseBlocker),
    requirementExecutions: arrayAt(
      record.requirementExecutions,
      `${path}.requirementExecutions`,
      parseRequirementExecution,
    ),
    receiptRefs: arrayAt(record.receiptRefs, `${path}.receiptRefs`, stringAt),
    policyDecision: parsePolicyDecision(record.policyDecision, `${path}.policyDecision`),
    ciState: enumAt(record.ciState, ["pending", "failure", "success"], `${path}.ciState`),
    ledgerVersion: nullableAt(record.ledgerVersion, `${path}.ledgerVersion`, integerAt),
    evidence: arrayAt(record.evidence, `${path}.evidence`, parseGateEvidence),
  };
}
