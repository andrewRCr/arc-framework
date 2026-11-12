/** Read-only lineage rejections and standard-lane facts for the executing agent. */
import { laneSubjectOwnerMatches, type LaneSubjectLineage } from "./core/lane-admission.js";
import { currentApprovedDispositionNode, type ApprovedDispositionRecord } from "./core/advisory-records.js";
import { deriveNextPassFacts } from "./policy/next-pass-facts.js";
import { selectReviewSources } from "./policy/review-source-eligibility.js";


import { ReviewLaneReadEnvelopeSchema, type ReviewLaneReadEnvelope } from "./lane-read-schema.js";
export { ReviewLaneReadRequestSchema, ReviewLaneReadEnvelopeSchema, type ReviewLaneReadRequest, type ReviewLaneReadEnvelope } from "./lane-read-schema.js";

/** Project resolved lineage history without creating or changing review records. */
export async function projectReviewLaneRead(input: Omit<Parameters<typeof deriveNextPassFacts>[0], "dispositions"> & {
  readonly lineage: LaneSubjectLineage;
  readonly inheritedLineages?: readonly LaneSubjectLineage[];
  readonly dispositions: readonly ApprovedDispositionRecord[];
  readonly sources: readonly string[];
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
  // The same sources, context, ceiling, and source selection the policy driver reads: it admits no look on a lane with
  // no sources, an incremental look only from a proven scope, a complete pass at the ceiling only with an override,
  // and no look its sources refuse.
  const { refusal } = selectReviewSources({ lane: "standard", sources: input.sources, nextPassContext: input.nextPassContext });
  const nextLooks = input.sources.length === 0 ? { state: "disabled" } : { state: "enabled",
    incremental: input.nextPassContext.incremental?.basis ?? null,
    completePass: input.nextPassContext.completePasses < input.ceiling ? "admitted" : "ceiling-decision",
    responseDue: input.nextPassContext.responseDue,
    refusal: refusal === null ? null : { code: refusal.code, message: refusal.message } };
  return ReviewLaneReadEnvelopeSchema.parse({ schemaVersion: 1, mode: "review-lane-read", state: "ready",
    nextAction: "none", diagnostics: [], payload: { lineage: input.lineage, rejections, facts, lastLook, nextLooks } });
}
