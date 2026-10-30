/** Decode original replay choices without inferring unrecorded authority. */
import { decodePrePublicationReplay, replayTokenFromAction, type PrePublicationReplayInput } from
  "../../../../scripts/review-gate/policy/pre-publication-replay.js";
import { PrePublicationLaneJudgmentsSchema } from "../../../../scripts/review-gate/policy/pre-publication-request.js";
import type { IntegrationBoundaryLocus } from "../../../../scripts/review-gate/policy/integration-boundary-locus.js";
import type { ReviewDecision } from "./decision/schema.js";

/** Locate saved replay payloads on actions and post-attestation continuations. */
function readMappingReplays(boundary: IntegrationBoundaryLocus): PrePublicationReplayInput[] {
  const actions = [boundary.nextAction];
  if (boundary.nextAction.kind === "run-convergence-verification") {
    actions.push(boundary.nextAction.postAttestContinuation.nextAction);
  }
  if ("postAttestContinuation" in boundary && boundary.postAttestContinuation !== undefined) {
    actions.push(boundary.postAttestContinuation.nextAction);
  }
  return actions.flatMap((action) => {
    if (action.kind !== "continue-pre-publication-review") return [];
    return [action.command, action.resumeCommand].flatMap((command) =>
      command?.includes(" --resume ") === true
        ? [decodePrePublicationReplay(replayTokenFromAction(command, boundary.workUnit))] : []);
  });
}

function mapReplayChoices(boundary: IntegrationBoundaryLocus, replay: PrePublicationReplayInput,
  terminusPassCount: () => number): ReviewDecision[] {
  const lanes = PrePublicationLaneJudgmentsSchema.parse(replay.lanes ?? {});
  const decisions: ReviewDecision[] = [];
  const additional = lanes.standard?.additionalPassAuthorization;
  if (additional !== undefined) decisions.push({ schemaVersion: 1,
    subject: { lineage: { kind: "candidate", candidateId: replay.candidateId ?? boundary.candidateId },
      headSha: additional.headSha, subjectDigest: replay.candidateSubjectDigest ?? null },
    lane: "standard", choice: { kind: "extra-pass", passCount: additional.completedPasses,
      precondition: { kind: "additional", precedingProducerId: additional.precedingProducerId,
        targetBinding: { kind: "call-target" } } },
    decidedBy: null, decidedAt: null, basis: null });
  for (const lane of ["frontline", "standard"] as const) {
    const ceiling = lanes[lane]?.ceilingOverride;
    if (ceiling === undefined || ceiling.conditionalPassAuthorizationId !== undefined) continue;
    decisions.push({ schemaVersion: 1,
      subject: { lineage: { kind: "candidate", candidateId: replay.candidateId ?? boundary.candidateId },
        headSha: lane === "frontline" ? replay.frontlineCeilingHeadSha ?? null : replay.scopeJudgmentTarget?.headSha ?? null,
        subjectDigest: replay.candidateSubjectDigest ?? null },
      lane, choice: { kind: "extra-pass", passCount: ceiling.exhaustedPassCount, precondition: { kind: "ceiling", targetBinding: { kind: "call-target" } } },
      decidedBy: null, decidedAt: null, basis: null });
  }
  if (boundary.terminus === null && lanes.standard?.terminus !== undefined) decisions.push({ schemaVersion: 1,
    subject: { lineage: { kind: "candidate", candidateId: boundary.candidateId }, headSha: null,
      subjectDigest: boundary.candidateSubjectDigest }, lane: "standard", choice: { kind: "terminus" },
    decidedBy: null, decidedAt: null, basis: { passCount: terminusPassCount() } });
  return decisions;
}

/** Map every retained replay choice using only its original recorded authority. */
export function mapReviewReplayDecisions(boundary: IntegrationBoundaryLocus, terminusPassCount: () => number): ReviewDecision[] {
  return readMappingReplays(boundary).flatMap((replay) => mapReplayChoices(boundary, replay, terminusPassCount));
}
