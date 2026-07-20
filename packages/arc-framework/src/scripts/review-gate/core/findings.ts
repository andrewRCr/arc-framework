/** Immutable finding history and authority-bearing closure reduction. */

import type { Evidence, ReviewFinding } from "./evidence.js";
import {
  NormalizedReviewFindingSchema,
  type NormalizedReviewFinding,
} from "./finding-records.js";

/** Finding paired with its stable source identity. */
export interface SourceFinding extends ReviewFinding {
  sourceIdentity: string;
}

/** Inputs for reducing finding history. */
export interface FindingReductionInput {
  evidence: Evidence[];
  currentChangeSetId: string;
}

/** Reduced findings plus consistency diagnostics; settlement filters closures separately. */
export interface FindingReductionResult {
  consistent: boolean;
  findings: SourceFinding[];
  errors: string[];
}

/** One normalized v2 finding paired with its source authority. */
export type SourceNormalizedFinding = NormalizedReviewFinding & { sourceIdentity: string };

/** Forward finding evidence already normalized by its source adapter. */
export interface NormalizedFindingEvidence {
  sourceIdentity: string;
  findings: NormalizedReviewFinding[];
}

function findingKey(sourceIdentity: string, findingId: string): string {
  return `${sourceIdentity}\0${findingId}`;
}

function sameFinding(left: SourceFinding, right: ReviewFinding): boolean {
  return left.severity === right.severity
    && left.locus === right.locus
    && left.evidenceUrlOrId === right.evidenceUrlOrId;
}

/** Reduce stable finding identities; settlement authority is reduced separately from receipts. */
export function reduceFindings(input: FindingReductionInput): FindingReductionResult {
  const findings = new Map<string, SourceFinding>();
  const errors: string[] = [];

  for (const item of input.evidence) {
    if (item.changeSetId !== input.currentChangeSetId) {
      if (item.closures.length > 0) errors.push("stale-closure-identity");
      continue;
    }
    for (const finding of item.findings) {
      const key = findingKey(item.sourceIdentity, finding.findingId);
      const prior = findings.get(key);
      if (prior !== undefined && !sameFinding(prior, finding)) {
        errors.push(`finding-identity-reused:${item.sourceIdentity}:${finding.findingId}`);
        continue;
      }
      findings.set(key, { ...finding, sourceIdentity: item.sourceIdentity });
    }
    for (const closure of item.closures) {
      const key = findingKey(item.sourceIdentity, closure.findingId);
      if (!findings.has(key)) {
        errors.push(`unknown-finding:${item.sourceIdentity}:${closure.findingId}`);
        continue;
      }
      const authorized = closure.authorityIdentity === item.sourceIdentity;
      if (!authorized) {
        errors.push(`invalid-closure-authority:${item.sourceIdentity}:${closure.findingId}`);
        continue;
      }
    }
  }

  return {
    consistent: errors.length === 0,
    findings: [...findings.values()],
    errors,
  };
}

/** Reduce normalized v2 findings without admitting legacy severity labels. */
export function reduceNormalizedFindings(evidence: readonly NormalizedFindingEvidence[]): SourceNormalizedFinding[] {
  const findings = new Map<string, SourceNormalizedFinding>();
  for (const item of evidence) {
    for (const candidate of item.findings) {
      const finding = NormalizedReviewFindingSchema.parse(candidate);
      const identity = findingKey(item.sourceIdentity, finding.findingId);
      const prior = findings.get(identity);
      if (prior !== undefined && (
        prior.severity !== finding.severity
        || prior.nit !== finding.nit
        || prior.locus !== finding.locus
        || prior.evidenceUrlOrId !== finding.evidenceUrlOrId
      )) {
        throw new Error(`finding-identity-reused:${item.sourceIdentity}:${finding.findingId}`);
      }
      findings.set(identity, { ...finding, sourceIdentity: item.sourceIdentity });
    }
  }
  return [...findings.values()];
}
