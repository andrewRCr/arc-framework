/** Requirement execution state derived from evidence, receipts, and capacity. */

import type { ReviewRequirement } from "./contracts.js";
import type { Evidence } from "./evidence.js";
import type {
  RequirementExecutionState,
  ReviewReceipt,
  SourceCapacity,
} from "./execution.js";

/** Inputs for one requirement's current execution state. */
export interface RequirementStateInput {
  requirement: ReviewRequirement;
  evidence: Evidence[];
  receipts: ReviewReceipt[];
  capacity: SourceCapacity | null;
  waived: boolean;
  coverageSatisfied: boolean;
  findingsConsistent: boolean;
  openFindingCount: number;
}

/** Current state plus blocking and history qualifiers. */
export interface RequirementStateResult {
  state: RequirementExecutionState;
  blocking: boolean;
  historyEligible: boolean;
  detail: string;
}

function result(
  requirement: ReviewRequirement,
  state: RequirementExecutionState,
  detail: string,
  historyEligible = false,
): RequirementStateResult {
  return {
    state,
    blocking: requirement.obligation === "required" && state !== "clean" && state !== "waived",
    historyEligible,
    detail,
  };
}

/** Reduce one requirement without changing its underlying obligation. */
export function reduceRequirementState(input: RequirementStateInput): RequirementStateResult {
  if (input.waived) return result(input.requirement, "waived", "authorized waiver");
  const current = input.evidence.filter((item) =>
    item.requirementId === input.requirement.id
    && item.policyVersion === input.requirement.policyVersion
    && item.rubricVersion === input.requirement.rubricVersion
    && item.changeSetId === input.requirement.changeSetId
    && item.headSha === input.requirement.headSha);
  const latest = [...current].sort((left, right) => left.observedAt.localeCompare(right.observedAt)).at(-1);

  if (latest?.result === "failed") return result(input.requirement, "failed", "current evidence failed");
  if (latest?.result === "unavailable") {
    return result(input.requirement, "unavailable", "current source unavailable");
  }
  if (!input.findingsConsistent) return result(input.requirement, "failed", "finding history is inconsistent");
  if (input.openFindingCount > 0) {
    return result(input.requirement, "findings", "current findings remain open");
  }
  if (latest?.result === "findings") {
    return result(input.requirement, "not-requested", "findings closed without current clean evidence");
  }
  if (latest?.result === "clean" && input.coverageSatisfied) {
    return result(input.requirement, "clean", "current coverage and closures satisfy the requirement");
  }
  if (input.evidence.length > 0) {
    return result(input.requirement, "stale", "evidence does not satisfy the current change set", true);
  }

  const receipts = input.receipts.filter((receipt) => receipt.request.requirementId === input.requirement.id);
  const latestReceipt = receipts.at(-1);
  if (latestReceipt?.action === "acknowledged") return result(input.requirement, "running", "request acknowledged");
  if (latestReceipt?.action === "reserved") return result(input.requirement, "queued", "request reserved");
  if (latestReceipt?.action === "terminal-failure") return result(input.requirement, "failed", "request failed");
  if (input.capacity?.status === "exhausted" || input.capacity?.reason === "lookup-failed") {
    return result(input.requirement, "unavailable", `source capacity: ${input.capacity.reason}`);
  }
  return result(input.requirement, "not-requested", "no request or qualifying evidence");
}
