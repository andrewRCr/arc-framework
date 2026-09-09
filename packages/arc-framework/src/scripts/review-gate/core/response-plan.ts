/** Deterministic state planning for one bounded local review-response cycle. */

import { validateDispositionState } from "./dispositions.js";
import { createFixAuthorization } from "./fix-authorization.js";
import { validateReviewTarget } from "./gate-contract-v2.js";
import {
  ReviewResponseInputSchema,
  ReviewResponsePlanSchema,
  ReviewResponseSettlementActionSchema,
  ReviewResponseSettlementRequestSchema,
  type ReviewResponseCapability,
  type ReviewResponseInput,
  type ReviewResponsePlan,
  type ReviewResponseSettlementAction,
  type ReviewResponseSettlementRequest,
  type ReviewResponseState,
} from "./response-plan-schema.js";

/** Compose the exact approved local/frontline settlement action consumed by `review respond`. */
export function composeReviewResponseSettlementAction(input: {
  originTarget: ReviewResponseSettlementAction["originTarget"];
  fixTarget: ReviewResponseSettlementAction["fixTarget"];
  request: ReviewResponseSettlementRequest;
}): ReviewResponseSettlementAction {
  const request = ReviewResponseSettlementRequestSchema.parse(input.request);
  const dispositions = validateDispositionState(request.dispositions);
  if (dispositions.state !== "approved") throw new Error("settlement requires approved dispositions");
  const originTarget = validateReviewTarget(input.originTarget);
  const fixTarget = input.fixTarget === null ? null : validateReviewTarget(input.fixTarget);
  return ReviewResponseSettlementActionSchema.parse({
    channel: "review-response",
    dispositionId: dispositions.dispositionSet.dispositionSetId,
    originTarget,
    fixTarget,
    actors: {
      approverIdentity: dispositions.approval.approvedBy,
      proposerIdentity: dispositions.dispositionSet.proposedBy,
    },
    findingIds: dispositions.dispositionSet.findings.map(({ findingId }) => findingId).sort(),
    request: { ...request, dispositions },
  });
}

function plan(
  input: ReviewResponseInput,
  state: ReviewResponseState,
  options: {
    allowedCapabilities: ReviewResponseCapability[];
    nextAction: string;
    blocking: boolean;
  },
): ReviewResponsePlan {
  const approved = input.dispositionState?.state === "approved" ? input.dispositionState : null;
  const hasApprovedFix = approved?.dispositionSet.findings.some((finding) => finding.disposition === "fix") ?? false;
  return ReviewResponsePlanSchema.parse({
    schemaVersion: 2,
    semanticsVersion: "review-response/v1",
    state,
    oldTarget: input.currentTarget,
    newTarget: input.candidateTarget,
    dispositionState: approved,
    fixAuthorization: state === "ready-to-fix" && approved !== null && hasApprovedFix
      ? createFixAuthorization({ dispositionState: approved, oldTarget: input.currentTarget })
      : null,
    verificationRefs: input.verificationRefs,
    blocking: options.blocking,
    allowedCapabilities: options.allowedCapabilities,
    nextAction: options.nextAction,
  });
}

function blocked(input: ReviewResponseInput, nextAction: string): ReviewResponsePlan {
  return plan(input, "blocked", { allowedCapabilities: [], nextAction, blocking: true });
}

function findingsMatch(input: ReviewResponseInput): boolean {
  if (input.dispositionState?.state !== "approved"
    || input.dispositionState.dispositionSet.findings.length !== input.findings.length) return false;
  const normalized = new Map(input.findings.map((finding) => [finding.findingId, finding]));
  return input.dispositionState.dispositionSet.findings.every((item) => {
    const finding = normalized.get(item.findingId);
    return finding !== undefined
      && finding.locus === item.locus
      && finding.severity === item.reportedSeverity
      && finding.nit === item.reportedNit;
  });
}

/** Project exactly one response state without provider commands or host-private inputs. */
export function projectReviewResponse(inputValue: unknown): ReviewResponsePlan {
  const parsed = ReviewResponseInputSchema.parse(inputValue);
  const input = {
    ...parsed,
    currentTarget: validateReviewTarget(parsed.currentTarget),
    candidateTarget: parsed.candidateTarget === null ? null : validateReviewTarget(parsed.candidateTarget),
  };
  if (input.dispositionState === null) {
    return input.capabilities.approve
      ? plan(input, "awaiting-approval", {
          allowedCapabilities: ["approve"],
          nextAction: "Present the complete disposition set and obtain exact approval.",
          blocking: true,
        })
      : blocked(input, "Approval capability is unavailable for the complete disposition set.");
  }

  let dispositionState;
  try {
    dispositionState = validateDispositionState(input.dispositionState);
  } catch {
    return blocked(input, "The disposition state is invalid or stale.");
  }
  if (dispositionState.state === "proposed") {
    return input.capabilities.approve
      ? plan(input, "awaiting-approval", {
          allowedCapabilities: ["approve"],
          nextAction: "Present the complete disposition set and obtain exact approval.",
          blocking: true,
        })
      : blocked(input, "Approval capability is unavailable for the complete disposition set.");
  }

  const dispositionSet = dispositionState.dispositionSet;
  if (dispositionSet.targetId !== input.currentTarget.targetId || !findingsMatch(input)) {
    return blocked(input, "The approved disposition set no longer matches the exact target and findings.");
  }

  const hasFix = input.dispositionState.dispositionSet.findings.some((finding) => finding.disposition === "fix");
  if (!hasFix) {
    return input.capabilities.close
      ? plan(input, "ready-to-close", {
          allowedCapabilities: ["close"],
          nextAction: "Return the approved non-fix dispositions to the caller for closure.",
          blocking: false,
        })
      : blocked(input, "The caller closure capability required by the approved dispositions is unavailable.");
  }

  if (input.candidateTarget === null) {
    return input.capabilities.fix
      ? plan(input, "ready-to-fix", {
          allowedCapabilities: ["fix"],
          nextAction: "Apply the approved fixes as one bounded review increment.",
          blocking: true,
        })
      : blocked(input, "Fix capability is unavailable for the approved disposition set.");
  }
  if (input.candidateTarget.targetId === input.currentTarget.targetId) {
    return blocked(input, "The candidate target does not prove a changed exact target.");
  }
  if (!input.verificationPassed || input.verificationRefs.length === 0) {
    return blocked(input, "The changed target lacks successful verification evidence.");
  }
  if (input.persistedTargetId !== input.candidateTarget.targetId) {
    return input.capabilities.persist
      ? plan(input, "ready-to-persist", {
          allowedCapabilities: ["persist"],
          nextAction: "Persist the verified candidate target through the caller's release interlock.",
          blocking: true,
        })
      : blocked(input, "Persistence capability is unavailable for the verified candidate target.");
  }
  return input.capabilities.reroute
    ? plan(input, "reroute", {
        allowedCapabilities: ["reroute"],
        nextAction: "Return the persisted target to review routing for the permitted follow-up.",
        blocking: false,
      })
    : blocked(input, "Review routing is unavailable for the persisted changed target.");
}
