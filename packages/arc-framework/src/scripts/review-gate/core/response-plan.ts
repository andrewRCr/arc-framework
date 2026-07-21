/** Deterministic state planning for one bounded review-response cycle. */

import { validateDispositionState } from "./dispositions.js";
import { createFixAuthorization } from "./fix-authorization.js";
import {
  ReviewResponseInputSchema,
  ReviewResponsePlanSchema,
  type ReviewResponseCapability,
  type ReviewResponseInput,
  type ReviewResponsePlan,
  type ReviewResponseState,
} from "./response-plan-schema.js";

function projectChannelActions(
  input: ReviewResponseInput,
  state: ReviewResponseState,
): ReviewResponsePlan["channelActions"] {
  if (state !== "ready-to-close" || input.channel !== "hosted") return [];
  const actions: ReviewResponsePlan["channelActions"] = [];
  for (const capability of input.conversations) {
    const known = input.findings.some((finding) => finding.findingId === capability.findingId);
    if (!known) continue;
    if (capability.kind === "controller-finding") {
      if (!capability.canReply && !capability.canResolve) continue;
      actions.push({
        kind: capability.kind,
        findingId: capability.findingId,
        receiptHandle: capability.receiptHandle,
        replyHandle: capability.replyHandle,
        threadStateHandle: capability.threadStateHandle,
        reply: capability.canReply,
        resolve: capability.canResolve,
      });
    } else {
      actions.push({
        kind: capability.kind,
        findingId: capability.findingId,
        providerReplyHandle: capability.providerReplyHandle,
        threadStateHandle: capability.threadStateHandle,
        decisiveReviewHandle: capability.decisiveReviewHandle,
        reply: capability.canReply,
      });
    }
  }
  return actions;
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
    channelActions: projectChannelActions(input, state),
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
      && finding.severity === item.severity
      && finding.nit === item.nit;
  });
}

/** Project exactly one response state without provider commands or controller-private inputs. */
export function projectReviewResponse(inputValue: unknown): ReviewResponsePlan {
  const input = ReviewResponseInputSchema.parse(inputValue);
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
