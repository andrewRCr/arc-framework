/** Persist and project status-carried ordinary grants before early returns or pure policy composition. */
import type { ReviewOperationStateStore } from "../core/ports.js";
import { readLaneProgressOwner } from "../lane-progress.js";
import { optionalReviewStatusJudgment, type ReviewStatusPolicyJudgment } from "../status-judgment.js";
import type { ReviewPolicyCommandRequest } from "../policy/review-policy-driver.js";
import type { ReviewInvocationInput } from "./invocation.js";
import { createHostedPassJudgmentContext } from "./native-hosted-pass-judgments.js";
import { reviewFactListingError } from "../../../lib/store/kinds/review/fact-access.js";

type StatusPassSubject = Omit<Parameters<typeof createHostedPassJudgmentContext>[0], keyof ReviewInvocationInput | "operationStore">
  & { policyTarget: ReviewPolicyCommandRequest["target"]; requestedCoverage?: "complete" | "incremental" };

/** Observe a subject only when explicit judgments or stored ordinary authority need native composition. */
export async function resolveNativeStatusPassJudgment(input: ReviewInvocationInput,
  operationStore: ReviewOperationStateStore, judgment: ReviewStatusPolicyJudgment | undefined,
  readSubject: () => Promise<StatusPassSubject>): Promise<ReviewStatusPolicyJudgment | undefined> {
  if (operationStore.stateOffBranch !== true) return judgment;
  const facts = operationStore.nativeFacts;
  if (facts === undefined) throw new Error("Restore the selected native review facts and retry status.");
  const listing = await facts.decisions.list();
  if (listing.status !== "complete") throw reviewFactListingError(listing);
  if (judgment?.ceilingOverride === undefined && judgment?.additionalPassAuthorization === undefined
    && !listing.records.some(({ value }) => value.choice.kind === "extra-pass"
      && value.choice.precondition.kind !== "approved-fix")) return judgment;
  const subject = await readSubject();
  const context = await createHostedPassJudgmentContext({ ...input, ...subject, operationStore });
  const owner = await readLaneProgressOwner(operationStore, { repositoryId: subject.repositoryId,
    headSha: subject.reviewTarget.headSha, lineage: subject.lineage, lane: "standard" });
  const projected = await context.resolveGrants({ target: subject.policyTarget,
    ceilingOverride: judgment?.ceilingOverride, additionalPassAuthorization: judgment?.additionalPassAuthorization,
    coverage: judgment?.coverage ?? subject.requestedCoverage }, owner);
  return optionalReviewStatusJudgment({ ...judgment, ceilingOverride: projected.ceilingOverride,
    additionalPassAuthorization: projected.additionalPassAuthorization });
}
