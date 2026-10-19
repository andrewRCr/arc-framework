/** Completed-map decoding with deterministic author-actionable issues. */
import { CutMapSchema, type CutMap } from "./cut-map-schema.js";
import type { CutMapIssue } from "./cut-map-issues.js";
import { cutMachineIssue } from "./cut-map-machine-validation.js";
import { cutSourceKindIssue, cutSourceAllocationIssue } from "./cut-map-source-validation.js";
import { cutAuthoringIdentityIssue, cutAuthoringOrderIssue } from "./cut-map-authoring-validation.js";
import { cutSourceTargetIssue, cutDependencyTargetIssue } from "./cut-map-reference-validation.js";
import { cutShapeCardinalityIssue, cutPlacementCardinalityIssue, cutDestinationCoverageIssue } from "./cut-map-cardinality-validation.js";
import { cutStructuralIssue } from "./cut-map-structure.js";
export type CutMapDecodeResult = { status: "accepted"; value: CutMap } | { status: "rejected"; issue: CutMapIssue };
/** Decode a completed map without imposing JSON byte formatting. */
export function decodeCutMap(input: unknown): CutMapDecodeResult {
  if (typeof input === "object" && input !== null && "schemaVersion" in input && input.schemaVersion === 3) return {
    status: "rejected", issue: { code: "unsupported-version", path: "schemaVersion", message: "Generate a version-4 map with --preflight." },
  };
  const parsed = CutMapSchema.safeParse(input);
  if (!parsed.success) return { status: "rejected", issue: cutStructuralIssue(input, parsed.error) };
  const validators = [
    (value: CutMap) => cutMachineIssue(value.machine),
    cutSourceKindIssue, cutAuthoringIdentityIssue, cutSourceAllocationIssue, cutAuthoringOrderIssue,
    cutSourceTargetIssue, cutDependencyTargetIssue, cutShapeCardinalityIssue, cutPlacementCardinalityIssue,
    cutDestinationCoverageIssue,
  ];
  for (const validate of validators) {
    const issue = validate(parsed.data);
    if (issue !== null) return { status: "rejected", issue };
  }
  return { status: "accepted", value: parsed.data };
}
