/** Repository-owned next-pass facts for the ordinary review resolve command. */
import type { GitExec } from "../lib/git/exec.js";
import { readConfigSettings } from "../lib/config/status-reader.js";
import { RepositoryGitCommonStatePublisher } from "../lib/git-common-state.js";
import { recordReferences, OwnerIdentitySchema } from "../lib/store/identity.js";
import { readCandidateRecord } from "../lib/store/kinds/review/candidate/access.js";
import { unwrapReviewRecordResult } from "../lib/store/kinds/review/access-shared.js";
import { readRepositoryCandidateSupersessionChain } from "../lib/store/kinds/review/candidate/history.js";
import { resolveReviewInvocation, type ReviewInvocationInput, type ReviewInvocationOptions } from "../scripts/review-gate/runtime/invocation.js";
import { CandidateManagedRecordV1Schema, resolveCandidateSupersessionAncestors } from "../lib/work-unit/candidate-attestation.js";
import { readLocalReviewLiveContext } from "../scripts/review-gate/hosts/local/live-context.js";
import { resolveRepositoryIdentity } from "../scripts/review-gate/hosts/local/git-common-state.js";
import { deriveLocalReviewTarget } from "../scripts/review-gate/hosts/local/repository-target.js";
import { countCompleteLogicalPasses, readLaneProgressOwner, readCandidateInheritedLaneProgress, readLaneResponsePerformance } from "../scripts/review-gate/lane-progress.js";
import type { LaneProgressState } from "../scripts/review-gate/core/operation-state-schema.js";
import type { ReviewTarget } from "../scripts/review-gate/core/gate-contract-v2-schema.js";
import type { StandardReviewObligationProjection } from "../scripts/review-gate/policy/standard-review-projection-schema.js";
import { projectReviewPolicyAttempt } from "../scripts/review-gate/policy/review-policy-driver.js";
import type { ApprovedDispositionRecordReader, ReviewOperationStateStore, ReviewResultReader } from "../scripts/review-gate/core/ports.js";
import type { LaneSubjectLineage } from "../scripts/review-gate/core/lane-admission.js";
import type { ReviewPolicyCommandRequest } from "../scripts/review-gate/policy/review-policy-driver.js";
import { deriveReviewNextPassContext, deriveReviewNextPassContextFromAttempts } from "../scripts/review-gate/policy/review-next-pass.js";
import type { IncrementalPredecessorApplicability } from "../scripts/review-gate/policy/incremental-coverage-basis.js";
import type { ReviewResult } from "../scripts/review-gate/core/review-result.js";
import type { ReviewNextPassContext } from "../scripts/review-gate/policy/review-next-pass-schema.js";
import { selectErrandCorrectionPredecessor } from "../scripts/review-gate/status-errand.js";

async function readCandidateContext(input: ReviewInvocationInput, workUnit: string | undefined) {
  if (workUnit === undefined) return { candidate: null, ancestors: [] };
  const { store } = resolveReviewInvocation(input);
  const candidate = await readCandidateRecord(input.cwd, workUnit, { store, exec: input.exec, owner: input.workItem });
  if (candidate === null || candidate.attestation.supersedes === undefined) return { candidate, ancestors: [] };
  if (!store.capabilities.stateOffBranch) return { candidate, ancestors: await readRepositoryCandidateSupersessionChain({
    ...input, workUnit, record: candidate,
  }) };
  const reference = recordReferences["review/candidate"](input.workItem ?? OwnerIdentitySchema.parse({ type: "work-item", name: workUnit }));
  const records = unwrapReviewRecordResult(await store.history({ reference })).flatMap(entry => {
    if (entry.content === null) return [];
    try {
      const parsed = CandidateManagedRecordV1Schema.safeParse(JSON.parse(entry.content));
      return parsed.success ? [parsed.data] : [];
    } catch { return []; }
  });
  return { candidate, ancestors: resolveCandidateSupersessionAncestors(candidate, records) };
}

/** Read the command's exact producer lineage, including Candidate supersession owners. */
export async function readResolveNextPassContext(input: ReviewInvocationOptions & {
  readonly request: ReviewPolicyCommandRequest;
  readonly configuredSources: readonly string[];
  readonly confirmApplicability?: (predecessor: ReviewResult, current: ReviewResult) => Promise<IncrementalPredecessorApplicability>;
  readonly root: string;
  readonly exec: GitExec;
  readonly operationStore: Pick<ReviewOperationStateStore, "readOperation">;
  readonly resultReader: ReviewResultReader;
  readonly dispositionStore: ApprovedDispositionRecordReader;
}): Promise<ReviewNextPassContext> {
  const { request, root, exec, operationStore, resultReader, dispositionStore } = input;
  const invocation = { cwd: root, exec, ...resolveReviewInvocation({ ...input, cwd: root }) };
  const terminal = request.attempts.at(-1);
  const terminalResult = terminal?.outcome === "clean" || terminal?.outcome === "findings"
    ? await resultReader.readResult(terminal.reviewOperationId) : null;
  const repositoryId = invocation.store.capabilities.stateOffBranch
    ? await resolveRepositoryIdentity(new RepositoryGitCommonStatePublisher(exec, root), undefined, invocation)
    : terminalResult?.repositoryId
      ?? await resolveRepositoryIdentity(new RepositoryGitCommonStatePublisher(exec, root), undefined, invocation);
  const settings = (await readConfigSettings(root)).settings;
  const target = await deriveLocalReviewTarget({ exec, cwd: root, repositoryId, baseRef: settings["branch.base"] });
  const live = await readLocalReviewLiveContext(invocation);
  const workUnit = live.context.workUnit?.identity;
  const { candidate, ancestors } = await readCandidateContext(invocation, workUnit);
  const lineage: LaneSubjectLineage = terminalResult?.admission.lineage ?? (candidate !== null
    ? { kind: "candidate", candidateId: candidate.attestation.candidateId }
    : { kind: "head-bound", vehicleKind: live.context.errand === null ? "review-target" : "errand",
        vehicleIdentity: live.context.errand?.claimId ?? target.targetId, headSha: target.headSha });
  const owner = await readLaneProgressOwner(operationStore, { lane: "standard", repositoryId,
    headSha: target.headSha, lineage });
  const inherited = candidate === null || workUnit === undefined ? null
    : await readCandidateInheritedLaneProgress(operationStore, { lane: "standard", repositoryId,
      headSha: target.headSha,
      ancestors });
  const inheritedOwner = inherited?.ancestorOwners.find(({ owner: ancestor }) =>
    ancestor?.attempts.some(attempt => attempt.terminalProducer
      && (attempt.outcome === "clean" || attempt.outcome === "findings" || attempt.outcome === "settled-findings")) === true)?.owner;
  const inheritedTerminal = inheritedOwner?.attempts.filter(attempt => attempt.terminalProducer
    && (attempt.outcome === "clean" || attempt.outcome === "findings" || attempt.outcome === "settled-findings"))
    .sort((left, right) => right.logicalPass - left.logicalPass)[0];
  const earlier = selectErrandCorrectionPredecessor(owner?.attempts ?? [], target.headSha) ?? inheritedTerminal;
  const predecessor = terminalResult ?? (earlier === undefined
    ? null : await resultReader.readResult(earlier.attemptId));
  return deriveReviewNextPassContext({ predecessor, completedPasses: request.completedPasses,
    completePasses: countCompleteLogicalPasses(owner?.attempts ?? []) + (inherited?.inheritedCompletePasses ?? 0),
    currentTarget: target, currentLineage: lineage,
    standardReview: request.standardReview, resultReader, dispositionStore, rangeProof: { cwd: root, exec },
    deltaAdmission: { sources: input.configuredSources, surface: live.context.errand !== null
      && request.target.pullRequest !== null ? "open-pr-errand" : "ordinary" },
    confirmApplicability: input.confirmApplicability,
    readResponsePerformance: result => readLaneResponsePerformance(operationStore, result),
    candidateProof: { candidate, cwd: root, baseRef: settings["branch.base"], exec, observeTarget: () => Promise.resolve(target) } });
}

/** Derive hosted Errand admission from its same-head attempts or its claim-wide earlier producer. */
export async function readHostedErrandNextPassContext(input: {
  readonly cwd: string;
  readonly exec: GitExec;
  readonly configuredSources: readonly string[];
  readonly progress: LaneProgressState | null;
  readonly target: ReviewTarget;
  readonly lineage: LaneSubjectLineage;
  readonly standardReview: StandardReviewObligationProjection;
  readonly operationStore: Pick<ReviewOperationStateStore, "readOperation">;
  readonly resultReader: ReviewResultReader;
  readonly dispositionStore: ApprovedDispositionRecordReader;
}): Promise<ReviewNextPassContext> {
  const attempts = input.progress?.attempts.filter(attempt => attempt.headSha === input.target.headSha
    && attempt.outcome !== "pending") ?? [];
  const earlier = selectErrandCorrectionPredecessor(input.progress?.attempts ?? [], input.target.headSha);
  return deriveReviewNextPassContextFromAttempts({ attempts: attempts.map(projectReviewPolicyAttempt), completedPasses: input.progress?.completedPasses ?? 0,
    completePasses: countCompleteLogicalPasses(input.progress?.attempts ?? []),
    rangeProof: { cwd: input.cwd, exec: input.exec },
    deltaAdmission: { sources: input.configuredSources, surface: "open-pr-errand" },
    predecessorOperationId: earlier?.attemptId, currentTarget: input.target, currentLineage: input.lineage,
    standardReview: input.standardReview, resultReader: input.resultReader, dispositionStore: input.dispositionStore,
    readResponsePerformance: producer => readLaneResponsePerformance(input.operationStore, producer),
  });
}
