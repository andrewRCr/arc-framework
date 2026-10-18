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

const LOCAL_FIX_REVIEW_DIAGNOSTIC = {
  code: "material-fix-local-review-required",
  message: "The pass after material fixes must run locally on delegated-agent to re-examine the repairs.",
};

function selectDeltaReviewSources(configured: readonly string[], forced: string | undefined) {
  const reason = { code: "delta-check-local-review-required",
    message: "The delta check must run locally on delegated-agent to review the proven range." };
  if (!configured.includes("delegated-agent")) return { sources: [], refusal: {
    code: "delta-check-local-source-unconfigured",
    message: "The delta check requires delegated-agent, which review.standard_sources omits.",
  } };
  if (forced !== undefined && forced !== "delegated-agent") return { sources: [], refusal: reason };
  return { sources: ["delegated-agent"], refusal: null, reason };
}

/** Select fresh-pass candidates without changing the list that binds recorded attempts. */
export function selectReviewSources(request: Pick<ReviewPolicyRequest,
  "lane" | "invocation" | "sources" | "selectionSources" | "configuredSources" | "nextPassContext">): {
  sources: readonly string[];
  refusal: ReviewDiagnostic | null;
  reason?: ReviewDiagnostic;
} {
  const forced = request.lane === "standard" && request.invocation?.mode === "force"
    ? request.invocation.sourceId : undefined;
  const selection = request.selectionSources ?? request.sources;
  const configured = request.configuredSources ?? selection;
  if (request.lane === "standard" && request.nextPassContext?.incremental?.basis === "delta-check") {
    return selectDeltaReviewSources(configured, forced);
  }
  if (request.lane === "standard" && request.nextPassContext?.convergence === "unconverged") {
    if (!configured.includes("delegated-agent")) {
      return { sources: [], refusal: {
        code: "material-fix-local-source-unconfigured",
        message: "The pass after material fixes requires delegated-agent, which review.standard_sources omits.",
      } };
    }
    if ((forced !== undefined && forced !== "delegated-agent") || !selection.includes("delegated-agent")) {
      return { sources: [], refusal: LOCAL_FIX_REVIEW_DIAGNOSTIC };
    }
    return { sources: ["delegated-agent"], refusal: null, reason: LOCAL_FIX_REVIEW_DIAGNOSTIC };
  }
  if (forced !== undefined && !selection.includes(forced)) {
    return { sources: [], refusal: {
      code: "selected-source-ineligible",
      message: `Explicitly selected review source '${forced}' is outside the current selection policy.`,
    } };
  }
  return { sources: selection.slice(forced === undefined ? 0 : selection.indexOf(forced)), refusal: null };
}

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

