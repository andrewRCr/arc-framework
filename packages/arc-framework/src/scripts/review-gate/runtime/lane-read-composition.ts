/** Read-only checkout composition for lineage facts and rejected findings. */
import type { GitExec } from "../../../lib/git/exec.js";
import { readConfigSettings } from "../../../lib/config/status-reader.js";
import { RepositoryGitCommonStatePublisher } from "../../../lib/git-common-state.js";
import { createRawGitExec } from "../../../lib/io-context.js";
import { createLocalReviewCandidateReader } from "./local-prepare-composition.js";
import { readSubmissionBoundaryVersioned } from "../../../lib/work-unit/submission-boundary-store.js";
import { spineRemedy } from "../../integration/spine-refusal.js";
import { createReviewTarget } from "../core/gate-contract-v2.js";
import type { LaneProgressState } from "../core/operation-state-schema.js";
import type { LaneSubjectLineage } from "../core/lane-admission.js";
import { readLocalReviewLiveContext, type ResolvedLocalReviewLiveContext } from "../hosts/local/live-context.js";
import { readRepositoryIdentity } from "../hosts/local/git-common-state.js";
import { deriveLocalReviewTarget, deriveLocalReviewTargetFacts } from "../hosts/local/repository-target.js";
import { LocalReviewAuthorityError } from "../hosts/local/review-authority.js";
import { LocalReviewOperationStateStore } from "../hosts/local/operation-state-store.js";
import { LocalApprovedDispositionRecordStore } from "../hosts/local/disposition-record-store.js";
import { createReadOnlyRepositoryReviewResultReader } from "../hosts/local/review-result-reader-composition.js";
import { readLaneResponsePerformance } from "../lane-progress.js";
import { deriveReviewNextPassContext } from "../policy/review-next-pass.js";
import type { ReviewNextPassContext } from "../policy/review-next-pass-schema.js";
import { parseReviewSourceIds } from "../hosts/local/frontline-source-preferences.js";
import { projectReviewLaneRead, type ReviewLaneReadRequest, type ReviewLaneReadEnvelope } from "../lane-read.js";
import { createLocalReviewSubjectResolver } from "./local-review-subject.js";
import { resolveLocalPolicyTarget, createLocalContributionConfirmation } from "./local-correction-context.js";
import { readReviewLaneHistory } from "./lane-history.js";
import { readLocalDeltaAdmissionSurface } from "./local-reserved-obligation.js";

interface LaneReadBoundary {
  readonly cwd: string; readonly exec: GitExec;
}

async function readNextContext(input: LaneReadBoundary & {
  candidateReader: ReturnType<typeof createLocalReviewCandidateReader>;
  target: ReturnType<typeof createReviewTarget>; lineage: LaneSubjectLineage; progress: readonly LaneProgressState[];
  workUnitId?: string; sources: readonly string[]; operationStore: LocalReviewOperationStateStore;
  dispositionStore: LocalApprovedDispositionRecordStore; publisher: RepositoryGitCommonStatePublisher;
}): Promise<ReviewNextPassContext> {
  const terminal = input.progress.filter(owner => owner.lane === "standard").flatMap(owner => owner.attempts)
    .filter(attempt => attempt.terminalProducer).at(-1);
  if (terminal === undefined) return { convergence: "none", responseDue: false, incremental: null };
  const resultReader = createReadOnlyRepositoryReviewResultReader(input.publisher, input.target.repositoryId);
  const predecessor = await resultReader.readResult(terminal.attemptId);
  if (predecessor.kind === "frontline") throw new Error("standard lane contains a frontline producer");
  const { obligation, reasons, rubricVersion, rubricDigest, retrigger, count } = predecessor.requirement;
  const boundary = input.workUnitId === undefined ? null : (await readSubmissionBoundaryVersioned(input.cwd, input.workUnitId)).boundary;
  const standardReview = boundary?.reservation?.obligation ?? { obligation, reasons, rubricVersion, rubricDigest, retrigger, count };
  const candidate = input.lineage.kind === "candidate" && input.workUnitId !== undefined
    ? await input.candidateReader.read(input.workUnitId) : null;
  const policyTarget = input.lineage.kind === "delivery-member" ? { repository: "local", pullRequest: null }
    : await resolveLocalPolicyTarget(input, input.target.repositoryId, input.target, input.target.baseRef);
  const context = { input, dispositionStore: input.dispositionStore, operationStore: input.operationStore };
  const confirm = createLocalContributionConfirmation({ context, repositoryId: input.target.repositoryId,
    baseRef: input.target.baseRef, policyTarget, candidate });
  return deriveReviewNextPassContext({ predecessor, currentTarget: input.target, currentLineage: input.lineage,
    standardReview, resultReader, dispositionStore: input.dispositionStore, rangeProof: input,
    readResponsePerformance: result => readLaneResponsePerformance(input.operationStore, result),
    confirmApplicability: (before, current) => confirm(before, current.target, current.admission.lineage, current),
    confirmCurrentApplicability: before => confirm(before, input.target, input.lineage),
    candidateProof: { candidate, ...input, baseRef: input.target.baseRef, observeTarget: () => deriveLocalReviewTarget({ ...input, repositoryId: input.target.repositoryId, baseRef: input.target.baseRef }) },
    deltaAdmission: { sources: input.sources, surface: await readLocalDeltaAdmissionSurface({ ...input,
      pullRequest: policyTarget.pullRequest }) } });
}

async function readResolvedLane(request: ReviewLaneReadRequest, input: LaneReadBoundary): Promise<ReviewLaneReadEnvelope> {
  let live: Promise<ResolvedLocalReviewLiveContext> | undefined;
  const readLive = () => live ??= readLocalReviewLiveContext(input);
  const candidateReader = createLocalReviewCandidateReader(input);
  const resolver = createLocalReviewSubjectResolver({ ...input, readLive, readOnly: true, candidateReader });
  const { vehicle, member } = await resolver.resolveVehicle(request.memberHeadObjectId);
  const workUnitId = vehicle.kind === "work-unit" ? vehicle.identity : member?.workUnitId;
  const settings = (await readConfigSettings(input.cwd)).settings;
  const coordinates = await deriveLocalReviewTargetFacts({ ...input, baseRef: settings["branch.base"],
    ...(member === null ? {} : { memberCoordinates: { headSha: member.head, diffBaseSha: member.base } }) });
  const lineage = await resolver.resolveLineage(vehicle, coordinates.headSha, undefined, member ?? undefined);
  const publisher = new RepositoryGitCommonStatePublisher(input.exec, input.cwd);
  const repositoryId = await readRepositoryIdentity(publisher);
  const operationStore = new LocalReviewOperationStateStore(publisher);
  const dispositionStore = new LocalApprovedDispositionRecordStore(publisher);
  const history = repositoryId === null ? { progress: [], inheritedLineages: [], dispositions: [] }
    : await readReviewLaneHistory({ resolveSupersessionAncestors: resolver.resolveSupersessionAncestors,
      store: operationStore, dispositionStore, repositoryId, headSha: coordinates.headSha, lineage, workUnitId });
  const target = repositoryId === null ? null : createReviewTarget({ schemaVersion: 2,
    semanticsVersion: "review-gate/v2", repositoryId, ...coordinates });
  const nextPassContext = target === null ? { convergence: "none" as const, responseDue: false, incremental: null }
    : await readNextContext({ ...input, ...history, target, lineage, workUnitId, candidateReader,
      sources: parseReviewSourceIds(settings["review.standard_sources"]), operationStore, dispositionStore, publisher });
  return projectReviewLaneRead({ ...history, lineage, nextPassContext, target: coordinates,
    ceiling: Number(settings["review.standard_max_passes"]), exec: createRawGitExec(input.cwd) });
}

/** Read the authenticated checkout subject without publishing any review state. */
export async function readReviewLane(request: ReviewLaneReadRequest, input: LaneReadBoundary): Promise<ReviewLaneReadEnvelope> {
  try { return await readResolvedLane(request, input); }
  catch (error) {
    const code = error instanceof LocalReviewAuthorityError ? error.reason
      : error instanceof Error && "reason" in error && typeof error.reason === "string" ? error.reason : "lane-read-unavailable";
    const detail = error instanceof Error ? error.message : String(error);
    const correction = request.memberHeadObjectId === undefined
      ? `Use the checkout for the intended Errand claim or Candidate (current checkout: ${input.cwd}), then retry`
      : `Use the owning work-unit checkout (${input.cwd}) and a bound delivery member head; requested ${request.memberHeadObjectId}. Retry`;
    return { schemaVersion: 1, mode: "review-lane-read", state: "refused", nextAction: "stop", diagnostics: [],
      payload: { code, detail, remedy: spineRemedy(detail, correction, ["arc", "review", "lane", "read", "-"], request) } };
  }
}
