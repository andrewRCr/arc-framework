/** Native hosted responses use the same completed-fix head proof regardless of write order. */
import type { ReviewEvidence } from "../../../lib/store/kinds/review/evidence/schema.js";
import type { ReviewResult } from "../core/review-result.js";
import type { ConfirmResponseHeadContinuation } from "../core/response-head-continuation.js";
import { assertHostedFixSettlementHeads } from "../hosted-settlement-heads.js";

/** Validate a completed hosted response before either its settlement or performance is advanced. */
export async function assertNativeHostedResponseHeads(value: ReviewEvidence, result: ReviewResult,
  confirmResponseHeadContinuation?: ConfirmResponseHeadContinuation): Promise<void> {
  const { performance, settlement } = value;
  if (result.kind !== "hosted" || performance === undefined || settlement === undefined
    || !settlement.findingActions.some(action => action.disposition === "fix")
    || !result.findings.every(finding => settlement.evidence.some(receipt => receipt.findingId === finding.findingId))) return;
  await assertHostedFixSettlementHeads({ producerId: result.producerId, dispositionSetId: value.dispositionSet.dispositionSetId,
    performance, findingActions: settlement.findingActions, settlementEvidence: settlement.evidence,
    context: { repositoryId: result.repositoryId, lineage: result.admission.lineage, confirmResponseHeadContinuation } });
}
