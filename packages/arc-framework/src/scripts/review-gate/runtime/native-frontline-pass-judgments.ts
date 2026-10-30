/** Bind ordinary frontline grants to their native owner and exact target before admission replay. */
import { readConfigSettings } from "../../../lib/config/status-reader.js";
import { readCandidateRecord } from "../../../lib/store/kinds/review/candidate/access.js";
import { readRepositoryCandidateSupersessionChain } from "../../../lib/store/kinds/review/candidate/history.js";
import type { LaneSubjectLineage } from "../core/lane-admission.js";
import type { ReviewOperationStateStore } from "../core/ports.js";
import { RepositoryDeliveryMemberLookup } from "../hosts/local/delivery-member-lookup.js";
import { readLaneProgressOwner, readCandidateInheritedLaneProgress } from "../lane-progress.js";
import type { FrontlineCommandRequest } from "../policy/frontline-command-schema.js";
import type { ReviewInvocationInput } from "./invocation.js";
import { resolveLocalPolicyTarget } from "./local-correction-context.js";
import { requestedExtraPasses } from "./native-extra-pass-input.js";
import { resolveNativeInvocationExtraPassJudgment } from "./native-extra-pass.js";
import { readNativeDecisionSubject } from "./native-policy-grants.js";
import { reviewFactListingError } from "../../../lib/store/kinds/review/fact-access.js";

/** Preserve repository resolution and bind native authority before any pending-admission shortcut. */
export function createNativeFrontlinePassJudgmentResolver(input: ReviewInvocationInput,
  operationStore: ReviewOperationStateStore):
  ((request: FrontlineCommandRequest, lineage: LaneSubjectLineage) => Promise<FrontlineCommandRequest>) | undefined {
  if (operationStore.stateOffBranch !== true) return undefined;
  return async (request, lineage) => {
    const facts = operationStore.nativeFacts;
    if (facts === undefined) throw new Error("Restore the selected native review facts and retry frontline resolution.");
    const listing = await facts.decisions.list();
    if (listing.status !== "complete") throw reviewFactListingError(listing);
    if (request.policyJudgment?.ceilingOverride === undefined
      && !listing.records.some(({ value }) => value.choice.kind === "extra-pass" && value.choice.precondition.kind === "ceiling")) return request;
    const repositoryId = await facts.readProjectId();
    const target = request.target;
    const owner = await readLaneProgressOwner(operationStore, { lane: "frontline", repositoryId, headSha: target.headSha, lineage });
    const workUnit = input.workItem?.name;
    const candidate = lineage.kind !== "candidate" || workUnit === undefined ? null
      : await readCandidateRecord(input.cwd, workUnit, { ...input, owner: input.workItem });
    const ancestors = candidate === null || workUnit === undefined ? []
      : await readRepositoryCandidateSupersessionChain({ ...input, workUnit, record: candidate });
    const inherited = await readCandidateInheritedLaneProgress(operationStore, { lane: "frontline", repositoryId,
      headSha: target.headSha, ancestors });
    const baseBranch = (await readConfigSettings(input.cwd)).settings["branch.base"];
    const policyTarget = await readFrontlinePolicyTarget(input, request, repositoryId, baseBranch);
    const value = { repositoryId, subject: { lineage, headSha: target.headSha,
      subjectDigest: lineage.kind === "candidate" ? null : target.targetId }, policyTarget,
      completedPasses: (owner?.completedPasses ?? 0) + inherited.inheritedCompletedPasses,
      lane: "frontline" as const, judgment: request.policyJudgment };
    const needsSubject = requestedExtraPasses({ ...value, facts }).some(choice => choice.decisionKey === undefined);
    const subject = !needsSubject ? value.subject
      : await readNativeDecisionSubject({ ...input, target, lineage, workUnit, candidate, baseBranch });
    const resolved = await resolveNativeInvocationExtraPassJudgment(input, facts, { ...value, subject });
    return { ...request, ...(resolved.judgment === undefined ? {} : { policyJudgment: resolved.judgment }) };
  };
}

async function readFrontlinePolicyTarget(input: ReviewInvocationInput, request: FrontlineCommandRequest,
  repositoryId: string, baseBranch: string) {
  if (request.vehicle === undefined) return resolveLocalPolicyTarget(input, repositoryId, request.target, baseBranch);
  const member = await new RepositoryDeliveryMemberLookup(input).resolveMemberByVehicle(request.vehicle);
  if (member.status !== "resolved" || member.member.headRef === null || member.member.baseRef === null) {
    throw new Error("Refresh the delivery member's retained branch and target, then retry its frontline judgment.");
  }
  return resolveLocalPolicyTarget({ ...input, headRef: member.member.headRef }, repositoryId, request.target, member.member.baseRef);
}
