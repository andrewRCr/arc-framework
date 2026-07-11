/** Normalized review evidence, findings, and closure records. */

import type { SourceKind } from "./contracts.js";
import {
  arrayAt,
  digestAt,
  enumAt,
  exactKeys,
  objectAt,
  optionalAt,
  schemaOneAt,
  stringAt,
} from "./validation.js";

/** Result reported by a qualified source. */
export type EvidenceResult = "clean" | "findings" | "failed" | "unavailable";
/** Coverage relationship to the observed change. */
export type CoverageKind = "full" | "incremental";
/** Finding severity retained for policy reduction. */
export type FindingSeverity = "critical" | "high" | "medium" | "low" | "info";
/** Authority capable of closing a finding. */
export type ClosureAuthorityKind = "source-confirmed" | "authorized-dismissal" | "host-native";

/** One stable source-scoped finding. */
export interface ReviewFinding {
  findingId: string;
  severity: FindingSeverity;
  locus: string;
  evidenceUrlOrId: string;
}

/** An authenticated closure for one known finding. */
export interface FindingClosure {
  findingId: string;
  authorityKind: ClosureAuthorityKind;
  authorityIdentity: string;
  evidenceUrlOrId: string;
}

/** Source evidence bound to one requirement and exact change set. */
export interface Evidence {
  schemaVersion: 1;
  requirementId: string;
  sourceKind: SourceKind;
  sourceIdentity: string;
  result: EvidenceResult;
  evidenceUrlOrId: string;
  reviewRunId?: string;
  reviewerClaim?: string;
  submitterIdentity?: string;
  policyVersion: string;
  rubricVersion: string;
  coverage: CoverageKind;
  coverageFromSha: string;
  coverageThroughSha: string;
  baseRef: string;
  diffBaseSha: string;
  changeSetId: string;
  headSha: string;
  findings: ReviewFinding[];
  closures: FindingClosure[];
  observedAt: string;
}

function referenceAt(value: unknown, path: string): string {
  const reference = stringAt(value, path);
  let hasControlCharacter = false;
  for (let index = 0; index < reference.length; index += 1) {
    const code = reference.charCodeAt(index);
    if (code <= 31 || code === 127) {
      hasControlCharacter = true;
      break;
    }
  }
  if (/^(?:javascript|data):/iu.test(reference) || hasControlCharacter) {
    throw new Error(`${path}: unsafe reference`);
  }
  return reference;
}

function timestampAt(value: unknown, path: string): string {
  const timestamp = stringAt(value, path);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(timestamp) || Number.isNaN(Date.parse(timestamp))) {
    throw new Error(`${path}: expected an ISO-8601 UTC timestamp`);
  }
  return timestamp;
}

function parseFinding(input: unknown, path: string): ReviewFinding {
  const record = objectAt(input, path);
  exactKeys(record, ["findingId", "severity", "locus", "evidenceUrlOrId"], path);
  return {
    findingId: stringAt(record.findingId, `${path}.findingId`),
    severity: enumAt(record.severity, ["critical", "high", "medium", "low", "info"], `${path}.severity`),
    locus: stringAt(record.locus, `${path}.locus`),
    evidenceUrlOrId: referenceAt(record.evidenceUrlOrId, `${path}.evidenceUrlOrId`),
  };
}

function parseClosure(input: unknown, path: string): FindingClosure {
  const record = objectAt(input, path);
  exactKeys(record, ["findingId", "authorityKind", "authorityIdentity", "evidenceUrlOrId"], path);
  return {
    findingId: stringAt(record.findingId, `${path}.findingId`),
    authorityKind: enumAt(
      record.authorityKind,
      ["source-confirmed", "authorized-dismissal", "host-native"],
      `${path}.authorityKind`,
    ),
    authorityIdentity: stringAt(record.authorityIdentity, `${path}.authorityIdentity`),
    evidenceUrlOrId: referenceAt(record.evidenceUrlOrId, `${path}.evidenceUrlOrId`),
  };
}

/** Validate source evidence and its nested finding records. */
export function parseEvidence(input: unknown): Evidence {
  const path = "evidence";
  const record = objectAt(input, path);
  exactKeys(record, [
    "schemaVersion", "requirementId", "sourceKind", "sourceIdentity", "result", "evidenceUrlOrId",
    "reviewRunId", "reviewerClaim", "submitterIdentity", "policyVersion", "rubricVersion", "coverage",
    "coverageFromSha", "coverageThroughSha", "baseRef", "diffBaseSha", "changeSetId", "headSha", "findings",
    "closures", "observedAt",
  ], path);
  const result = enumAt(record.result, ["clean", "findings", "failed", "unavailable"], `${path}.result`);
  const findings = arrayAt(record.findings, `${path}.findings`, parseFinding);
  const findingIds = new Set<string>();
  for (const finding of findings) {
    if (findingIds.has(finding.findingId)) throw new Error(`${path}.findings.findingId: duplicate identity`);
    findingIds.add(finding.findingId);
  }
  if (result === "findings" && findings.length === 0) throw new Error(`${path}.findings: required for findings result`);
  if (result !== "findings" && findings.length !== 0) throw new Error(`${path}.findings: only valid for findings result`);

  const reviewRunId = optionalAt(record.reviewRunId, `${path}.reviewRunId`, stringAt);
  const reviewerClaim = optionalAt(record.reviewerClaim, `${path}.reviewerClaim`, stringAt);
  const submitterIdentity = optionalAt(record.submitterIdentity, `${path}.submitterIdentity`, stringAt);
  return {
    schemaVersion: schemaOneAt(record.schemaVersion, `${path}.schemaVersion`),
    requirementId: stringAt(record.requirementId, `${path}.requirementId`),
    sourceKind: enumAt(record.sourceKind, ["human", "agent", "deterministic-tool"], `${path}.sourceKind`),
    sourceIdentity: stringAt(record.sourceIdentity, `${path}.sourceIdentity`),
    result,
    evidenceUrlOrId: referenceAt(record.evidenceUrlOrId, `${path}.evidenceUrlOrId`),
    ...(reviewRunId === undefined ? {} : { reviewRunId }),
    ...(reviewerClaim === undefined ? {} : { reviewerClaim }),
    ...(submitterIdentity === undefined ? {} : { submitterIdentity }),
    policyVersion: digestAt(record.policyVersion, `${path}.policyVersion`),
    rubricVersion: stringAt(record.rubricVersion, `${path}.rubricVersion`),
    coverage: enumAt(record.coverage, ["full", "incremental"], `${path}.coverage`),
    coverageFromSha: digestAt(record.coverageFromSha, `${path}.coverageFromSha`, 40),
    coverageThroughSha: digestAt(record.coverageThroughSha, `${path}.coverageThroughSha`, 40),
    baseRef: stringAt(record.baseRef, `${path}.baseRef`),
    diffBaseSha: digestAt(record.diffBaseSha, `${path}.diffBaseSha`, 40),
    changeSetId: digestAt(record.changeSetId, `${path}.changeSetId`),
    headSha: digestAt(record.headSha, `${path}.headSha`, 40),
    findings,
    closures: arrayAt(record.closures, `${path}.closures`, parseClosure),
    observedAt: timestampAt(record.observedAt, `${path}.observedAt`),
  };
}
