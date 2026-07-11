/** Request, receipt, capacity, execution, and verdict contracts. */

import type { CoverageKind, EvidenceResult } from "./evidence.js";
import {
  arrayAt,
  digestAt,
  enumAt,
  exactKeys,
  integerAt,
  objectAt,
  schemaOneAt,
  stringAt,
} from "./validation.js";

/** Request admitted for one source and exact coverage range. */
export interface ReviewRequest {
  schemaVersion: 1;
  repositoryId: string;
  changeRequestId: string;
  changeSetId: string;
  policyVersion: string;
  rubricVersion: string;
  requirementId: string;
  sourceIdentity: string;
  coverage: CoverageKind;
  coverageFromSha: string;
  coverageThroughSha: string;
  generation: number;
  actorIdentity: string;
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
  action: "reserved" | "acknowledged" | "terminal-failure" | "dismissed" | "waived" | "attested";
  request: ReviewRequest;
  result: EvidenceResult | null;
  evidenceUrlOrId: string | null;
  findingIds: string[];
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

/** Host-neutral readiness projection. */
export interface GateProjection {
  schemaVersion: 1;
  conclusion: "pending" | "failure" | "success";
  summary: string;
  blockers: GateBlocker[];
  requirementExecutions: RequirementExecution[];
  receiptRefs: string[];
}

function timestampAt(value: unknown, path: string): string {
  const timestamp = stringAt(value, path);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(timestamp) || Number.isNaN(Date.parse(timestamp))) {
    throw new Error(`${path}: expected an ISO-8601 UTC timestamp`);
  }
  return timestamp;
}

function nullableAt<T>(value: unknown, path: string, parse: (input: unknown, path: string) => T): T | null {
  return value === null ? null : parse(value, path);
}

/** Validate a source-specific request identity. */
export function parseReviewRequest(input: unknown, path = "request"): ReviewRequest {
  const record = objectAt(input, path);
  exactKeys(record, [
    "schemaVersion", "repositoryId", "changeRequestId", "changeSetId", "policyVersion", "rubricVersion",
    "requirementId", "sourceIdentity", "coverage", "coverageFromSha", "coverageThroughSha", "generation",
    "actorIdentity",
  ], path);
  return {
    schemaVersion: schemaOneAt(record.schemaVersion, `${path}.schemaVersion`),
    repositoryId: stringAt(record.repositoryId, `${path}.repositoryId`),
    changeRequestId: stringAt(record.changeRequestId, `${path}.changeRequestId`),
    changeSetId: digestAt(record.changeSetId, `${path}.changeSetId`),
    policyVersion: digestAt(record.policyVersion, `${path}.policyVersion`),
    rubricVersion: stringAt(record.rubricVersion, `${path}.rubricVersion`),
    requirementId: stringAt(record.requirementId, `${path}.requirementId`),
    sourceIdentity: stringAt(record.sourceIdentity, `${path}.sourceIdentity`),
    coverage: enumAt(record.coverage, ["full", "incremental"], `${path}.coverage`),
    coverageFromSha: digestAt(record.coverageFromSha, `${path}.coverageFromSha`, 40),
    coverageThroughSha: digestAt(record.coverageThroughSha, `${path}.coverageThroughSha`, 40),
    generation: integerAt(record.generation, `${path}.generation`),
    actorIdentity: stringAt(record.actorIdentity, `${path}.actorIdentity`),
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

function parseReceipt(input: unknown, path: string): ReviewReceipt {
  const record = objectAt(input, path);
  exactKeys(record, [
    "schemaVersion", "eventId", "idempotencyKey", "previousLedgerVersion", "receiptHash", "action", "request",
    "result", "evidenceUrlOrId", "findingIds",
  ], path);
  return {
    schemaVersion: schemaOneAt(record.schemaVersion, `${path}.schemaVersion`),
    eventId: stringAt(record.eventId, `${path}.eventId`),
    idempotencyKey: stringAt(record.idempotencyKey, `${path}.idempotencyKey`),
    previousLedgerVersion: integerAt(record.previousLedgerVersion, `${path}.previousLedgerVersion`),
    receiptHash: digestAt(record.receiptHash, `${path}.receiptHash`),
    action: enumAt(
      record.action,
      ["reserved", "acknowledged", "terminal-failure", "dismissed", "waived", "attested"],
      `${path}.action`,
    ),
    request: parseReviewRequest(record.request, `${path}.request`),
    result: nullableAt(record.result, `${path}.result`, (value, itemPath) =>
      enumAt(value, ["clean", "findings", "failed", "unavailable"], itemPath)),
    evidenceUrlOrId: nullableAt(record.evidenceUrlOrId, `${path}.evidenceUrlOrId`, stringAt),
    findingIds: arrayAt(record.findingIds, `${path}.findingIds`, stringAt),
  };
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
    receipt: parseReceipt(record.receipt, `${path}.receipt`),
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

/** Validate a neutral readiness projection. */
export function parseGateProjection(input: unknown): GateProjection {
  const path = "projection";
  const record = objectAt(input, path);
  exactKeys(record, ["schemaVersion", "conclusion", "summary", "blockers", "requirementExecutions", "receiptRefs"], path);
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
  };
}
