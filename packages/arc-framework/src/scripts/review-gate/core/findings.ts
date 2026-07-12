/** Immutable finding history and authority-bearing closure reduction. */

import type { Evidence, ReviewFinding } from "./evidence.js";

/** Finding paired with its stable source identity. */
export interface SourceFinding extends ReviewFinding {
  sourceIdentity: string;
}

/** One authenticated dismissal receipt reduced beside immutable provider evidence. */
export interface FindingDismissalReceipt {
  sourceIdentity: string;
  findingId: string;
  actorIdentity: string;
  reason: string | null;
  durableRef: string | null;
}

/** Inputs for reducing finding history. */
export interface FindingReductionInput {
  evidence: Evidence[];
  currentChangeSetId: string;
  authorizedDismissers: string[];
  knownHostActors: string[];
  dismissalReceipts?: FindingDismissalReceipt[];
}

/** Open findings plus consistency diagnostics. */
export interface FindingReductionResult {
  consistent: boolean;
  openFindings: SourceFinding[];
  errors: string[];
}

function findingKey(sourceIdentity: string, findingId: string): string {
  return `${sourceIdentity}\0${findingId}`;
}

function sameFinding(left: SourceFinding, right: ReviewFinding): boolean {
  return left.severity === right.severity
    && left.locus === right.locus
    && left.evidenceUrlOrId === right.evidenceUrlOrId;
}

/** Reduce stable findings and accept only explicitly authorized closures. */
export function reduceFindings(input: FindingReductionInput): FindingReductionResult {
  const findings = new Map<string, SourceFinding>();
  const closed = new Set<string>();
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
      const authorized = closure.authorityKind === "source-confirmed"
        ? closure.authorityIdentity === item.sourceIdentity
        : closure.authorityKind === "authorized-dismissal"
          ? input.authorizedDismissers.includes(closure.authorityIdentity)
          : input.knownHostActors.includes(closure.authorityIdentity);
      if (!authorized) {
        errors.push(`invalid-closure-authority:${item.sourceIdentity}:${closure.findingId}`);
        continue;
      }
      closed.add(key);
    }
  }

  for (const dismissal of input.dismissalReceipts ?? []) {
    const key = findingKey(dismissal.sourceIdentity, dismissal.findingId);
    if (!findings.has(key)) {
      errors.push(`unknown-dismissal-finding:${dismissal.sourceIdentity}:${dismissal.findingId}`);
      continue;
    }
    if (!input.authorizedDismissers.includes(dismissal.actorIdentity)) {
      errors.push(`invalid-dismissal-authority:${dismissal.sourceIdentity}:${dismissal.findingId}`);
      continue;
    }
    if (
      dismissal.reason === null
      || dismissal.reason.length === 0
      || Buffer.byteLength(dismissal.reason, "utf8") > 1024
      || dismissal.durableRef === null
      || dismissal.durableRef.length === 0
    ) {
      errors.push(`invalid-dismissal-provenance:${dismissal.sourceIdentity}:${dismissal.findingId}`);
      continue;
    }
    closed.add(key);
  }

  return {
    consistent: errors.length === 0,
    openFindings: [...findings.entries()]
      .filter(([key]) => !closed.has(key))
      .map(([, finding]) => finding),
    errors,
  };
}
