/** Exhaustive deterministic evidence-applicability reduction. */

import { z } from "zod";

import {
  BoundedEvidenceResidualSchema,
  EvidenceDeltaSchema,
  type EvidenceDelta,
} from "./schema.js";

export const EvidenceKindSchema = z.enum(["review-clearance", "verification", "merge-safety"]);
export type EvidenceKind = z.infer<typeof EvidenceKindSchema>;

export const EvidenceApplicabilityVerdictSchema = z.enum(["carries", "supplemental", "fresh"]);
const FinalReasonSchema = z.enum([
  "unexplained",
  "approved-scope",
  "approved-fix-review-clearance",
  "merge-safety-admitted-disjoint",
  "merge-safety-requires-fresh",
  "base-movement-disjoint",
  "overlap-unknown",
  "unbounded-residual",
  "relation-carried",
  "overlap-supplemental",
  "interaction",
  "unavailable",
  "conservative-default",
]);
const JudgmentReasonSchema = z.enum(["bounded-overlap", "bounded-clean-divergence"]);
export const EvidenceApplicabilityResultSchema = z.union([
  z.strictObject({
    verdict: EvidenceApplicabilityVerdictSchema,
    residual: z.null(),
    reason: FinalReasonSchema,
    judgmentRequired: z.literal(false),
  }),
  z.strictObject({
    verdict: z.literal("supplemental"),
    residual: BoundedEvidenceResidualSchema,
    reason: JudgmentReasonSchema,
    judgmentRequired: z.literal(true),
  }),
]);
export type EvidenceApplicabilityResult = z.infer<typeof EvidenceApplicabilityResultSchema>;

function final(
  verdict: "carries" | "supplemental" | "fresh",
  reason: z.infer<typeof FinalReasonSchema>,
): EvidenceApplicabilityResult {
  return EvidenceApplicabilityResultSchema.parse({
    verdict,
    residual: null,
    reason,
    judgmentRequired: false,
  });
}

function judgment(
  residual: NonNullable<EvidenceDelta["residual"]>,
  reason: z.infer<typeof JudgmentReasonSchema>,
): EvidenceApplicabilityResult {
  return EvidenceApplicabilityResultSchema.parse({
    verdict: "supplemental",
    residual,
    reason,
    judgmentRequired: true,
  });
}

/** Reduce one normalized delta against one evidence kind. */
export function reduceEvidenceApplicability(
  deltaInput: EvidenceDelta,
  evidenceInput: EvidenceKind,
): EvidenceApplicabilityResult {
  const delta = EvidenceDeltaSchema.parse(deltaInput);
  const evidence = EvidenceKindSchema.parse(evidenceInput);
  assertClosedAxes(delta, evidence);

  if (delta.cause === "unexplained") return final("fresh", "unexplained");

  if (delta.cause === "approved-fix") {
    if (evidence === "review-clearance") {
      return final("fresh", "approved-fix-review-clearance");
    }
    if (evidence === "verification") {
      const verdict = delta.approvedScope === "targeted"
        ? "carries"
        : delta.approvedScope === "focused" ? "supplemental" : "fresh";
      return final(verdict, "approved-scope");
    }
  }

  if (evidence === "merge-safety") {
    return delta.cause === "base-movement"
      && delta.overlap.kind === "disjoint"
      && delta.hostAdmission.state === "mergeable"
      ? final("carries", "merge-safety-admitted-disjoint")
      : final("fresh", "merge-safety-requires-fresh");
  }

  if (delta.cause === "base-movement") {
    switch (delta.overlap.kind) {
      case "disjoint":
        return final("carries", "base-movement-disjoint");
      case "unknown":
        return final("fresh", "overlap-unknown");
      case "overlapping":
        return delta.residual === null
          ? final("fresh", "unbounded-residual")
          : judgment(delta.residual, "bounded-overlap");
      default:
        return assertNever(delta.overlap);
    }
  }

  return reduceOtherMovement(delta);
}

function assertClosedAxes(delta: EvidenceDelta, evidence: EvidenceKind): void {
  switch (evidence) {
    case "review-clearance":
    case "verification":
    case "merge-safety":
      break;
    default:
      assertNever(evidence);
  }
  const relation = delta.relation;
  switch (relation) {
    case "equal":
    case "mechanical-reapply":
    case "clean-divergence":
    case "interaction":
    case "unavailable":
    case "not-applicable":
      break;
    default:
      assertNever(relation);
  }
  const overlap = delta.overlap;
  switch (overlap.kind) {
    case "disjoint":
    case "overlapping":
    case "unknown":
    case "not-applicable":
      break;
    default:
      assertNever(overlap);
  }
  const hostAdmission = delta.hostAdmission;
  switch (hostAdmission.state) {
    case "mergeable":
    case "base-currentness-required":
    case "refused":
    case "unresolved":
    case "not-applicable":
      break;
    default:
      assertNever(hostAdmission);
  }
  const approvedScope = delta.approvedScope;
  switch (approvedScope) {
    case "targeted":
    case "focused":
    case "full":
    case "not-applicable":
      break;
    default:
      assertNever(approvedScope);
  }
}

function reduceOtherMovement(
  delta: Extract<EvidenceDelta, { cause: "approved-fix" | "base-merge" | "member-rewrite" }>,
): EvidenceApplicabilityResult {
  if (delta.overlap.kind === "unknown") return final("fresh", "overlap-unknown");
  if (delta.relation === "equal" || delta.relation === "mechanical-reapply") {
    return delta.overlap.kind === "overlapping"
      ? final("supplemental", "overlap-supplemental")
      : final("carries", "relation-carried");
  }
  if (delta.relation === "clean-divergence") {
    return delta.residual === null
      ? final("fresh", "unbounded-residual")
      : judgment(delta.residual, "bounded-clean-divergence");
  }
  if (delta.relation === "interaction") return final("fresh", "interaction");
  if (delta.relation === "unavailable") return final("fresh", "unavailable");
  return final("fresh", "conservative-default");
}

function assertNever(value: never): never {
  throw new Error(`Unhandled evidence-applicability value: ${JSON.stringify(value)}`);
}
