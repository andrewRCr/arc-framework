/** Completion of approved hosted findings while preserving immutable performed-response evidence. */

import type { LaneProgressState } from "./core/operation-state-schema.js";
import type { ConfirmResponseHeadContinuation } from "./core/response-head-continuation.js";
import type { LaneSubjectLineage } from "./core/lane-admission.js";
import { assertHostedFixSettlementHeads } from "./hosted-settlement-heads.js";
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

/** An approved hosted response's performed fixes that still owe their reply on the host. */
export interface PendingHostedSettlement {
  readonly attemptId: string;
  readonly dispositionSetId: string;
  readonly findingIds: readonly string[];
}

/**
 * Name the performed fixes an approved hosted response still owes host settlement.
 *
 * A deferred or rejected thread settles before its fix changes the head; once the head moves the host refuses it as
 * stale, so it is never reported here.
 *
 * @returns The unsettled fix findings, or null when none is owed or the response is not yet performed.
 */
export function pendingHostedSettlement(attempt: LaneAttempt): PendingHostedSettlement | null {
  const hosted = attempt.hosted;
  if (attempt.outcome !== "findings" || hosted === undefined || hosted.dispositionSetId === null
    || attempt.responsePerformance?.dispositionSetId !== hosted.dispositionSetId) return null;
  const settled = new Set(hosted.settledFindingIds);
  const findingIds = (hosted.dispositionSetLineage.at(-1)?.findingActions ?? [])
    .filter(({ findingId, disposition, channelAction }) => disposition === "fix"
      && channelAction === "reply-and-resolve" && !settled.has(findingId))
    .map(({ findingId }) => findingId);
  return findingIds.length === 0 ? null
    : { attemptId: attempt.attemptId, dispositionSetId: hosted.dispositionSetId, findingIds };
}

async function confirmHostedFixSettlementHeads(attempt: LaneAttempt, context?: ResponseContinuationContext): Promise<void> {
  const hosted = attempt.hosted;
  const performance = attempt.responsePerformance;
  if (hosted === undefined || performance === undefined) {
    throw new Error("hosted fix settlement lacks durable response-head evidence");
  }
  await assertHostedFixSettlementHeads({ producerId: attempt.attemptId, dispositionSetId: hosted.dispositionSetId,
    performance, findingActions: hosted.dispositionSetLineage.at(-1)?.findingActions ?? [],
    settlementEvidence: hosted.settlementEvidence, context });
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

