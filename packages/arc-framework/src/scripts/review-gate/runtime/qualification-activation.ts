/** Deterministic provider-policy and provisional-manifest activation candidate compiler. */

import { hashContent } from "../../../lib/manifest/hash.js";
import { canonicalizePlainJson } from "../core/identity.js";
import {
  validateQualificationAcceptanceCandidate,
  type QualificationAcceptanceCandidate,
} from "./qualification-contract.js";

export interface QualificationActivationOperation {
  path: string;
  pointer: string;
  value: unknown;
  valueDigest: string;
}

export interface QualificationActivationCandidate {
  schemaVersion: 1;
  acceptanceMatrixDigest: string;
  operations: QualificationActivationOperation[];
  candidateDigest: string;
}

const POLICY_PATH = "packages/arc-framework/src/scripts/review-gate/policy/self-hosting/schema.ts";
const MANIFEST_PATH = ".arc/reference/supplemental/analysis/analysis-review-gate-cutover-evidence.md";

function digest(value: unknown): string {
  return hashContent(canonicalizePlainJson(value));
}

function operation(path: string, pointer: string, value: unknown): QualificationActivationOperation {
  return { path, pointer, value, valueDigest: digest(value) };
}

/** Compile the only provider-policy declarations and baseline manifest slot implied by a complete candidate. */
export function compileQualificationActivation(
  candidate: QualificationAcceptanceCandidate,
): QualificationActivationCandidate {
  if (validateQualificationAcceptanceCandidate(candidate).length > 0) throw new Error("activation-candidate-not-qualified");
  const source = candidate.scope.sourceIdentities;
  const declarations = [
    {
      sourceIdentity: source.coderabbit,
      mode: "enabled",
      exactCoverage: true,
      durableResults: true,
      distinctOutcomes: true,
      durableFindings: true,
      closureCapability: true,
      triggerPaths: ["label", "comment"],
      terminalUnavailableMode: "terminal",
    },
    {
      sourceIdentity: source.codex,
      mode: "enabled",
      exactCoverage: true,
      durableResults: true,
      distinctOutcomes: true,
      durableFindings: true,
      closureCapability: true,
      triggerPaths: ["comment"],
      terminalUnavailableMode: candidate.scope.terminalUnavailableMode,
      guidanceDigest: candidate.scope.guidanceDigests.codex,
    },
  ];
  const manifest = {
    baselineDefaultBranchSha: candidate.scope.defaultBranchSha,
    policyVersion: candidate.scope.policyVersion,
    parserVersion: candidate.scope.parserVersion,
    parserDigest: candidate.scope.parserDigest,
    rubricVersion: candidate.scope.rubricVersion,
    matrixDigest: candidate.matrixDigest,
    checkpointChainHash: candidate.checkpointChainHash,
  };
  const operations = [
    operation(POLICY_PATH, "/SELF_HOSTING_POLICY/qualifications", declarations),
    operation(MANIFEST_PATH, "/qualification/provisional", manifest),
  ];
  return {
    schemaVersion: 1,
    acceptanceMatrixDigest: candidate.matrixDigest,
    operations,
    candidateDigest: digest({ acceptanceMatrixDigest: candidate.matrixDigest, operations }),
  };
}

/** Accept only the exact generated operation set; additions, omissions, edits, and extra paths fail closed. */
export function validateQualificationActivationDiff(
  expected: QualificationActivationCandidate,
  actual: QualificationActivationOperation[],
): string[] {
  const errors: string[] = [];
  if (actual.length !== expected.operations.length) errors.push("activation-operation-count-mismatch");
  const actualPaths = actual.map(({ path }) => path).sort();
  const expectedPaths = expected.operations.map(({ path }) => path).sort();
  if (actualPaths.join(",") !== expectedPaths.join(",")) errors.push("activation-path-set-mismatch");
  expected.operations.forEach((operationValue, index) => {
    const candidate = actual[index];
    if (candidate === undefined
      || candidate.path !== operationValue.path
      || candidate.pointer !== operationValue.pointer
      || candidate.valueDigest !== digest(candidate.value)
      || canonicalizePlainJson(candidate) !== canonicalizePlainJson(operationValue)) {
      errors.push(`activation-operation-mismatch:${index}`);
    }
  });
  return errors;
}
