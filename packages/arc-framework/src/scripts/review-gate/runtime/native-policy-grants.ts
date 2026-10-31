/** Compose ordinary native pass authority from exact subjects before pure policy runs. */
import { createRawGitExec } from "../../../lib/io-context.js";
import { readSubmissionBoundary } from "../../../lib/store/kinds/review/integration-boundary/access.js";
import { readCandidateRecord } from "../../../lib/store/kinds/review/candidate/access.js";
import { readRepositoryCandidateSupersessionChain } from "../../../lib/store/kinds/review/candidate/history.js";
import { projectGitCandidateEffectiveTarget } from "../../../lib/work-unit/git-candidate-effective-target.js";
import type { ReviewDecision } from "../../../lib/store/kinds/review/decision/schema.js";
import type { CandidateManagedRecordV1 } from "../../../lib/work-unit/candidate-attestation.js";
import type { ReviewTarget } from "../core/gate-contract-v2-schema.js";
import type { LaneSubjectLineage } from "../core/lane-admission.js";
import type { ReviewInFlightPort, ReviewResultReader } from "../core/ports.js";
import { deriveLocalReviewTarget } from "../hosts/local/repository-target.js";
import { readLocalReviewLiveContext } from "../hosts/local/live-context.js";
import { readLaneProgress, readCandidateInheritedLaneProgress } from "../lane-progress.js";
import type { ReviewPolicyCommandRequest, ReviewPolicyBoundRequest } from "../policy/review-policy-driver.js";
import type { ReviewInvocationInput } from "./invocation.js";
import { resolveNativeInvocationExtraPassJudgment } from "./native-extra-pass.js";
import { nativeBoundaryTerminusReference, resolveNativeReviewTerminus } from "./native-terminus.js";
import type { NativeExtraPassResolution } from "./native-extra-pass.js";
import { requestedExtraPasses } from "./native-extra-pass-input.js";
import { reviewFactListingError } from "../../../lib/store/kinds/review/fact-access.js";

/** Bind resolved targetless projections at use while leaving explicit incremental grants subject to policy refusal. */
export function projectNativePolicyGrants<Request extends Pick<ReviewPolicyCommandRequest,
  "target" | "lane" | "ceilingOverride" | "additionalPassAuthorization">>(request: Request, resolved: NativeExtraPassResolution,
  incremental: boolean): Request {
  const ceiling = resolved.judgment?.ceilingOverride, additional = resolved.judgment?.additionalPassAuthorization;
  return { ...request,
    ...(ceiling === undefined || (incremental && request.ceilingOverride === undefined) ? {} : {
      ceilingOverride: { ...ceiling, target: request.target, lane: request.lane } }),
    ...(additional === undefined || (incremental && request.additionalPassAuthorization === undefined) ? {} : {
      additionalPassAuthorization: { target: { ...request.target, headSha: additional.headSha }, lane: "standard",
        precedingProducerId: additional.precedingProducerId, completedPasses: additional.completedPasses,
        nextPass: additional.nextPass, decisionKey: additional.decisionKey } }) };
}

/** Observe the current Candidate subject rather than substituting its durable baseline or review target digest. */
export async function readNativeDecisionSubject(input: ReviewInvocationInput & {
  target: ReviewTarget; lineage: LaneSubjectLineage; baseBranch: string;
  workUnit?: string; candidate?: Awaited<ReturnType<typeof readCandidateRecord>>;
}): Promise<ReviewDecision["subject"]> {
  if (input.lineage.kind !== "candidate") return { lineage: input.lineage,
    headSha: input.target.headSha, subjectDigest: input.target.targetId };
  const name = input.workUnit ?? input.workItem?.name;
  const candidate = input.candidate ?? (name === undefined ? null : await readCandidateRecord(input.cwd, name,
    { ...input, owner: input.workItem }));
  if (name === undefined || candidate === null || candidate.attestation.candidateId !== input.lineage.candidateId) {
    throw new Error("Restore the selected Candidate record before resolving its extra-pass judgment, then retry.");
  }
  const effective = await projectGitCandidateEffectiveTarget({ ...input, name, record: candidate,
    rawExec: createRawGitExec(input.cwd), target: { revision: input.target.headSha, currentBase: input.target.diffBaseSha } });
  if (effective.state !== "current") {
    throw new Error(`The Candidate does not attest the review head ${input.target.headSha}. `
      + `Attest it with \`arc attest ${name}\`, then retry the extra-pass judgment.`);
  }
  return { lineage: input.lineage, headSha: input.target.headSha,
    subjectDigest: effective.recognizedTarget.subject.subjectDigest };
}

// With no terminal result to name it, the subject is the held Candidate, else the live Errand's or the target's head.
function fallbackLineage(candidate: CandidateManagedRecordV1 | null, errand: { claimId: string } | null,
  target: { targetId: string; headSha: string }): LaneSubjectLineage {
  return candidate !== null ? { kind: "candidate", candidateId: candidate.attestation.candidateId }
    : { kind: "head-bound", vehicleKind: errand === null ? "review-target" : "errand",
      vehicleIdentity: errand?.claimId ?? target.targetId, headSha: target.headSha };
}

// A carried ceiling or additional-pass judgment, or an ordinary extra-pass decision stored for the request's lane.
function carriesNativeJudgment(request: ReviewPolicyCommandRequest, records: readonly { value: ReviewDecision }[]): boolean {
  return request.ceilingOverride !== undefined || request.additionalPassAuthorization !== undefined
    || records.some(({ value }) => value.lane === request.lane && value.choice.kind === "extra-pass"
      && value.choice.precondition.kind !== "approved-fix");
}

/** Persist carried judgments and project live grants for the generic resolver's already bound work item. */
export async function composeNativePolicyGrants(input: ReviewInvocationInput & {
  request: ReviewPolicyCommandRequest; operationStore: ReviewInFlightPort;
  resultReader: ReviewResultReader; baseBranch: string; incremental: boolean;
}): Promise<ReviewPolicyBoundRequest> {
  const facts = input.operationStore.nativeFacts;
  if (input.operationStore.stateOffBranch !== true) return input.request;
  if (facts === undefined) throw new Error("Restore the selected native review facts and retry the policy request.");
  const listing = await facts.decisions.list();
  if (listing.status !== "complete") throw reviewFactListingError(listing);
  const request = input.request;
  const termini = request.lane === "standard" && listing.records.some(({ value }) => value.choice.kind === "terminus");
  if (!termini && !carriesNativeJudgment(request, listing.records)) return request;
  const repositoryId = await facts.readProjectId();
  const target = await deriveLocalReviewTarget({ ...input, repositoryId, baseRef: input.baseBranch });
  if (target.headSha !== request.target.headSha) throw new Error("Restore the requested review head in the owning checkout and retry.");
  const live = await readLocalReviewLiveContext(input);
  const workUnit = live.context.workUnit?.identity ?? input.workItem?.name;
  const candidate = workUnit === undefined ? null : await readCandidateRecord(input.cwd, workUnit, { ...input, owner: input.workItem });
  const terminal = request.attempts.at(-1);
  const result = terminal?.outcome === "clean" || terminal?.outcome === "findings"
    ? await input.resultReader.readResult(terminal.reviewOperationId) : null;
  const lineage = result?.admission.lineage ?? fallbackLineage(candidate, live.context.errand, target);
  const progress = await readLaneProgress(input.operationStore, { lane: request.lane, repositoryId, headSha: target.headSha, lineage });
  const ancestors = candidate === null || workUnit === undefined ? [] : await readRepositoryCandidateSupersessionChain({
    ...input, workUnit, record: candidate });
  const inherited = await readCandidateInheritedLaneProgress(input.operationStore, {
    lane: request.lane, repositoryId, headSha: target.headSha, ancestors });
  const completedPasses = (progress.status === "recorded" ? progress.completedPasses : 0) + inherited.inheritedCompletedPasses;
  const value = { repositoryId, lane: request.lane, completedPasses, policyTarget: request.target,
    ceilingOverride: request.ceilingOverride, additionalPassAuthorization: request.additionalPassAuthorization,
    subject: { lineage, headSha: target.headSha, subjectDigest: lineage.kind === "candidate" ? null : target.targetId } };
  // The observed Candidate subject is read only to record a new decision or to bind a terminus to it.
  const needsSubject = termini || requestedExtraPasses({ ...value, facts }).some(choice => choice.decisionKey === undefined);
  const subject = needsSubject ? await readNativeDecisionSubject({ ...input, target, lineage, workUnit, candidate }) : value.subject;
  const resolved = await resolveNativeInvocationExtraPassJudgment(input, facts, { ...value, subject });
  const terminus = await resolvePolicyTerminus(input, facts, subject, workUnit);
  return { ...projectNativePolicyGrants(request, resolved, input.incremental), ...(terminus === undefined ? {} : { terminus }) };
}


async function resolvePolicyTerminus(input: Parameters<typeof composeNativePolicyGrants>[0],
  facts: NonNullable<ReviewInFlightPort["nativeFacts"]>, subject: ReviewDecision["subject"], workUnit?: string) {
  if (input.request.lane !== "standard") return undefined;
  const boundary = subject.lineage.kind !== "candidate" || workUnit === undefined ? null
    : await readSubmissionBoundary(input.cwd, workUnit, { store: input.store, owner: input.workItem });
  return resolveNativeReviewTerminus({ facts, subject, ...nativeBoundaryTerminusReference(boundary, subject) });
}
