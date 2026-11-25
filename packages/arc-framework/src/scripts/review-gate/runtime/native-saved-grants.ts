/** Compare replayed grants against the selected subject's prepared progress without recording authority. */
import { canonicalize } from "../../../lib/kernel/index.js";
import type { NativeReviewFactPorts } from "../core/ports.js";
import type { PrePublicationGrantContext } from "../policy/pre-publication-contract.js";
import type { ConfirmResponseHeadContinuation } from "../core/response-head-continuation.js";
import { readNativeApprovedFixPassJudgment } from "./native-frontline-window.js";
import { recordedNativeExtraPassJudgmentMatches } from "./native-extra-pass.js";

/** Use the existing ordinary and approved-fix readers with the same context as the selected lane. */
export async function nativeSavedGrantMatches(facts: NativeReviewFactPorts, context: PrePublicationGrantContext,
  confirmResponseHeadContinuation: ConfirmResponseHeadContinuation): Promise<boolean> {
  const repositoryId = context.repositoryId ?? await facts.readProjectId();
  const supplied = context.judgment?.ceilingOverride;
  if (supplied?.conditionalPassAuthorizationId === undefined) {
    return recordedNativeExtraPassJudgmentMatches({ ...context, facts, repositoryId });
  }
  const conditional = await readNativeApprovedFixPassJudgment(facts, { repositoryId, lane: context.lane,
    lineage: context.subject.lineage, headSha: context.policyTarget.headSha, passCount: context.completedPasses,
    confirmResponseHeadContinuation });
  return conditional !== undefined && canonicalize(conditional) === canonicalize(supplied);
}
