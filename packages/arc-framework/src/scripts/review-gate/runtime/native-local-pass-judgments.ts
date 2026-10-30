/** Bind ordinary local pass judgments before either pending replay or fresh execution admission. */
import { readConfigSettings } from "../../../lib/config/status-reader.js";
import { canonicalize } from "../../../lib/kernel/index.js";
import type { ReviewOperationStateStore } from "../core/ports.js";
import { readLaneProgressOwner, readCandidateInheritedLaneProgress } from "../lane-progress.js";
import { projectDeliveryLocalReviewAdmissionIdentity } from "../policy/delivery-local-review-admission.js";
import { bindJudgment } from "../policy/review-execution-admission.js";
import { projectReviewCeilingJudgment } from "../policy/review-ceiling-override.js";
import { projectReviewAdditionalPassJudgment } from "../policy/review-additional-pass.js";
import { resolveLocalPolicyTarget } from "./local-correction-context.js";
import { requestedExtraPasses } from "./native-extra-pass-input.js";
import { resolveNativeInvocationExtraPassJudgment, type NativeExtraPassInput } from "./native-extra-pass.js";
import { readNativeDecisionSubject, projectNativePolicyGrants } from "./native-policy-grants.js";
import type { LocalReviewInvocationInput } from "./local-review-invocation.js";
import type { LocalPrepareDependencies, LocalPrepareRequest } from "./local-prepare.js";
import { reviewFactListingError } from "../../../lib/store/kinds/review/fact-access.js";

interface LocalPassJudgmentContext {
  input: LocalReviewInvocationInput;
  operationStore: ReviewOperationStateStore;
  subjects: Pick<LocalPrepareDependencies, "resolveVehicle" | "resolveLineage" | "resolveSupersessionAncestors">;
  deriveTarget: LocalPrepareDependencies["deriveTarget"];
  validateDeliveryAdmission: LocalPrepareDependencies["validateDeliveryAdmission"];
}

/** Preserve the repository arm and avoid requiring fresh subject observations when no ordinary decision exists. */
export function createNativeLocalPassJudgmentResolver(context: LocalPassJudgmentContext): LocalPrepareDependencies["resolvePassJudgments"] {
  if (context.operationStore.stateOffBranch !== true) return undefined;
  return async request => {
    const facts = context.operationStore.nativeFacts;
    if (facts === undefined) throw new Error("Restore the selected native review facts and retry local preparation.");
    const listing = await facts.decisions.list();
    if (listing.status !== "complete") throw reviewFactListingError(listing);
    if (request.policyJudgment?.ceilingOverride === undefined && request.policyJudgment?.additionalPassAuthorization === undefined
      && request.deliveryAdmission?.ceilingOverride === undefined && request.deliveryAdmission?.additionalPassAuthorization === undefined
      && !listing.records.some(({ value }) => value.choice.kind === "extra-pass" && value.choice.precondition.kind !== "approved-fix")) return request;
    const bound = await readLocalPassSubject(request, context, await facts.readProjectId());
    const settings = (await readConfigSettings(context.input.cwd)).settings;
    const policyTarget = request.deliveryAdmission?.target
      ?? await resolveLocalPolicyTarget(context.input, bound.repositoryId, bound.target, settings["branch.base"]);
    const value = { repositoryId: bound.repositoryId, subject: { lineage: bound.lineage, headSha: bound.target.headSha,
      subjectDigest: bound.lineage.kind === "candidate" ? null : bound.target.targetId }, policyTarget,
      completedPasses: bound.completedPasses, lane: "standard" as const,
      judgment: request.policyJudgment, ceilingOverride: request.deliveryAdmission?.ceilingOverride,
      additionalPassAuthorization: request.deliveryAdmission?.additionalPassAuthorization };
    const needsSubject = requestedExtraPasses({ ...value, facts }).some(choice => choice.decisionKey === undefined);
    const subject = !needsSubject ? value.subject : await readNativeDecisionSubject({ ...context.input,
      target: bound.target, lineage: bound.lineage, workUnit: bound.workUnit, baseBranch: settings["branch.base"] });
    const resolved = await resolveNativeInvocationExtraPassJudgment(context.input, facts, { ...value, subject });
    return projectLocalPassJudgments(request, { ...value, subject, facts }, resolved);
  };
}

async function readLocalPassSubject(request: LocalPrepareRequest, context: LocalPassJudgmentContext, repositoryId: string) {
  const subject = await context.subjects.resolveVehicle(request.memberHeadObjectId, request.deliveryAdmission);
  const headSha = subject.member?.head ?? (await context.input.exec("git", ["rev-parse", "HEAD"], { cwd: context.input.cwd })).stdout.trim();
  const lineage = await context.subjects.resolveLineage(subject.vehicle, headSha, request.deliveryAdmission, subject.member ?? undefined);
  const owner = await readLaneProgressOwner(context.operationStore, { lane: "standard", repositoryId, headSha, lineage });
  const pending = owner?.attempts.filter(attempt => attempt.outcome === "pending" && attempt.local !== undefined && attempt.headSha === headSha) ?? [];
  if (pending.length > 1) throw new Error("Restore the single pending local admission before retrying its pass judgment.");
  const admission = pending[0]?.local?.deliveryAdmission;
  if (request.deliveryAdmission !== undefined && (admission === undefined
    || canonicalize(projectDeliveryLocalReviewAdmissionIdentity(admission))
      !== canonicalize(projectDeliveryLocalReviewAdmissionIdentity(request.deliveryAdmission)))) {
    await context.validateDeliveryAdmission(request.deliveryAdmission);
  }
  const target = pending[0]?.local?.target ?? await context.deriveTarget(repositoryId, subject.member ?? undefined);
  const workUnit = subject.vehicle.kind === "work-unit" ? subject.vehicle.identity : undefined;
  const ancestors = lineage.kind !== "candidate" || workUnit === undefined ? []
    : await context.subjects.resolveSupersessionAncestors(workUnit, lineage.candidateId);
  const inherited = await readCandidateInheritedLaneProgress(context.operationStore, { lane: "standard", repositoryId, headSha, ancestors });
  return { repositoryId, target, lineage, workUnit, completedPasses: (owner?.completedPasses ?? 0) + inherited.inheritedCompletedPasses };
}

function projectLocalPassJudgments(request: LocalPrepareRequest, input: NativeExtraPassInput,
  resolved: Awaited<ReturnType<typeof resolveNativeInvocationExtraPassJudgment>>): LocalPrepareRequest {
  const bound = bindJudgment({ target: input.policyTarget, judgment: request.policyJudgment,
    ceilingOverride: request.deliveryAdmission?.ceilingOverride, additionalPassAuthorization: request.deliveryAdmission?.additionalPassAuthorization });
  const grants = projectNativePolicyGrants({ target: input.policyTarget, lane: "standard" as const,
    ceilingOverride: bound.ceilingOverride, additionalPassAuthorization: bound.additionalPassAuthorization }, resolved,
  (request.coverageAdmission?.requestedCoverage ?? request.deliveryAdmission?.requestedCoverage) === "incremental");
  const ceiling = grants.ceilingOverride, additional = grants.additionalPassAuthorization;
  if (request.deliveryAdmission !== undefined) {
    const { ceilingOverride, additionalPassAuthorization, ...retained } = request.deliveryAdmission;
    void ceilingOverride; void additionalPassAuthorization;
    return { ...request, deliveryAdmission: { ...retained, ...(ceiling === undefined ? {} : { ceilingOverride: ceiling }),
      ...(additional === undefined ? {} : { additionalPassAuthorization: additional }) } };
  }
  const { ceilingOverride, additionalPassAuthorization, ...retained } = resolved.judgment ?? {};
  void ceilingOverride; void additionalPassAuthorization;
  const judgment = { ...retained, ...(ceiling === undefined ? {} : { ceilingOverride: projectReviewCeilingJudgment(ceiling) }),
    ...(additional === undefined ? {} : { additionalPassAuthorization: projectReviewAdditionalPassJudgment(additional) }) };
  return { ...request, ...(Object.keys(judgment).length === 0 ? {} : { policyJudgment: judgment }) };
}
