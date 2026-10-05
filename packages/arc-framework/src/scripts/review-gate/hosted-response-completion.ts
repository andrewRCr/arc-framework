/** Completion of approved hosted findings while preserving immutable performed-response evidence. */

import type { LaneProgressState } from "./core/operation-state-schema.js";
import type { ConfirmResponseHeadContinuation } from "./core/response-head-continuation.js";
import type { LaneSubjectLineage } from "./core/lane-admission.js";
import { bindCompletedConditionalPassAuthorization } from "./lane-progress-conditional.js";

type LaneAttempt = LaneProgressState["attempts"][number];
export interface ResponseContinuationContext {
  repositoryId: string;
  lineage: LaneSubjectLineage;
  confirmResponseHeadContinuation?: ConfirmResponseHeadContinuation;
}

function hostedDispositionHasFix(attempt: LaneAttempt): boolean {
  return attempt.hosted?.dispositionSetLineage.at(-1)?.findingActions
    .some(({ disposition }) => disposition === "fix") ?? false;
}

function hostedSettlementComplete(attempt: LaneAttempt): boolean {
  const findingCount = attempt.hosted?.sealedResult?.findings.length ?? 0;
  return findingCount > 0 && attempt.hosted?.settledFindingIds.length === findingCount;
}

async function confirmHostedFixSettlementHeads(attempt: LaneAttempt, context?: ResponseContinuationContext): Promise<void> {
  const hosted = attempt.hosted;
  const performance = attempt.responsePerformance;
  if (hosted === undefined || performance === undefined) {
    throw new Error("hosted fix settlement lacks durable response-head evidence");
  }
  const hostFixFindingIds = hosted.dispositionSetLineage.at(-1)?.findingActions
    .filter(({ disposition, channelAction }) =>
      disposition === "fix" && channelAction === "reply-and-resolve")
    .map(({ findingId }) => findingId) ?? [];
  const fixEvidence = hosted.settlementEvidence.filter((evidence) =>
    evidence.dispositionSetId === hosted.dispositionSetId
    && hostFixFindingIds.includes(evidence.findingId));
  if (fixEvidence.length !== hostFixFindingIds.length) {
    throw new Error("hosted fix settlement does not match durable response-head evidence");
  }
  for (const evidence of fixEvidence) {
    if (evidence.channelAction !== "reply-and-resolve") {
      throw new Error("hosted fix settlement does not match durable response-head evidence");
    }
    const head = evidence.fixTarget?.headSha;
    if (head === undefined
      || (head !== performance.producedHeadSha && !await context?.confirmResponseHeadContinuation?.({
        repositoryId: context.repositoryId, lineage: context.lineage, producerId: attempt.attemptId,
        dispositionSetId: performance.dispositionSetId, originatingHeadSha: performance.originatingHeadSha,
        fromHeadSha: performance.producedHeadSha, toHeadSha: head,
      }))) throw new Error("hosted fix settlement does not match durable response-head evidence");
  }
}

/**
 * Complete only a fully settled hosted response whose fix head remains exact or has a proved record continuation.
 *
 * @param attempt - The immutable producer and recorded settlement evidence.
 * @param now - Completion time.
 * @param context - Optional repository continuation boundary for Candidate record commits.
 * @returns Settled progress retaining the original verified fix and approval bindings.
 */
export async function completeHostedAttemptIfReady(
  attempt: LaneAttempt, now: string, context?: ResponseContinuationContext,
): Promise<LaneAttempt> {
  if (attempt.hosted === undefined || !hostedSettlementComplete(attempt)) {
    return { ...attempt, outcome: "findings" };
  }
  const dispositionHasFix = hostedDispositionHasFix(attempt);
  if (dispositionHasFix) {
    if (attempt.responsePerformance?.dispositionSetId !== attempt.hosted.dispositionSetId) {
      return { ...attempt, outcome: "findings" };
    }
    await confirmHostedFixSettlementHeads(attempt, context);
  }
  const dispositionSetId = attempt.hosted.dispositionSetId;
  if (dispositionSetId === null) {
    throw new Error("hosted settlement lacks an approved disposition set");
  }
  const settled = { ...attempt, outcome: "settled-findings" as const };
  return bindCompletedConditionalPassAuthorization(settled, {
    dispositionSetId,
    producedHeadSha: dispositionHasFix
      ? attempt.responsePerformance?.producedHeadSha ?? attempt.headSha
      : attempt.headSha,
    now,
  });
}

