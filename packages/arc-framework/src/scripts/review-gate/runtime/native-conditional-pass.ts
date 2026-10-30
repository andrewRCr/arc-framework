/** Approved-fix extra-pass authority is captured once as an immutable native decision. */
import type { ReviewDecisionPort, ReviewEvidencePort, ReviewOutcomePort, StoredReviewFact } from "../core/ports.js";
import { ReviewDecisionSchema, type ReviewDecision } from "../../../lib/store/kinds/review/decision/schema.js";
import { canonicalize } from "../../../lib/kernel/index.js";
import { reviewDecisionKey } from "../../../lib/store/kinds/review/decision/key.js";
import { createApprovedFixReviewDecision } from "../../../lib/store/kinds/review/decision/approved-fix.js";
import { StoredReviewResultReader } from "../hosts/local/stored-result-reader.js";
import type { captureConditionalNextPassAuthorization } from "../lane-progress-conditional.js";

/** Producer-bound capture request and one invocation's selected native ports. */
interface NativeConditionalPassCaptureInput {
  capture: Parameters<typeof captureConditionalNextPassAuthorization>[1];
  outcomes: ReviewOutcomePort;
  evidence: ReviewEvidencePort;
  decisions: ReviewDecisionPort;
  readProjectId(): Promise<string>;
}

/** Persist one conditional next-pass decision, retaining its captured time on replay. */
export async function publishNativeConditionalPass(input: NativeConditionalPassCaptureInput): Promise<StoredReviewFact<ReviewDecision>> {
  const { capture } = input;
  const result = await new StoredReviewResultReader(input).readResult(capture.producerId);
  if (capture.repositoryId !== result.repositoryId || capture.headSha !== result.target.headSha
    || capture.lane !== (result.kind === "frontline" ? "frontline" : "standard")
    || canonicalize(capture.lineage) !== canonicalize(result.admission.lineage)
    || capture.exhaustedPassCount !== result.admission.logicalPass || capture.nextPass !== capture.exhaustedPassCount + 1) {
    throw new Error("Conditional pass capture does not match its terminal producer; restore its original admission and retry.");
  }
  const decision = ReviewDecisionSchema.parse(createApprovedFixReviewDecision({ ...capture,
    originatingHeadSha: capture.headSha, capturedAt: capture.now }));
  const prior = await input.decisions.read(reviewDecisionKey(decision));
  if (prior !== null) {
    if (canonicalize({ ...prior.value, decidedAt: null }) !== canonicalize({ ...decision, decidedAt: null })) {
      throw new Error("Conditional pass capture conflicts with recorded authority; replay the original capture.");
    }
    return prior;
  }
  const approval = await input.evidence.read(capture.dispositionSetId);
  if (approval === null) throw new Error("Approve the fix response before capturing its conditional next pass, then retry.");
  if (approval.value.dispositionSet.producerId !== capture.producerId || approval.value.successorDispositionSetId !== null
    || !approval.value.dispositionSet.findings.some(finding => finding.disposition === "fix")) {
    throw new Error("Capture a conditional next pass only for the current approved fix response; obtain that approval and retry.");
  }
  if (approval.value.approval.approvedBy !== capture.authorizedBy) {
    throw new Error("Use the recorded disposition approver for this conditional pass, then retry.");
  }
  return input.decisions.create(decision);
}
