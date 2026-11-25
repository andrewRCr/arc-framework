/** Consumed frontline retry authority is read from the failed portable attempt's decision citation. */
import { canonicalize } from "../../../lib/kernel/index.js";
import { reviewDecisionKey } from "../../../lib/store/kinds/review/decision/key.js";
import type { FrontlineAdmission } from "../core/frontline-admission.js";
import { frontlineRetryContract, type FrontlineRetryCeilingOverride } from "../core/frontline-retry-contract.js";
import { laneSubjectOwnerMatches } from "../core/lane-admission.js";
import type { NativeReviewFactPorts } from "../core/ports.js";

/** Recover only the decision consumed by this exact inconclusive admission under its recorded contract. */
export async function readStoredFrontlineRetryCeilingOverride(facts: NativeReviewFactPorts,
  admission: FrontlineAdmission): Promise<FrontlineRetryCeilingOverride | undefined> {
  const projectId = await facts.readProjectId();
  if (projectId !== admission.target.repositoryId) return undefined;
  const stored = await facts.outcomes.read(admission.operationId), outcome = stored?.value;
  if (outcome?.frontline === undefined || outcome.admittedBy === undefined || outcome.target.repositoryId !== projectId
    || outcome.outcome === "clean" || outcome.outcome === "findings") return undefined;
  const bound = outcome.frontline.admission;
  if (bound.retryGeneration > admission.retryGeneration
    || canonicalize(frontlineRetryContract(bound)) !== canonicalize(frontlineRetryContract(admission))) return undefined;
  const decision = await facts.decisions.read(outcome.admittedBy);
  if (decision === null) throw new Error(`Restore conditional decision '${outcome.admittedBy}' before retrying this frontline review.`);
  const choice = decision.value.choice;
  if (choice.kind !== "extra-pass" || choice.precondition.kind !== "approved-fix" || decision.value.lane !== "frontline"
    || choice.precondition.repositoryId !== projectId || !laneSubjectOwnerMatches(decision.value.subject.lineage, admission.lineage)
    || choice.precondition.exhaustedPassCount + 1 !== admission.logicalPass
    || reviewDecisionKey(decision.value) !== outcome.admittedBy) return undefined;
  return { exhaustedPassCount: choice.precondition.exhaustedPassCount, nextPass: choice.precondition.exhaustedPassCount + 1,
    conditionalPassAuthorizationId: reviewDecisionKey(decision.value) };
}
