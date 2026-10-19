/** Read-only lineage rejections and standard-lane facts for the executing agent. */
import { laneSubjectOwnerMatches, type LaneSubjectLineage } from "./core/lane-admission.js";
import { currentApprovedDispositionNode, type ApprovedDispositionRecord } from "./core/advisory-records.js";
import { deriveNextPassFacts } from "./policy/next-pass-facts.js";


import { ReviewLaneReadEnvelopeSchema, type ReviewLaneReadEnvelope } from "./lane-read-schema.js";
export { ReviewLaneReadRequestSchema, ReviewLaneReadEnvelopeSchema, type ReviewLaneReadRequest, type ReviewLaneReadEnvelope } from "./lane-read-schema.js";

/** Project resolved lineage history without creating or changing review records. */
export async function projectReviewLaneRead(input: Omit<Parameters<typeof deriveNextPassFacts>[0], "dispositions"> & {
  readonly lineage: LaneSubjectLineage;
  readonly inheritedLineages?: readonly LaneSubjectLineage[];
  readonly dispositions: readonly ApprovedDispositionRecord[];
}): Promise<ReviewLaneReadEnvelope> {
  const lineages = [input.lineage, ...(input.inheritedLineages ?? [])];
  const progress = input.progress.filter(owner => lineages.some(lineage => laneSubjectOwnerMatches(owner.lineage, lineage)));
  const lanes = new Map(progress.flatMap(owner => owner.attempts.map(attempt => [attempt.attemptId, owner.lane] as const)));
  const dispositions = input.dispositions.filter(record => lanes.has(record.operationId));
  const rejections = dispositions.flatMap(record => currentApprovedDispositionNode(record).approvedDisposition.dispositionSet
    .findings.filter(finding => finding.disposition === "reject").map(finding => ({ lane: lanes.get(record.operationId),
      findingId: finding.findingId, locus: finding.locus, reason: finding.rationale, sourceVerification: finding.sourceVerification,
      ...(finding.title === undefined ? {} : { title: finding.title }) })));
  const facts = await deriveNextPassFacts({ ...input, progress, dispositions });
  const last = facts.materialTrend.filter(look => !look.provisional).at(-1);
  const lastLook = last === undefined ? null : { producerId: last.producerId,
    coverage: last.coverage === "complete" ? "complete" : "incremental", outcome: last.outcome };
  return ReviewLaneReadEnvelopeSchema.parse({ schemaVersion: 1, mode: "review-lane-read", state: "ready",
    nextAction: "none", diagnostics: [], payload: { lineage: input.lineage, rejections, facts, lastLook } });
}
