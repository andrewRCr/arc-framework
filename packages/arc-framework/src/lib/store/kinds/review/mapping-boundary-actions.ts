/** Preserve boundary command inputs while moving saved review choices into records. */
import { mapReviewResponseSource } from "./mapping-response-source.js";
import type { ReviewSourceReferenceOwner } from "../../../../scripts/review-gate/core/review-source-reference.js";
import type { MappedReviewOutcome } from "./mapping-source-listing.js";
import { decodePrePublicationReplay, encodePrePublicationReplayV2, replayTokenFromAction } from
  "../../../../scripts/review-gate/policy/pre-publication-replay.js";
import { PrePublicationLaneJudgmentsSchema } from "../../../../scripts/review-gate/policy/pre-publication-request.js";
import type { IntegrationBoundaryLocus, PostAttestContinuation } from
  "../../../../scripts/review-gate/policy/integration-boundary-locus.js";

function mapReplayCommand(command: string, workUnit: string): string {
  if (!command.includes(" --resume ")) return command;
  const { lanes, frontlineCeilingHeadSha, ...inputs } =
    decodePrePublicationReplay(replayTokenFromAction(command, workUnit));
  const judgments = PrePublicationLaneJudgmentsSchema.parse(lanes ?? {});
  const callLanes = Object.fromEntries(Object.entries(judgments).map(([lane, judgment]) => [lane, {
    ...(judgment.scopeMode === undefined ? {} : { scopeMode: judgment.scopeMode }),
    ...(judgment.invocation === undefined ? {} : { invocation: judgment.invocation }),
    ...(lane !== "frontline" || frontlineCeilingHeadSha !== undefined || judgment.ceilingOverride === undefined
      ? {} : { ceilingOverride: judgment.ceilingOverride }),
  }]));
  const token = encodePrePublicationReplayV2({ ...inputs, ...(lanes === undefined ? {} : { lanes: callLanes }) });
  return `arc review pre-publication ${workUnit} --resume ${token}`;
}

/** Drop staged-projection instructions and translate the continuation's own action. */
export function mapBoundaryPostAttestContinuation(continuation: PostAttestContinuation, workUnit: string, outcomes: readonly MappedReviewOutcome[],
  owner: ReviewSourceReferenceOwner): unknown {
  return { reviewedHead: continuation.reviewedHead, nextAction: mapReviewBoundaryAction(continuation.nextAction, workUnit, outcomes, owner) };
}

/** Rewrite saved tokens in each action slot without changing its invocation or response identity. */
export function mapReviewBoundaryAction(action: IntegrationBoundaryLocus["nextAction"], workUnit: string, outcomes: readonly MappedReviewOutcome[],
  owner: ReviewSourceReferenceOwner): unknown {
  if (action.kind === "run-convergence-verification") return { ...action,
    verificationKind: action.verificationKind === "tier-3" ? "merge" : action.verificationKind,
    postAttestContinuation: mapBoundaryPostAttestContinuation(action.postAttestContinuation, workUnit, outcomes, owner) };
  if (action.kind !== "continue-pre-publication-review") return action;
  return { ...action, command: mapReplayCommand(action.command, workUnit),
    ...(action.responseSource === undefined ? {} : { responseSource: mapReviewResponseSource(action.responseSource, outcomes, owner) }),
    ...(action.resumeCommand === undefined ? {} : { resumeCommand: mapReplayCommand(action.resumeCommand, workUnit) }) };
}
