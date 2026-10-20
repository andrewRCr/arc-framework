/** Native policy calculation without a vehicle stops only when record evidence is required. */
import { resolveReviewPolicy, type ReviewPolicyCommandRequest, type ReviewResolveEnvelope } from "../policy/review-policy-driver.js";
import type { LanePolicyConfig } from "../policy/lane-policy-config.js";

/** Missing subject context for a policy request that needs native producer or lane-history evidence. */
export class ReviewPolicyContextError extends Error {
  readonly code = "invalid-input" as const;
  readonly correction = "Use the owning work-unit or Errand checkout, restore its branch link or claim if missing, "
    + "and retry the same request.";

  /** Preserve a repairable command refusal without selecting a different work item. */
  constructor() {
    super("Native review evidence requires an established work item.");
    this.name = "ReviewPolicyContextError";
  }
}

/** Evaluate an ownerless native request only when its existing policy predicates need no stored facts. */
export function resolveNativeOwnerlessReviewPolicy(request: ReviewPolicyCommandRequest,
  policy: LanePolicyConfig): ReviewResolveEnvelope {
  const terminal = request.attempts.at(-1);
  if (terminal?.outcome === "clean" || terminal?.outcome === "findings"
    || (request.lane === "standard" && policy.sources.length > 0 && request.standardReview.obligation !== "exempt")) {
    throw new ReviewPolicyContextError();
  }
  return resolveReviewPolicy({ ...request, sources: policy.sources, maxPasses: policy.maxPasses, stateOffBranch: true });
}
