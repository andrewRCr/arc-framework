/** Registered review-source capabilities and lane, scope, and target eligibility. */
import type { z } from "zod";
import type { ReviewScopeModeSchema } from "../core/review-primitives.js";
import type { ReviewPolicyRequest, ReviewResolveEnvelope } from "./review-policy-driver.js";
type ReviewDiagnostic = ReviewResolveEnvelope["diagnostics"][number];
type ReviewNextAction = Extract<ReviewResolveEnvelope, { state: "ready" }>["nextAction"];

interface ReviewSourceCapability {
  lanes: readonly ReviewPolicyRequest["lane"][];
  scopes: readonly z.infer<typeof ReviewScopeModeSchema>[];
  requiresPullRequest: boolean;
  nextAction: ReviewNextAction;
}

export const REVIEW_SOURCE_CAPABILITIES: Readonly<Record<string, ReviewSourceCapability>> = {
  "coderabbit-cli": {
    lanes: ["frontline"],
    scopes: ["whole-target"],
    requiresPullRequest: false,
    nextAction: "run-frontline",
  },
  "coderabbit-pr": {
    lanes: ["standard"],
    scopes: ["whole-target"],
    requiresPullRequest: true,
    nextAction: "hosted-request",
  },
  "codex-pr": {
    lanes: ["standard"],
    scopes: ["whole-target"],
    requiresPullRequest: true,
    nextAction: "hosted-request",
  },
  "delegated-agent": {
    lanes: ["standard"],
    scopes: ["whole-target", "chunked"],
    requiresPullRequest: false,
    nextAction: "local-prepare",
  },
};

/** Describe a registered source's eligibility for one lane, scope, and target. */
export function sourceDiagnostic(
  sourceId: string,
  lane: ReviewPolicyRequest["lane"],
  scope: z.infer<typeof ReviewScopeModeSchema>,
  pullRequest: number | null,
): ReviewDiagnostic | null {
  const capability = REVIEW_SOURCE_CAPABILITIES[sourceId];
  if (capability === undefined) {
    return { code: "unknown-source", message: `Review source '${sourceId}' has no registered capability.` };
  }
  if (!capability.lanes.includes(lane)) {
    return { code: "source-lane-ineligible", message: `Review source '${sourceId}' cannot satisfy the ${lane} lane.` };
  }
  if (!capability.scopes.includes(scope)) {
    return { code: "source-scope-ineligible", message: `Review source '${sourceId}' cannot satisfy ${scope} scope.` };
  }
  if (capability.requiresPullRequest && pullRequest === null) {
    return { code: "source-awaits-change-request", message: `Review source '${sourceId}' requires a pull request.` };
  }
  return null;
}

