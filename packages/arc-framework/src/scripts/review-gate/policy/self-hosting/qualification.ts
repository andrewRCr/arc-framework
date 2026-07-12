/** Qualification rules for the repository-owned independent-analysis rubric. */

import type { SourceQualificationDeclaration } from "./schema.js";

/** Version of the shared independent-analysis rubric. */
export const INDEPENDENT_ANALYSIS_RUBRIC_VERSION = "independent-analysis/v1";

/** Stable rubric dimensions every qualified source must evaluate. */
export const INDEPENDENT_ANALYSIS_RUBRIC = [
  "intent-and-scope",
  "correctness-and-failure-behavior",
  "trust-and-compatibility",
  "verification",
  "coherence-and-maintainability",
] as const;

/** Qualification result with stable missing-capability reasons. */
export interface SourceQualificationResult {
  qualified: boolean;
  reasons: string[];
}

/** Sanitized live baseline from which a hosted-provider declaration is derived. */
export interface HostedProviderBaselineResult {
  sourceIdentity: "coderabbit-pr" | "codex-pr";
  parserVersion: string;
  providerAppId: string | null;
  providerBotUserId: string;
  guidanceDigest: string | null;
  requestActor: "controller" | "pr-author";
  requestQualified: boolean;
  artifactParserQualified: boolean;
  exactCoverage: boolean;
  durableResults: boolean;
  distinctOutcomes: boolean;
  durableFindings: boolean;
  closureCapability: boolean;
  terminalUnavailableMode: "terminal" | "parser-only" | "disabled";
  observedLive: boolean;
}

/** Convert immutable baseline results into the only accepted hosted-provider declaration shape. */
export function deriveHostedProviderDeclaration(
  baseline: HostedProviderBaselineResult,
): SourceQualificationDeclaration {
  const satisfying = baseline.observedLive
    && baseline.requestQualified
    && baseline.artifactParserQualified
    && baseline.exactCoverage
    && baseline.durableResults
    && baseline.distinctOutcomes
    && baseline.durableFindings
    && baseline.closureCapability;
  const partial = baseline.requestQualified
    || baseline.artifactParserQualified
    || baseline.durableFindings
    || baseline.terminalUnavailableMode === "parser-only";
  return {
    sourceKind: "agent",
    qualifier: INDEPENDENT_ANALYSIS_RUBRIC_VERSION,
    sourceIdentity: baseline.sourceIdentity,
    rubricVersion: INDEPENDENT_ANALYSIS_RUBRIC_VERSION,
    mode: satisfying ? "enabled" : partial ? "partial" : "disabled",
    exactCoverage: baseline.exactCoverage,
    durableResults: baseline.durableResults,
    distinctOutcomes: baseline.distinctOutcomes,
    durableFindings: baseline.durableFindings,
    closureCapability: baseline.closureCapability,
    transport: "durable-record",
    liveProbeRequired: true,
    parserVersion: baseline.parserVersion,
    providerAppId: baseline.providerAppId,
    providerBotUserId: baseline.providerBotUserId,
    guidanceDigest: baseline.guidanceDigest,
    terminalUnavailableMode: baseline.terminalUnavailableMode,
    requestActor: baseline.requestActor,
  };
}

/** Decide whether a declared source may satisfy the required rubric version. */
export function qualifyIndependentAnalysisSource(
  declaration: SourceQualificationDeclaration,
  requiredRubricVersion: string,
): SourceQualificationResult {
  const reasons: string[] = [];
  if (declaration.mode !== "enabled") reasons.push(`mode-${declaration.mode}`);
  if (declaration.qualifier !== INDEPENDENT_ANALYSIS_RUBRIC_VERSION) reasons.push("wrong-qualifier");
  if (declaration.rubricVersion !== requiredRubricVersion) reasons.push("wrong-rubric-version");
  if (!declaration.exactCoverage) reasons.push("missing-exact-coverage");
  if (!declaration.durableResults) reasons.push("missing-durable-results");
  if (!declaration.distinctOutcomes) reasons.push("missing-distinct-outcomes");
  if (!declaration.durableFindings) reasons.push("missing-durable-findings");
  if (!declaration.closureCapability) reasons.push("missing-closure-capability");
  return { qualified: reasons.length === 0, reasons };
}
