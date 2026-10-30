/** Conditional next-pass withdrawal is an immutable native decision rather than a status update. */
import { nativeReviewDecisionWasConsumed } from "./native-decision-consumption.js";
import type { NativeReviewFactPorts, ReviewOperationStateSnapshotIndex, StoredReviewFact } from "../core/ports.js";
import { ReviewDecisionSchema, type ReviewDecision } from "../../../lib/store/kinds/review/decision/schema.js";
import { canonicalize } from "../../../lib/kernel/index.js";
import { reviewDecisionKey } from "../../../lib/store/kinds/review/decision/key.js";
import type { ConditionalPassWithdrawalResult, withdrawConditionalNextPassAuthorization } from "../lane-progress-conditional.js";

type WithdrawalRequest = Parameters<typeof withdrawConditionalNextPassAuthorization>[1];
type RefusedWithdrawal = Extract<ConditionalPassWithdrawalResult, { state: "refused" }>;

/** Exact withdrawal request with the invocation's selected fact ports and execution inventory. */
interface NativeConditionalWithdrawalInput extends NativeReviewFactPorts {
  withdrawal: WithdrawalRequest;
  inFlight: ReviewOperationStateSnapshotIndex;
}

/** A stored withdrawal or a refusal that leaves the original authority intact. */
type NativeConditionalWithdrawalResult = RefusedWithdrawal | {
  state: "withdrawn" | "already-withdrawn";
  authorizationId: WithdrawalRequest["authorizationId"];
  dispositionSetId: WithdrawalRequest["dispositionSetId"];
  decision: StoredReviewFact<ReviewDecision>;
};

function withdrawalMatches(decision: ReviewDecision, request: WithdrawalRequest): boolean {
  const choice = decision.choice;
  return choice.kind === "extra-pass" && choice.precondition.kind === "approved-fix"
    && decision.decidedBy === request.withdrawnBy && decision.lane === request.lane
    && canonicalize(decision.subject.lineage) === canonicalize(request.lineage)
    && choice.precondition.repositoryId === request.repositoryId && choice.precondition.producerId === request.producerId
    && choice.precondition.dispositionSetId === request.dispositionSetId && choice.precondition.originatingHeadSha === request.headSha;
}

/** Withdraw one unconsumed approval-gated pass or replay the author's previously recorded withdrawal. */
export async function publishNativeConditionalWithdrawal(input: NativeConditionalWithdrawalInput): Promise<NativeConditionalWithdrawalResult> {
  const request = input.withdrawal;
  const projectId = await input.readProjectId();
  const grant = await input.decisions.read(request.authorizationId);
  if (grant === null || projectId !== request.repositoryId || reviewDecisionKey(grant.value) !== request.authorizationId
    || !withdrawalMatches(grant.value, request)) {
    return { state: "refused", reason: "foreign-authority", detail: "Restore the original conditional authority and its authorizer before withdrawing it." };
  }
  const value = ReviewDecisionSchema.parse({ ...grant.value, choice: { kind: "withdrawal", decisionKey: request.authorizationId },
    decidedBy: request.withdrawnBy, decidedAt: request.now });
  const prior = await input.decisions.read(reviewDecisionKey(value));
  if (prior !== null) return { state: "already-withdrawn", authorizationId: request.authorizationId,
    dispositionSetId: request.dispositionSetId, decision: prior };
  if (await nativeReviewDecisionWasConsumed(input, input.inFlight, new Set([request.authorizationId]))) return { state: "refused", reason: "consumed",
    detail: "Conditional pass authority is consumed; continue the admitted pass or retry its original contract." };
  const approval = await input.evidence.readDispositionRecord(request.producerId);
  if (approval === null) throw new Error("Restore the producer's approved response before withdrawing its conditional pass.");
  const node = approval.approvedDispositionLineage.find(value => value.approvedDisposition.dispositionSet.dispositionSetId === request.dispositionSetId);
  if (node === undefined) return { state: "refused", reason: "stale-current-set",
    detail: "Restore the original approved response before withdrawing its conditional pass." };
  if (node.successorDispositionSetId !== null || approval.currentDispositionSetId !== request.dispositionSetId) {
    return { state: "refused", reason: "superseded", detail: "Conditional pass authority is superseded; continue with the current approved response." };
  }
  return { state: "withdrawn", authorizationId: request.authorizationId,
    dispositionSetId: request.dispositionSetId, decision: await input.decisions.create(value) };
}
