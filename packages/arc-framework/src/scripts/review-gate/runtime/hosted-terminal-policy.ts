/** Resolve immutable hosted terminal evidence with ordinary authority from the selected native owner. */
import { reviewFactListingError } from "../../../lib/store/kinds/review/fact-access.js";
import type { LaneSubjectLineage } from "../core/lane-admission.js";
import type { ReviewOperationStateStore } from "../core/ports.js";
import type { ReviewTarget } from "../core/gate-contract-v2-schema.js";
import type { ReviewScopeMode } from "../core/review-primitives.js";
import { projectReviewPolicyAttempt, type ReviewPolicyCommandRequest } from "../policy/review-policy-driver.js";
import { resolveEvidenceBoundReviewPolicy, type EvidenceBoundReviewPolicyDependencies } from "../policy/review-policy-evidence.js";
import type { ReviewNextPassContext } from "../policy/review-next-pass-schema.js";
import { resolveNativeExtraPassJudgment } from "./native-extra-pass.js";
import { projectNativePolicyGrants } from "./native-policy-grants.js";

export interface HostedTerminalProducer {
  readonly attemptId: string;
  readonly logicalPass: number;
  readonly sourceId: string;
  readonly outcome: "clean" | "settled-findings";
  readonly producerTarget: ReviewTarget;
  readonly scopeMode?: ReviewScopeMode;
  readonly chunkSeriesComplete?: boolean;
}

/** Keep repository policy unchanged and read native grants without resolving or recording a fresh decider. */
export async function resolveHostedTerminalPolicy(input: {
  terminal: HostedTerminalProducer;
  operationStore: ReviewOperationStateStore;
  repositoryId: string;
  lineage: LaneSubjectLineage | undefined;
  currentTarget: ReviewTarget;
  changeRequest: { repository: string; pullRequest: number } | null;
  sources: readonly string[];
  standardReview: ReviewPolicyCommandRequest["standardReview"];
  maxPasses: () => Promise<number>;
  nextPassContext: () => Promise<ReviewNextPassContext>;
  evidence: Omit<EvidenceBoundReviewPolicyDependencies, "sources" | "maxPasses" | "nextPassContext" | "confirmTarget">;
}) {
  const { terminal } = input;
  if (input.changeRequest === null) throw new Error("Terminal review policy requires exact change-request coordinates.");
  const target = { ...input.changeRequest, headSha: terminal.producerTarget.headSha };
  const nextPassContext = await input.nextPassContext();
  const request: ReviewPolicyCommandRequest = { schemaVersion: 1, target, lane: "standard", frontlineActive: false,
    standardReview: input.standardReview,
    completedPasses: terminal.logicalPass, attempts: [projectReviewPolicyAttempt(terminal)],
    ...(terminal.scopeMode === undefined ? {} : { scopeSelection: { mode: terminal.scopeMode, target } }) };
  return resolveEvidenceBoundReviewPolicy(await readNativeTerminalGrants(input, request), {
    ...input.evidence, sources: input.sources, maxPasses: await input.maxPasses(), nextPassContext,
    confirmTarget: () => Promise.resolve(terminal.producerTarget),
  });
}

async function readNativeTerminalGrants(input: Parameters<typeof resolveHostedTerminalPolicy>[0],
  request: ReviewPolicyCommandRequest): Promise<ReviewPolicyCommandRequest> {
  if (input.operationStore.stateOffBranch !== true) return request;
  const facts = input.operationStore.nativeFacts;
  if (facts === undefined) throw new Error("Restore the selected native review facts and retry reservation discharge.");
  const listing = await facts.decisions.list();
  if (listing.status !== "complete") throw reviewFactListingError(listing);
  if (!listing.records.some(({ value }) => value.choice.kind === "extra-pass"
    && value.choice.precondition.kind !== "approved-fix")) return request;
  if (input.lineage === undefined) throw new Error("Restore the reservation's exact review lineage before reading its grants.");
  const resolved = await resolveNativeExtraPassJudgment({ facts, repositoryId: input.repositoryId,
    subject: { lineage: input.lineage, headSha: input.currentTarget.headSha,
      subjectDigest: input.lineage.kind === "candidate" ? null : input.currentTarget.targetId },
    lane: "standard", completedPasses: input.terminal.logicalPass, policyTarget: request.target });
  const sameHead = input.currentTarget.headSha === input.terminal.producerTarget.headSha;
  const judgment = sameHead ? resolved.judgment : { ceilingOverride: resolved.judgment?.ceilingOverride };
  return projectNativePolicyGrants(request, { ...resolved, judgment }, false);
}
