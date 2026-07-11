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

/** Decide whether a declared source may satisfy the required rubric version. */
export function qualifyIndependentAnalysisSource(
  declaration: SourceQualificationDeclaration,
  requiredRubricVersion: string,
): SourceQualificationResult {
  const reasons: string[] = [];
  if (!declaration.enabled) reasons.push("disabled");
  if (declaration.qualifier !== INDEPENDENT_ANALYSIS_RUBRIC_VERSION) reasons.push("wrong-qualifier");
  if (declaration.rubricVersion !== requiredRubricVersion) reasons.push("wrong-rubric-version");
  if (!declaration.exactCoverage) reasons.push("missing-exact-coverage");
  if (!declaration.durableResults) reasons.push("missing-durable-results");
  if (!declaration.distinctOutcomes) reasons.push("missing-distinct-outcomes");
  if (!declaration.durableFindings) reasons.push("missing-durable-findings");
  if (!declaration.closureCapability) reasons.push("missing-closure-capability");
  return { qualified: reasons.length === 0, reasons };
}
