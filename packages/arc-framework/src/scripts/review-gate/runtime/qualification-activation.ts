/** Deterministic provider-policy and provisional-manifest activation candidate compiler. */

import { hashContent } from "../../../lib/manifest/hash.js";
import { canonicalizePlainJson } from "../core/identity.js";
import {
  deriveHostedProviderDeclaration,
  type HostedProviderBaselineResult,
} from "../policy/self-hosting/qualification.js";
import { parseSelfHostingPolicy, SELF_HOSTING_POLICY } from "../policy/self-hosting/schema.js";
import {
  validateQualificationAcceptanceCandidate,
  type QualificationAcceptanceCandidate,
  type QualificationCellId,
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

function providerBaseline(
  candidate: QualificationAcceptanceCandidate,
  provider: "coderabbit" | "codex",
): HostedProviderBaselineResult {
  const proven = (cellId: QualificationCellId): boolean => candidate.matrix
    .some((cell) => cell.cellId === cellId && cell.capabilityProven);
  const prefix = provider === "coderabbit" ? "coderabbit" : "codex";
  const clean = proven(`${prefix}-clean`);
  const findings = proven(`${prefix}-findings`);
  const stale = proven(`${prefix}-stale`);
  const unknown = proven(`${prefix}-unknown`);
  const requestQualified = provider === "coderabbit"
    ? proven("coderabbit-label-trigger") && proven("coderabbit-command-trigger")
    : proven("codex-comment-trigger");
  const closureCapability = proven("finding-fix")
    && proven("finding-nonfix");
  return {
    sourceIdentity: `${provider}-pr`,
    parserVersion: candidate.scope.providerParserVersions[provider],
    providerAppId: candidate.scope.providerAppIds[provider],
    providerBotUserId: candidate.scope.providerBotUserIds[provider],
    guidanceDigest: provider === "codex" ? candidate.scope.guidanceDigests.codex ?? null : null,
    requestActor: provider === "codex" ? "pr-author" : "controller",
    requestQualified,
    artifactParserQualified: clean && findings && stale && unknown,
    exactCoverage: clean && findings,
    durableResults: clean,
    distinctOutcomes: clean && findings && stale && unknown,
    durableFindings: findings,
    closureCapability,
    terminalUnavailableMode: provider === "codex" ? candidate.scope.terminalUnavailableMode : "disabled",
    observedLive: candidate.matrix.some((cell) => cell.cellId.startsWith(`${provider}-`)),
  };
}

/** Compile the only provider-policy declarations and baseline manifest slot implied by a complete candidate. */
export function compileQualificationActivation(
  candidate: QualificationAcceptanceCandidate,
): QualificationActivationCandidate {
  if (validateQualificationAcceptanceCandidate(candidate).length > 0) throw new Error("activation-candidate-not-qualified");
  const declarations = [
    deriveHostedProviderDeclaration(providerBaseline(candidate, "coderabbit")),
    deriveHostedProviderDeclaration(providerBaseline(candidate, "codex")),
  ];
  if (!declarations.some((declaration) => declaration.mode === "enabled")) {
    throw new Error("activation-hosted-source-not-qualified");
  }
  parseSelfHostingPolicy({
    ...SELF_HOSTING_POLICY,
    qualifications: SELF_HOSTING_POLICY.qualifications.map((declaration) =>
      declarations.find((candidate) => candidate.sourceIdentity === declaration.sourceIdentity) ?? declaration),
  });
  const manifest = {
    baselineDefaultBranchSha: candidate.scope.defaultBranchSha,
    policyVersion: candidate.scope.policyVersion,
    parserVersion: candidate.scope.parserVersion,
    parserDigest: candidate.scope.parserDigest,
    rubricVersion: candidate.scope.rubricVersion,
    sourceIdentities: candidate.scope.sourceIdentities,
    actorIdentity: candidate.scope.expectedActorIdentity,
    capabilities: declarations,
    evidence: candidate.matrix.map((cell) => ({
      cellId: cell.cellId,
      outcome: cell.outcome,
      capabilityProven: cell.capabilityProven,
      sourceIdentity: cell.sourceIdentity,
      evidenceRef: cell.evidenceRef,
      rawCheckpointHash: cell.rawCheckpointHash,
    })),
    matrixDigest: candidate.matrixDigest,
    checkpointChainHash: candidate.checkpointChainHash,
  };
  const operations = [
    operation(POLICY_PATH, "/SELF_HOSTING_POLICY/qualifications/sourceIdentity=coderabbit-pr", declarations[0]),
    operation(POLICY_PATH, "/SELF_HOSTING_POLICY/qualifications/sourceIdentity=codex-pr", declarations[1]),
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
