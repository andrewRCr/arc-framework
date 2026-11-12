/** Approved-fix extra-pass authority is captured once as an immutable native decision. */
import type { ReviewDecisionPort, ReviewEvidencePort, ReviewOutcomePort, ReviewResponsePort, StoredReviewFact } from "../core/ports.js";
import { ReviewDecisionSchema, type ReviewDecision } from "../../../lib/store/kinds/review/decision/schema.js";
import { canonicalize } from "../../../lib/kernel/index.js";
import { reviewDecisionKey } from "../../../lib/store/kinds/review/decision/key.js";
import { createApprovedFixReviewDecision } from "../../../lib/store/kinds/review/decision/approved-fix.js";
import { StoredReviewResultReader } from "../hosts/local/stored-result-reader.js";
import { conditionalPassFollowsProducer } from "../core/operation-state-schema.js";
import type { captureConditionalNextPassAuthorization } from "../lane-progress-conditional.js";

/** Producer-bound capture request and one invocation's selected native ports. */
interface NativeConditionalPassCaptureInput {
  capture: Parameters<typeof captureConditionalNextPassAuthorization>[1];
  outcomes: ReviewOutcomePort;
  evidence: ReviewEvidencePort;
  decisions: ReviewDecisionPort;
  responses: ReviewResponsePort;
  readProjectId(): Promise<string>;
}

/** Persist one conditional next-pass decision, retaining its captured time on replay. */
export async function publishNativeConditionalPass(input: NativeConditionalPassCaptureInput): Promise<StoredReviewFact<ReviewDecision>> {
  const { capture } = input;
  const authority = await new StoredReviewResultReader(input).readAuthority(capture.producerId);
  const { result } = authority;
  if (capture.repositoryId !== result.repositoryId || capture.headSha !== result.target.headSha
    || capture.lane !== (result.kind === "frontline" ? "frontline" : "standard")
    || canonicalize(capture.lineage) !== canonicalize(result.admission.lineage)
    || !conditionalPassFollowsProducer(capture, result.admission.logicalPass)) {
    throw new Error("Conditional pass capture does not match its terminal producer; restore its original admission and retry.");
  }
  const decision = ReviewDecisionSchema.parse(createApprovedFixReviewDecision({ ...capture,
    originatingHeadSha: capture.headSha, capturedAt: capture.now }));
  const approval = authority.evidence.find(record => record.value.dispositionSet.dispositionSetId === capture.dispositionSetId);
  if (approval === undefined) throw new Error("Approve the fix response in the selected branch before capturing its conditional next pass, then retry.");
  if (approval.value.successorDispositionSetId !== null
    || !approval.value.dispositionSet.findings.some(finding => finding.disposition === "fix")) {
    throw new Error("Capture a conditional next pass only for the current approved fix response in the selected branch.");
  }
  if (approval.value.approval.approvedBy !== capture.authorizedBy) {
    throw new Error("Use the recorded disposition approver for this conditional pass, then retry.");
  }
  const prior = await input.decisions.read(reviewDecisionKey(decision));
  if (prior !== null) {
    if (canonicalize({ ...prior.value, decidedAt: null }) !== canonicalize({ ...decision, decidedAt: null })) {
      throw new Error("Conditional pass capture conflicts with recorded authority; replay the original capture.");
    }
    return prior;
  }
  return input.decisions.create(decision);
}
