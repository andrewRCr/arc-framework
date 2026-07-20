/** Deterministic state planning for one bounded review-response cycle. */

import { validateDispositionApproval, validateDispositionSet } from "./dispositions.js";
import {
  ReviewResponseInputSchema,
  ReviewResponsePlanSchema,
  type ReviewResponseCapability,
  type ReviewResponseInput,
  type ReviewResponsePlan,
  type ReviewResponseState,
} from "./response-plan-schema.js";

function plan(
  input: ReviewResponseInput,
  state: ReviewResponseState,
  options: {
    allowedCapabilities: ReviewResponseCapability[];
    nextAction: string;
    blocking: boolean;
  },
): ReviewResponsePlan {
  return ReviewResponsePlanSchema.parse({
    schemaVersion: 2,
    semanticsVersion: "review-response/v1",
    state,
    oldTarget: input.currentTarget,
    newTarget: input.candidateTarget,
    approvedDispositionSet: input.dispositionSet,
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
  if (input.dispositionSet === null || input.dispositionSet.findings.length !== input.findings.length) return false;
  const normalized = new Map(input.findings.map((finding) => [finding.findingId, finding]));
  return input.dispositionSet.findings.every((item) => {
    const finding = normalized.get(item.findingId);
    return finding !== undefined
      && finding.locus === item.locus
      && finding.severity === item.severity
      && finding.nit === item.nit;
  });
}

/** Project exactly one response state without provider commands or controller-private inputs. */
export function projectReviewResponse(inputValue: unknown): ReviewResponsePlan {
  const input = ReviewResponseInputSchema.parse(inputValue);
  if (input.dispositionSet === null || input.approval === null) {
    return input.capabilities.approve
      ? plan(input, "awaiting-approval", {
          allowedCapabilities: ["approve"],
          nextAction: "Present the complete disposition set and obtain exact approval.",
          blocking: true,
        })
      : blocked(input, "Approval capability is unavailable for the complete disposition set.");
  }

  try {
    const dispositionSet = validateDispositionSet(input.dispositionSet);
    validateDispositionApproval(dispositionSet, input.approval);
    if (dispositionSet.targetId !== input.currentTarget.targetId || !findingsMatch(input)) {
      return blocked(input, "The approved disposition set no longer matches the exact target and findings.");
    }
  } catch {
    return blocked(input, "The disposition approval is invalid or stale.");
  }

  const hasFix = input.dispositionSet.findings.some((finding) => finding.disposition === "fix");
  if (!hasFix) {
    return input.capabilities.close
      ? plan(input, "ready-to-close", {
          allowedCapabilities: ["close"],
          nextAction: "Return the approved non-fix dispositions to the channel adapter for closure.",
          blocking: false,
        })
      : blocked(input, "The channel closure capability required by the approved dispositions is unavailable.");
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
