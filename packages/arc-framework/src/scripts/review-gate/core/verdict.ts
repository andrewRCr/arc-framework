/** Complete host-neutral merge-readiness reduction. */

import type { ReviewRequirement } from "./contracts.js";
import type { GateBlocker, RequirementExecutionState } from "./execution.js";

/** Requirement state retained by the verdict. */
export interface VerdictRequirement {
  requirement: ReviewRequirement;
  state: RequirementExecutionState;
  sourceIdentity: string | null;
}

/** Reduced requirement detail for projection. */
export interface VerdictRequirementResult {
  requirementId: string;
  obligation: "required" | "recommended";
  state: RequirementExecutionState;
  sourceIdentity: string | null;
  blocking: boolean;
}

/** Complete current-state inputs. */
export interface GateVerdictInput {
  readiness: {
    draft: boolean;
    mergeability: "unknown" | "mergeable" | "conflicting";
    enforceBaseFreshness: boolean;
    baseFresh: boolean;
  };
  ci: { state: "pending" | "failure" | "success" };
  requirements: VerdictRequirement[];
  nativeReview: {
    requestedChanges: boolean;
    unresolvedRequiredConversations: number;
    decision: "not-configured" | "review-required" | "changes-requested" | "approved" | "unknown";
  };
  inconsistencies: string[];
}

/** One conclusion plus every blocker and detailed requirement state. */
export interface GateVerdict {
  conclusion: "pending" | "failure" | "success";
  blockers: GateBlocker[];
  requirements: VerdictRequirementResult[];
}

function stateSeverity(state: RequirementExecutionState): "pass" | "pending" | "failure" {
  if (state === "clean" || state === "waived") return "pass";
  if (state === "not-requested" || state === "queued" || state === "running" || state === "stale") return "pending";
  return "failure";
}

/** Reduce readiness, CI, review obligations, and consistency into one verdict. */
export function reduceGateVerdict(input: GateVerdictInput): GateVerdict {
  const blockers: GateBlocker[] = [];
  if (input.readiness.draft) blockers.push({ code: "draft", detail: "change request is draft" });
  if (input.readiness.mergeability === "unknown") {
    blockers.push({ code: "mergeability-pending", detail: "mergeability is unresolved" });
  } else if (input.readiness.mergeability === "conflicting") {
    blockers.push({ code: "merge-conflict", detail: "change request conflicts with its base" });
  }
  if (input.readiness.enforceBaseFreshness && !input.readiness.baseFresh) {
    blockers.push({ code: "base-freshness-pending", detail: "base freshness is required" });
  }
  if (input.ci.state !== "success") blockers.push({ code: `ci-${input.ci.state}`, detail: `CI is ${input.ci.state}` });

  const requirements = input.requirements.map((entry): VerdictRequirementResult => {
    const severity = stateSeverity(entry.state);
    const blocking = entry.requirement.obligation === "required" && severity !== "pass";
    if (blocking) {
      blockers.push({
        code: `requirement:${entry.requirement.id}:${entry.state}`,
        detail: `required ${entry.requirement.kind} is ${entry.state}`,
      });
    }
    return {
      requirementId: entry.requirement.id,
      obligation: entry.requirement.obligation,
      state: entry.state,
      sourceIdentity: entry.sourceIdentity,
      blocking,
    };
  });

  if (input.nativeReview.requestedChanges || input.nativeReview.decision === "changes-requested") {
    blockers.push({ code: "native-requested-changes", detail: "native review requests changes" });
  }
  if (input.nativeReview.unresolvedRequiredConversations > 0) {
    blockers.push({ code: "unresolved-required-conversations", detail: "required review conversations remain open" });
  }
  if (input.nativeReview.decision === "review-required") {
    blockers.push({ code: "native-review-pending", detail: "native review is still required" });
  } else if (input.nativeReview.decision === "unknown") {
    blockers.push({ code: "native-review-inconsistent", detail: "native review decision is unavailable" });
  }
  for (const inconsistency of input.inconsistencies) {
    blockers.push({
      code: inconsistency,
      detail: inconsistency === "stale-evidence" ? "evidence is stale" : "controller state is inconsistent",
    });
  }

  const failureCodes = new Set([
    "merge-conflict", "ci-failure", "native-requested-changes", "unresolved-required-conversations",
    "native-review-inconsistent", "malformed-receipt", "ledger-fork", "ledger-regression", "duplicate-projection",
    "invalid-capacity",
  ]);
  const hasFailure = blockers.some((blocker) =>
    failureCodes.has(blocker.code)
    || /^requirement:.*:(?:findings|failed|unavailable)$/u.test(blocker.code));
  return {
    conclusion: hasFailure ? "failure" : blockers.length > 0 ? "pending" : "success",
    blockers,
    requirements,
  };
}
