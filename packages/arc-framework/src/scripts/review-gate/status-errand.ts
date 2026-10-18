/** Positive Errand identity and exact-head lane progress for review status. */

import { projectReviewDriverRefusal } from "./status-driver-refusal.js";
import { readTransientIdentitySnapshot } from "../../lib/errand/identity-snapshot.js";
import { readConfigSettings } from "../../lib/config/status-reader.js";
import { resolveChangeRequestLifecycleConfiguration } from "../../lib/errand/change-request-lifecycle.js";
import type { TransientIdentityRecord } from "../../lib/errand/identity-record.js";
import { isErrandBranchType } from "../../lib/errand/branch-type.js";
import { RepositoryGitCommonStatePublisher } from "../../lib/git-common-state.js";
import { analyzeRevisionOverlap, resolveSoleMergeBase } from "../../lib/git/base-overlap.js";
import type { GitExec, RawGitExec } from "../../lib/git/exec.js";
import { isGitProcessError } from "../../lib/git/process-error.js";
import { observeGitMergeFeasibility, resolveIdentity } from "../../lib/git/index.js";
import { canonicalize } from "../../lib/kernel/index.js";
import type { ReviewResultReader } from "./core/ports.js";
import { LocalReviewOperationStateStore } from "./hosts/local/operation-state-store.js";
import { LocalApprovedDispositionRecordStore } from "./hosts/local/disposition-record-store.js";
import { createRepositoryReviewResultReader } from "./hosts/local/review-result-reader-composition.js";
import { LocalReviewResultReaderError } from "./hosts/local/review-result-reader.js";
import { resolveRepositoryIdentity } from "./hosts/local/git-common-state.js";
import {
  readLaneProgress,
  countCompleteLogicalPasses,
  readLaneProgressOwner,
  readLaneResponsePerformance,
  type LanePolicyAttempt,
} from "./lane-progress.js";
import { createReviewTarget } from "./core/gate-contract-v2.js";
import { confirmReviewCorrectionLeg, deriveReviewNextPassContext } from "./policy/review-next-pass.js";
import { GitObjectIdSchema, type ReviewTarget } from "./core/gate-contract-v2-schema.js";
import type { ReviewResult } from "./core/review-result.js";
import type { LaneProgressState } from "./core/operation-state-schema.js";
import type { ChangeRequestCandidate } from "./change-request.js";
import { HostedProviderIdSchema } from "./hosted/request.js";
import { STANDARD_REVIEW_RUBRIC_IDENTITY } from "./policy/standard-review.js";
import { resolveConfiguredLanePolicy } from "./policy/lane-policy-config.js";
import { projectReviewPolicyAttempt } from "./policy/review-policy-driver.js";
import type {
  ReviewAdditionalPassAuthorization, ReviewCeilingOverride, ReviewResolveEnvelope,
} from "./policy/review-policy-driver.js";
import { projectGitReviewContributionApplicability } from "./policy/git-review-contribution-applicability.js";
import { ReviewContributionApplicabilitySelectorSchema } from "./policy/review-contribution-applicability.js";
import {
  readIncrementalPredecessorResponseEvidence,
  resolveEvidenceBoundReviewPolicyContinuation,
} from "./policy/review-policy-evidence.js";
import { confirmErrandFixResponseApplicability } from "./policy/local-review-coverage-selection.js";
import {
  type IncrementalPredecessorApplicability,
} from "./policy/incremental-coverage-basis.js";
import type { StandardReviewObligationProjection } from "./policy/standard-review-projection-schema.js";
import type { RoutedReviewObligation } from "./status.js";
import {
  BaseMovementObservationSchema, classifyPathTreatment, composeEvidenceDelta, reduceEvidenceApplicability,
  type BaseMovementObservation,
} from "../../lib/evidence-applicability/index.js";

interface ExactErrandStatusTarget {
  readonly repository: string;
  readonly headRef: string;
  readonly headSha: string;
}

type OrdinaryErrand = Extract<TransientIdentityRecord, { kind: "errand"; purpose: "errand" }>;
type StandardReviewResult = Exclude<ReviewResult, { kind: "frontline" }>;
/** The identity fields that bind review producers to one Errand claim. */
interface ErrandClaim {
  readonly slug: string;
  readonly claimId: string;
  readonly branch: string;
}
type LaneAttempt = LaneProgressState["attempts"][number];

interface ErrandPolicyTarget {
  readonly repository: string;
  readonly pullRequest: number;
  readonly headSha: string;
}

function blocked(detail: string): RoutedReviewObligation {
  return { state: "blocked", detail };
}

async function branchAtHead(
  exec: GitExec,
  branch: string,
  remote: string,
  headSha: string,
): Promise<boolean> {
  for (const ref of [`refs/remotes/${remote}/${branch}`, `refs/heads/${branch}`]) {
    try {
      const { stdout } = await exec("git", ["rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`]);
      if (stdout.trim() === headSha) return true;
    } catch {
      // Either ref may be absent; an exact local branch may outpace remote tracking.
    }
  }
  const remoteRef = `refs/heads/${branch}`;
  const { stdout } = await exec("git", ["ls-remote", "--heads", remote, remoteRef]);
  return stdout.trim() === `${headSha}\t${remoteRef}`;
}

async function isAncestor(exec: GitExec, ancestor: string, descendant: string): Promise<boolean> {
  try {
    await exec("git", ["merge-base", "--is-ancestor", ancestor, descendant]);
    return true;
  } catch (error) {
    if (isGitProcessError(error) && error.kind === "nonzero-exit" && error.exitCode === 1) return false;
    throw error;
  }
}

async function reviewCoversCurrentBase(
  exec: GitExec,
  reviewed: Pick<ReviewTarget, "baseRef" | "diffBaseSha" | "headSha">,
  currentBaseOid: string | undefined,
  currentBaseRef: string | undefined,
  context: {
    readonly target: ExactErrandStatusTarget;
    readonly pullRequest: number;
    readonly baseMovement?: BaseMovementObservation | null;
  },
): Promise<boolean> {
  if (currentBaseOid === undefined || !GitObjectIdSchema.safeParse(currentBaseOid).success
    || (currentBaseRef !== undefined && reviewed.baseRef !== currentBaseRef)) return false;
  if (!await isAncestor(exec, reviewed.diffBaseSha, currentBaseOid)) return false;
  if (await isAncestor(exec, currentBaseOid, reviewed.headSha)) return true;
  if (!await isAncestor(exec, reviewed.diffBaseSha, reviewed.headSha)) return false;
  const movement = BaseMovementObservationSchema.safeParse(context.baseMovement);
  if (!movement.success) return false;
  const coordinates = movement.data.coordinates;
  if (coordinates.repository.toLowerCase() !== context.target.repository.toLowerCase()
    || coordinates.changeRequest !== context.pullRequest
    || coordinates.base !== currentBaseOid
    || coordinates.head !== reviewed.headSha) return false;
  return reduceEvidenceApplicability(
    composeEvidenceDelta({ cause: "base-movement", observation: movement.data }),
    "review-clearance",
  ).verdict === "carries";
}

function matchingOrdinaryErrand(
  records: readonly TransientIdentityRecord[],
  target: ExactErrandStatusTarget,
): { readonly kind: "none" } | { readonly kind: "blocked"; readonly detail: string } | {
  readonly kind: "matched";
  readonly record: Extract<TransientIdentityRecord, { kind: "errand"; purpose: "errand" }>;
} {
  const matching = records.filter((record) => record.branch === target.headRef);
  if (matching.length === 0) return { kind: "none" };
  if (matching.length !== 1) {
    return { kind: "blocked", detail: "The target branch has ambiguous transient identity claims." };
  }
  const record = matching[0];
  if (record?.kind !== "errand" || record.purpose !== "errand"
    || (record.state !== "open" && record.state !== "awaiting-merge")) {
    return { kind: "blocked", detail: "The target branch does not carry an active ordinary Errand identity." };
  }
  if (record.state === "awaiting-merge" && (
    record.changeRequest.repositoryRef.toLowerCase() !== target.repository.toLowerCase()
    || record.changeRequest.headRef !== target.headRef
    || record.changeRequest.headSha !== target.headSha
  )) {
    return { kind: "blocked", detail: "The Errand identity's change request does not match the exact target." };
  }
  return { kind: "matched", record };
}

function localProducerBelongsToErrand(result: Extract<ReviewResult, { kind: "attested-local" }>, errand: ErrandClaim): boolean {
  return result.vehicle.kind === "errand"
    && result.vehicle.identity === errand.slug
    && result.vehicle.claimId === errand.claimId
    && result.request.carrier.kind === "local-change-set"
    && result.request.carrier.errandClaimId === errand.claimId;
}

function hasErrandLineage(result: ReviewResult, errand: ErrandClaim): boolean {
  const lineage = result.admission.lineage;
  return lineage.kind === "head-bound" && lineage.vehicleKind === "errand"
    && lineage.vehicleIdentity === errand.claimId && lineage.headSha === result.target.headSha;
}

/** Check the exact producer's Errand binding, including hosted history omitted from normalized results. */
async function producerBelongsToErrand(
  result: ReviewResult,
  store: LocalReviewOperationStateStore,
  errand: ErrandClaim,
): Promise<boolean> {
  const lineage = result.admission.lineage;
  if (!hasErrandLineage(result, errand)) return false;
  if (result.kind === "attested-local") {
    return localProducerBelongsToErrand(result, errand);
  }
  if (result.kind !== "hosted") return false;
  const owner = await readLaneProgressOwner(store, {
    lane: "standard",
    repositoryId: result.repositoryId,
    headSha: result.target.headSha,
    lineage,
  });
  const matching = owner?.attempts.filter(({ attemptId }) => attemptId === result.producerId) ?? [];
  const vehicle = matching.length === 1 ? matching[0]?.hosted?.handle?.vehicle : undefined;
  return vehicle?.kind === "errand"
    && vehicle.key === errand.slug
    && vehicle.claimId === errand.claimId
    && vehicle.branch === errand.branch;
}

function sharesCorrectionBase(predecessor: ReviewResult, current: ReviewResult): boolean {
  return predecessor.originalOutcome === "findings"
    && predecessor.target.kind === "change-set" && current.target.kind === "change-set"
    && predecessor.target.baseRef === current.target.baseRef
    && predecessor.target.diffBaseSha === current.target.diffBaseSha
    && predecessor.target.diffBaseTree === current.target.diffBaseTree;
}

async function confirmChangedErrandResponse(input: {
  predecessor: ReviewResult;
  current: ReviewResult;
  store: LocalReviewOperationStateStore;
  dispositionStore: LocalApprovedDispositionRecordStore;
  errand: ErrandClaim;
}): Promise<IncrementalPredecessorApplicability> {
  const { predecessor, current, store, dispositionStore, errand } = input;
  const readPerformance = (result: ReviewResult) => readLaneResponsePerformance(store, result);
  if (predecessor.kind === "attested-local" && current.kind === "attested-local") {
    return confirmErrandFixResponseApplicability({
      predecessor,
      currentTarget: current.target,
      currentLineage: current.admission.lineage,
      currentClaimId: errand.claimId,
      currentResult: current,
      // Historical producer validation never uses this live read; fail closed if that changes.
      observeTarget: () => Promise.reject(new Error("historical Errand correction has no live checkout target")),
      dispositionStore,
      readResponsePerformance: readPerformance,
    });
  }
  return fixProducedHead({ predecessor, producedHeadSha: current.target.headSha, store, dispositionStore });
}

/** Whether the predecessor's approved fix was performed and produced exactly the given head. */
async function fixProducedHead(input: {
  predecessor: ReviewResult;
  producedHeadSha: string;
  store: LocalReviewOperationStateStore;
  dispositionStore: LocalApprovedDispositionRecordStore;
}): Promise<IncrementalPredecessorApplicability> {
  const { predecessor } = input;
  const readPerformance = (result: ReviewResult) => readLaneResponsePerformance(input.store, result);
  const performance = await readPerformance(predecessor);
  if (performance?.producerId !== predecessor.producerId
    || performance.originatingHeadSha !== predecessor.target.headSha
    || performance.producedHeadSha !== input.producedHeadSha) return "unavailable";
  const response = await readIncrementalPredecessorResponseEvidence(
    predecessor, input.dispositionStore, readPerformance,
  );
  return response.status === "performed" ? "applicable" : "unavailable";
}

/** Prove each changed-head Errand correction leg before the shared coverage-chain validator accepts it. */
async function confirmErrandCorrectionPredecessor(input: {
  cwd: string;
  exec: GitExec;
  predecessor: ReviewResult;
  current: ReviewResult;
  store: LocalReviewOperationStateStore;
  dispositionStore: LocalApprovedDispositionRecordStore;
  errand: ErrandClaim;
}): Promise<IncrementalPredecessorApplicability> {
  const { predecessor, current, store, errand } = input;
  if (!await producerBelongsToErrand(predecessor, store, errand)
    || !await producerBelongsToErrand(current, store, errand)
    || predecessor.repositoryId !== current.repositoryId) return "unavailable";
  if (canonicalize(predecessor.target) === canonicalize(current.target)) return "applicable";
  return confirmReviewCorrectionLeg({ predecessor, currentTarget: current.target,
    currentLineage: current.admission.lineage, currentResult: current, dispositionStore: input.dispositionStore,
    readResponsePerformance: producer => readLaneResponsePerformance(store, producer),
    rangeProof: { cwd: input.cwd, exec: input.exec },
    confirmGrounds: () => sharesCorrectionBase(predecessor, current)
      ? confirmChangedErrandResponse(input) : Promise.resolve("unavailable"),
  });
}

function projectStandardReview(result: StandardReviewResult): StandardReviewObligationProjection {
  const requirement = result.requirement;
  return {
    obligation: requirement.obligation, reasons: requirement.reasons,
    rubricVersion: requirement.rubricVersion, rubricDigest: requirement.rubricDigest,
    retrigger: requirement.retrigger, count: requirement.count,
  };
}

/**
 * Select the claim's latest completed review at an earlier head: the pass a correction review of this head follows.
 *
 * @returns That attempt, or null when this head already has a completed review or no earlier one exists.
 */
export function selectErrandCorrectionPredecessor(attempts: readonly LaneAttempt[], headSha: string): LaneAttempt | null {
  const completed = attempts.filter((attempt) => attempt.terminalProducer
    && (attempt.outcome === "clean" || attempt.outcome === "findings" || attempt.outcome === "settled-findings"));
  if (completed.some((attempt) => attempt.headSha === headSha)) return null;
  return [...completed].sort((left, right) => right.logicalPass - left.logicalPass)[0] ?? null;
}

/** Preserve the claim-wide ceiling when an older producer has no readable result artifact. */
function missingHistoricalResultObligation(input: {
  readonly policyTarget: { readonly repository: string; readonly pullRequest: number; readonly headSha: string };
  readonly completedPasses: number;
  readonly completePasses: number;
  readonly maxPasses: number;
  readonly ceilingOverride?: ReviewCeilingOverride;
}): RoutedReviewObligation {
  if (input.completePasses < input.maxPasses) {
    return { state: "review-required", detail: "The exact Errand standard-review lane is not settled." };
  }
  const consequence = {
    target: input.policyTarget, lane: "standard" as const,
    exhaustedPassCount: input.completedPasses, nextPass: input.completedPasses + 1,
  };
  const override = input.ceilingOverride;
  if (override === undefined) {
    return { state: "approval-required", scope: "errand",
      detail: "The Errand claim has exhausted its complete standard-review pass ceiling; the historical "
        + "producer result is unavailable, and another complete pass needs an exact one-pass Owner override.",
      consequence };
  }
  if (canonicalize(override.target) !== canonicalize(consequence.target)
    || override.lane !== consequence.lane
    || override.exhaustedPassCount !== consequence.exhaustedPassCount
    || override.nextPass !== consequence.nextPass) {
    return blocked("The Errand's standard-review ceiling override does not match this claim and head.");
  }
  return { state: "review-required",
    detail: "The exact ceiling override was supplied, but the historical review producer is unavailable; "
      + "execution admission must verify the next complete pass." };
}

/** Whether one attempt completed the current standard-review rubric for the exact change request. */
function completesCurrentRubric(attempt: LanePolicyAttempt, pullRequest: number): boolean {
  const rubric = STANDARD_REVIEW_RUBRIC_IDENTITY;
  const hosted = attempt.hosted;
  if (hosted !== undefined) {
    const vehicle = hosted.handle?.vehicle;
    return vehicle?.kind === "errand"
      && hosted.handle?.target.pullRequest === pullRequest
      && hosted.effectiveCoverage !== null
      && vehicle.standardReview.rubricVersion === rubric.version
      && vehicle.standardReview.rubricDigest === rubric.digest
      && hosted.requirement.rubricVersion === rubric.version
      && hosted.requirement.rubricDigest === rubric.digest;
  }
  return attempt.local !== undefined
    && attempt.chunkSeriesComplete !== false
    && attempt.local.rubricIdentity?.version === rubric.version
    && attempt.local.rubricIdentity.digest === rubric.digest;
}

/** Resolve one exact Errand head's standard lane from that head's terminal attempt and its result. */
async function resolveErrandLaneAtHead(input: {
  readonly cwd: string;
  readonly exec: GitExec;
  readonly publisher: RepositoryGitCommonStatePublisher;
  readonly store: LocalReviewOperationStateStore;
  readonly resultReader: ReviewResultReader;
  readonly errand: OrdinaryErrand;
  readonly policyTarget: ErrandPolicyTarget;
  readonly completedPasses: number;
  readonly completePasses: number;
  readonly terminal: LanePolicyAttempt;
  readonly result: StandardReviewResult;
  readonly ceilingOverride?: ReviewCeilingOverride;
  readonly additionalPassAuthorization?: ReviewAdditionalPassAuthorization;
  readonly sourceId?: string;
}): Promise<ReviewResolveEnvelope> {
  const { store, terminal, result, policyTarget } = input;
  const settings = (await readConfigSettings(input.cwd)).settings;
  const configured = await resolveConfiguredLanePolicy({
    lane: "standard",
    settings,
    preferences: {
      readDeveloperSourceIds: () => Promise.resolve([]),
      readProjectSourceIds: () => Promise.resolve([]),
    },
  });
  const requirement = result.requirement;
  const dispositionStore = new LocalApprovedDispositionRecordStore(input.publisher);
  const nextPassContext = await deriveReviewNextPassContext({
    completePasses: input.completePasses, completedPasses: input.completedPasses,
    predecessor: result, currentTarget: result.target, currentLineage: result.admission.lineage,
    rangeProof: { cwd: input.cwd, exec: input.exec },
    deltaAdmission: { sources: configured.sources, surface: "open-pr-errand" },
    standardReview: projectStandardReview(result), resultReader: input.resultReader, dispositionStore,
    readResponsePerformance: producer => readLaneResponsePerformance(store, producer),
    confirmApplicability: (predecessor, current) => confirmErrandCorrectionPredecessor({
      cwd: input.cwd, exec: input.exec, predecessor, current, store, dispositionStore, errand: input.errand,
    }),
  });
  return resolveEvidenceBoundReviewPolicyContinuation({
    ...(input.sourceId === undefined ? {} : { invocation: { mode: "force" as const, sourceId: input.sourceId } }),
    schemaVersion: 1,
    target: policyTarget,
    lane: "standard",
    frontlineActive: false,
    standardReview: {
      obligation: requirement.obligation,
      reasons: requirement.reasons,
      rubricVersion: requirement.rubricVersion,
      rubricDigest: requirement.rubricDigest,
      retrigger: requirement.retrigger,
      count: requirement.count,
    },
    completedPasses: input.completedPasses,
    attempts: [projectReviewPolicyAttempt(terminal)],
    ...(input.ceilingOverride === undefined ? {}
      : { ceilingOverride: input.ceilingOverride }),
    ...(input.additionalPassAuthorization === undefined ? {}
      : { additionalPassAuthorization: input.additionalPassAuthorization }),
    ...(result.admission.scopeMode === "whole-target" ? {} : {
      scopeSelection: { mode: result.admission.scopeMode, target: policyTarget },
    }),
  }, { terminalResponsePerformed: terminal.outcome === "settled-findings" }, {
    sources: [terminal.sourceId, ...configured.sources.filter((source) => source !== terminal.sourceId)],
    selectionSources: configured.sources,
    maxPasses: configured.maxPasses,
    nextPassContext,
    resultReader: input.resultReader,
    dispositionStore,
    readResponsePerformance: (producer) => readLaneResponsePerformance(store, producer),
    confirmIncrementalApplicability: (predecessor, current) => confirmErrandCorrectionPredecessor({
      cwd: input.cwd, exec: input.exec, predecessor, current, store, dispositionStore, errand: input.errand,
    }),
    confirmTarget: (target) => Promise.resolve(target),
  });
}

/**
 * Carry a settled earlier head's standard review onto a head that reconciled it with its base.
 *
 * Every fact must hold: the earlier head's lane converged; the current head reapplies that reviewed contribution
 * unchanged over its own diff base; the base movement the reconcile absorbed either avoids the reviewed paths or
 * merges with the reviewed change without a substantive conflict; and no movement since overlaps the reviewed
 * paths. The earlier result keeps its own head; only this status reports the carry.
 *
 * @returns A settled obligation naming the carried head and proof, or null when any fact is unproved.
 */
async function readCarriedErrandReview(input: {
  readonly cwd: string;
  readonly exec: GitExec;
  readonly rawExec: RawGitExec;
  readonly publisher: RepositoryGitCommonStatePublisher;
  readonly store: LocalReviewOperationStateStore;
  readonly resultReader: ReviewResultReader;
  readonly repositoryId: string;
  readonly errand: OrdinaryErrand;
  readonly target: ExactErrandStatusTarget;
  readonly pullRequest: number;
  readonly completedPasses: number;
  readonly completePasses: number;
  readonly prior: { readonly attemptId: string; readonly headSha: string };
  readonly result: StandardReviewResult;
  readonly currentBaseOid: string;
  readonly currentBaseRef: string | undefined;
  readonly baseMovement: BaseMovementObservation | null | undefined;
}): Promise<RoutedReviewObligation | null> {
  const { exec, result, target, pullRequest } = input;
  const priorHead = input.prior.headSha;
  const priorProgress = await readLaneProgress(input.store, {
    lane: "standard", repositoryId: input.repositoryId, headSha: priorHead,
    lineage: { kind: "head-bound", vehicleKind: "errand", vehicleIdentity: input.errand.claimId, headSha: priorHead },
  });
  const terminal = priorProgress.status === "recorded" ? priorProgress.attempts.at(-1) : undefined;
  if (terminal?.attemptId !== input.prior.attemptId
    || (terminal.outcome !== "clean" && terminal.outcome !== "settled-findings")
    || !completesCurrentRubric(terminal, pullRequest)) return null;
  const diffBase = await resolveSoleMergeBase({
    exec, leftRevision: target.headSha, rightRevision: input.currentBaseOid,
  });
  if (diffBase.status !== "resolved") return null;
  const selector = ReviewContributionApplicabilitySelectorSchema.safeParse({
    schemaVersion: 1, repositoryId: input.repositoryId,
    // Origin preserves the host's owner casing; selectors carry the canonical lowercase form.
    repository: target.repository.toLowerCase(), pullRequest, lane: "standard",
    // The lane's source, not a local evaluator's identity, which admits a wider grammar.
    sourceId: terminal.sourceId, priorAttemptId: result.producerId,
    priorHead, currentHead: target.headSha,
    priorBase: result.target.diffBaseSha, currentBase: diffBase.mergeBase,
  });
  if (!selector.success) return null;
  const contribution = await projectGitReviewContributionApplicability({
    selector: selector.data,
    exec: input.rawExec,
    // Both endpoints are pinned commits; the caller re-reads the branch before reporting.
    observeEndpoints: () => Promise.resolve({ head: target.headSha, base: diffBase.mergeBase }),
  });
  if (contribution.state !== "applicable") return null;
  const absorbed = await analyzeRevisionOverlap({
    exec, leftRevision: priorHead, rightRevision: diffBase.mergeBase, treatmentContext: {},
  });
  const absorbedMovement = absorbed.status !== "available" ? null : BaseMovementObservationSchema.parse({
    coordinates: {
      repository: target.repository, changeRequest: pullRequest, base: diffBase.mergeBase, head: priorHead,
    },
    overlap: absorbed.overlap,
    merge: await observeGitMergeFeasibility({
      exec: input.rawExec, base: diffBase.mergeBase, head: priorHead,
      classify: (path) => classifyPathTreatment(path),
    }),
  });
  const context = { target, pullRequest };
  if (!await reviewCoversCurrentBase(exec, result.target, diffBase.mergeBase, input.currentBaseRef,
    { ...context, baseMovement: absorbedMovement })
    || !await reviewCoversCurrentBase(exec,
      { baseRef: result.target.baseRef, diffBaseSha: diffBase.mergeBase, headSha: target.headSha },
      input.currentBaseOid, input.currentBaseRef, { ...context, baseMovement: input.baseMovement ?? null })) {
    return null;
  }
  const policy = await resolveErrandLaneAtHead({
    cwd: input.cwd, exec: input.exec, publisher: input.publisher, store: input.store, resultReader: input.resultReader,
    errand: input.errand, policyTarget: { repository: target.repository, pullRequest, headSha: priorHead },
    completedPasses: input.completedPasses, completePasses: input.completePasses, terminal, result,
  });
  return policy.state !== "pass-complete" ? null : {
    state: "settled",
    detail: `The standard review of ${priorHead} carries to this head by ${contribution.proof}: it reapplies `
      + "that reviewed change, and no base movement conflicts with it.",
  };
}

/** The diff base a review of this head takes against the change request's current base, when both are known. */
async function currentErrandDiffBase(
  exec: GitExec,
  headSha: string,
  baseOid: string | undefined,
  baseRef: string | undefined,
): Promise<Pick<ReviewTarget, "baseRef" | "diffBaseSha" | "diffBaseTree" | "headSha" | "headTree"> | null> {
  if (baseOid === undefined || baseRef === undefined) return null;
  const diffBase = await resolveSoleMergeBase({ exec, leftRevision: headSha, rightRevision: baseOid });
  if (diffBase.status !== "resolved") return null;
  const tree = async (revision: string) => (await exec("git", ["rev-parse", "--verify", `${revision}^{tree}`])).stdout.trim();
  return { baseRef, diffBaseSha: diffBase.mergeBase, headSha,
    diffBaseTree: await tree(diffBase.mergeBase), headTree: await tree(headSha) };
}

/** Carry one claim's spent passes into the status of a new, unreviewed head. */
async function readUnreviewedErrandHead(input: {
  cwd: string;
  exec: GitExec;
  rawExec: RawGitExec;
  publisher: RepositoryGitCommonStatePublisher;
  store: LocalReviewOperationStateStore;
  repositoryId: string;
  errand: OrdinaryErrand;
  target: ExactErrandStatusTarget;
  pullRequest: number;
  completedPasses: number;
  currentBaseOid?: string;
  currentBaseRef?: string;
  baseMovement?: BaseMovementObservation | null;
  ceilingOverride?: ReviewCeilingOverride;
  additionalPassAuthorization?: ReviewAdditionalPassAuthorization;
  readonly sourceId?: string;
}): Promise<RoutedReviewObligation> {
  const { store, repositoryId, errand, target, completedPasses } = input;
  const owner = await readLaneProgressOwner(store, {
    lane: "standard", repositoryId, headSha: target.headSha,
    lineage: { kind: "head-bound", vehicleKind: "errand",
      vehicleIdentity: errand.claimId, headSha: target.headSha },
  });
  if (owner === null || owner.completedPasses !== completedPasses) {
    return blocked("The Errand's cumulative review progress is unavailable.");
  }
  const historical = selectErrandCorrectionPredecessor(owner.attempts, target.headSha);
  if (historical === null) return blocked("The Errand's completed review producer is unavailable.");
  const settings = (await readConfigSettings(input.cwd)).settings;
  const configured = await resolveConfiguredLanePolicy({
    lane: "standard", settings,
    preferences: { readDeveloperSourceIds: () => Promise.resolve([]),
      readProjectSourceIds: () => Promise.resolve([]) },
  });
  const policyTarget = { repository: target.repository, pullRequest: input.pullRequest,
    headSha: target.headSha };
  const resultReader = createRepositoryReviewResultReader(input.publisher);
  const result = await resultReader.readResult(historical.attemptId).catch((error: unknown) => {
    if (error instanceof LocalReviewResultReaderError
      && (error.code === "missing-producer" || error.code === "missing-result")) return null;
    throw error;
  });
  if (result === null) {
    return missingHistoricalResultObligation({ policyTarget, completedPasses,
      completePasses: countCompleteLogicalPasses(owner.attempts),
      maxPasses: configured.maxPasses, ceilingOverride: input.ceilingOverride });
  }
  if (result.kind === "frontline" || result.repositoryId !== repositoryId
    || result.target.headSha !== historical.headSha
    || !await producerBelongsToErrand(result, store, errand)) {
    return blocked("The Errand's completed review producer does not match its claim.");
  }
  // A requested additional pass asks about this head's own review, which a carry would hide.
  if (input.currentBaseOid !== undefined && input.additionalPassAuthorization === undefined) {
    const carried = await readCarriedErrandReview({
      cwd: input.cwd, exec: input.exec, rawExec: input.rawExec, publisher: input.publisher, store, resultReader,
      repositoryId, errand, target, pullRequest: input.pullRequest, completedPasses,
      completePasses: countCompleteLogicalPasses(owner.attempts), prior: historical, result,
      currentBaseOid: input.currentBaseOid, currentBaseRef: input.currentBaseRef, baseMovement: input.baseMovement,
    });
    if (carried !== null) return carried;
  }
  return nextErrandPassObligation({
    cwd: input.cwd, exec: input.exec, publisher: input.publisher, store, resultReader, errand, policyTarget, configured, result, completedPasses,
    completePasses: countCompleteLogicalPasses(owner.attempts), statusTarget: target, sourceId: input.sourceId,
    currentBase: await currentErrandDiffBase(input.exec, target.headSha, input.currentBaseOid, input.currentBaseRef),
    ...(input.ceilingOverride === undefined ? {} : { ceilingOverride: input.ceilingOverride }),
    ...(input.additionalPassAuthorization === undefined ? {}
      : { additionalPassAuthorization: input.additionalPassAuthorization }),
  });
}

/** Report the next standard-review pass an unreviewed Errand head needs within the claim's pass ceiling. */
async function nextErrandPassObligation(input: {
  readonly cwd: string;
  readonly exec: GitExec;
  readonly publisher: RepositoryGitCommonStatePublisher;
  readonly store: LocalReviewOperationStateStore;
  readonly resultReader: ReviewResultReader;
  readonly errand: ErrandClaim;
  readonly policyTarget: ErrandPolicyTarget;
  readonly configured: { readonly sources: readonly string[]; readonly maxPasses: number };
  readonly result: StandardReviewResult;
  readonly completedPasses: number;
  readonly completePasses: number;
  readonly currentBase: Awaited<ReturnType<typeof currentErrandDiffBase>>;
  readonly ceilingOverride?: ReviewCeilingOverride;
  readonly additionalPassAuthorization?: ReviewAdditionalPassAuthorization;
  readonly sourceId?: string;
  readonly statusTarget: ExactErrandStatusTarget;
}): Promise<RoutedReviewObligation> {
  const { store, configured, completedPasses } = input;
  const dispositionStore = new LocalApprovedDispositionRecordStore(input.publisher);
  const currentTarget = input.currentBase === null ? null : createReviewTarget({
    schemaVersion: 2, semanticsVersion: "review-gate/v2", kind: "change-set",
    repositoryId: input.result.repositoryId, ...input.currentBase,
  });
  const nextPassContext = await deriveReviewNextPassContext({
    completePasses: input.completePasses, completedPasses: input.completedPasses,
    predecessor: input.result, currentTarget, currentLineage: input.result.admission.lineage,
    rangeProof: { cwd: input.cwd, exec: input.exec },
    deltaAdmission: { sources: configured.sources, surface: "open-pr-errand" },
    standardReview: projectStandardReview(input.result), resultReader: input.resultReader, dispositionStore,
    readResponsePerformance: producer => readLaneResponsePerformance(store, producer),
    confirmApplicability: (predecessor, current) => confirmErrandCorrectionPredecessor({
      cwd: input.cwd, exec: input.exec, predecessor, current, store, dispositionStore, errand: input.errand,
    }),
  });
  const resolvePolicy = (chosenCoverage?: "complete") => resolveEvidenceBoundReviewPolicyContinuation({
    ...(input.sourceId === undefined ? {} : { invocation: { mode: "force" as const, sourceId: input.sourceId } }),
    schemaVersion: 1, target: input.policyTarget, lane: "standard", frontlineActive: false,
    standardReview: projectStandardReview(input.result),
    completedPasses, attempts: [],
    ...(input.ceilingOverride === undefined ? {} : { ceilingOverride: input.ceilingOverride }),
    ...(input.additionalPassAuthorization === undefined ? {}
      : { additionalPassAuthorization: input.additionalPassAuthorization }),
  }, { terminalResponsePerformed: false }, {
    sources: configured.sources,
    maxPasses: configured.maxPasses, nextPassContext, chosenCoverage, resultReader: input.resultReader,
    dispositionStore,
    readResponsePerformance: (producer) => readLaneResponsePerformance(store, producer),
    confirmTarget: (current) => Promise.resolve(current),
  });
  let policy = await resolvePolicy();
  if (policy.state === "ready" && policy.nextAction === "hosted-request") policy = await resolvePolicy("complete");
  const refusal = projectReviewDriverRefusal({ policy, route: { kind: "target", target: input.statusTarget },
    allowOwnerStop: true });
  if (refusal !== null) return refusal;
  const count = `${input.completePasses} of ${configured.maxPasses} configured complete standard-review passes`;
  if (policy.state === "approval-required") {
    return { state: "approval-required", scope: "errand",
      detail: `This Errand claim has used ${count}; another complete pass needs an exact one-pass Owner override.`,
      consequence: policy.payload.consequence };
  }
  if (policy.state === "invalid-override" || policy.state === "blocked"
    || policy.state === "unavailable") {
    return blocked(`The Errand's next standard-review pass is ${policy.state}/${policy.nextAction}.`);
  }
  const detail = `This Errand claim has used ${count}; the new head still requires review.`;
  return policy.state === "ready" && policy.nextAction === "hosted-request"
    ? errandHostedRequestObligation({ ...input, sourceId: policy.payload.sourceId, detail })
    : policy.state === "ready" && policy.nextAction === "local-prepare"
      ? errandLocalReviewObligation(detail)
      : { state: "review-required", detail };
}

/** Name ordinary local prepare, whose coverage selection uses the shared next-pass context. */
function errandLocalReviewObligation(detail: string): RoutedReviewObligation {
  return { state: "review-required", detail: `${detail} Run the next pass on delegated-agent with `
    + "arc review local prepare -; local prepare offers the admissible coverage." };
}

/** Offer the exact complete hosted request admitted by the next-pass rule. */
function errandHostedRequestObligation(input: {
  readonly policyTarget: ErrandPolicyTarget;
  readonly result: StandardReviewResult;
  readonly sourceId: string;
  readonly detail: string;
  readonly ceilingOverride?: ReviewCeilingOverride;
  readonly additionalPassAuthorization?: ReviewAdditionalPassAuthorization;
}): RoutedReviewObligation {
  const provider = HostedProviderIdSchema.safeParse(input.sourceId);
  if (!provider.success) return { state: "review-required", detail: input.detail };
  return {
    state: "review-required", scope: "errand",
    detail: `${input.detail} The next hosted pass reviews complete coverage.`,
    action: {
      schemaVersion: 1, target: input.policyTarget, provider: provider.data, coverage: "complete",
      vehicle: { kind: "errand", standardReview: projectStandardReview(input.result) },
      ...(input.ceilingOverride === undefined ? {} : { ceilingOverride: input.ceilingOverride }),
      ...(input.additionalPassAuthorization === undefined ? {}
        : { additionalPassAuthorization: input.additionalPassAuthorization }),
    },
  };
}

/**
 * Read an Errand's standard-review disposition only after a strict identity matches the target branch.
 *
 * @param input - Exact host target, checkout, and Git boundary already selected by review status.
 * @returns An Errand obligation, or null when no transient identity claims the branch.
 */
export async function readErrandRoutedObligation(input: {
  readonly cwd: string;
  readonly exec: GitExec;
  readonly rawExec: RawGitExec;
  readonly target: ExactErrandStatusTarget;
  readonly pullRequest: number;
  readonly remote?: string;
  readonly changeRequestCandidate?: Pick<ChangeRequestCandidate, "baseRefName" | "url">;
  readonly currentBaseOid?: string;
  readonly baseMovement?: BaseMovementObservation | null;
  readonly ceilingOverride?: ReviewCeilingOverride;
  readonly additionalPassAuthorization?: ReviewAdditionalPassAuthorization;
  readonly sourceId?: string;
}): Promise<RoutedReviewObligation | null> {
  // The branch vocabulary only avoids an impossible identity read; the record still grants authority.
  if (!isErrandBranchType(input.target.headRef.split("/", 1)[0] ?? "")) return null;
  const exec: GitExec = (command, args, options) => input.exec(command, args, { ...options, cwd: input.cwd });
  try {
    const identity = await resolveIdentity({ exec });
    if (identity === null) return null;
    const snapshot = await readTransientIdentitySnapshot({ exec, identity });
    if (snapshot.kind === "absent") return null;
    if (snapshot.kind === "error" || snapshot.diagnostics.length > 0) {
      return blocked("The transient identity needed to select the review vehicle is unreadable.");
    }
    const selected = matchingOrdinaryErrand([...snapshot.records.values()], input.target);
    if (selected.kind === "none") return null;
    if (selected.kind === "blocked") return blocked(selected.detail);
    if (selected.record.state === "awaiting-merge") {
      const candidate = input.changeRequestCandidate;
      const configured = candidate === undefined ? null : await resolveChangeRequestLifecycleConfiguration(
        exec,
        candidate.baseRefName,
        input.remote ?? "origin",
      );
      const retained = selected.record.changeRequest;
      if (candidate === undefined || configured === null
        || retained.baseRef !== candidate.baseRefName
        || retained.hostRef.toLowerCase() !== configured.hostRef.toLowerCase()
        || retained.hostRef.toLowerCase() !== new URL(candidate.url).hostname.toLowerCase()
        || retained.repositoryRef.toLowerCase() !== configured.repositoryRef.toLowerCase()) {
        return blocked("The Errand identity's change request does not match the exact target.");
      }
    }
    if (!await branchAtHead(exec, input.target.headRef, input.remote ?? "origin", input.target.headSha)) {
      return blocked("The Errand identity's branch does not match the exact review head.");
    }

    const publisher = new RepositoryGitCommonStatePublisher(exec, input.cwd);
    const repositoryId = await resolveRepositoryIdentity(publisher);
    const store = new LocalReviewOperationStateStore(publisher);
    const progress = await readLaneProgress(store, {
      lane: "standard",
      repositoryId,
      headSha: input.target.headSha,
      lineage: {
        kind: "head-bound",
        vehicleKind: "errand",
        vehicleIdentity: selected.record.claimId,
        headSha: input.target.headSha,
      },
    });
    if (progress.status === "unrecorded") {
      return { state: "review-required", detail: "No standard review is recorded for this Errand head." };
    }
    if (progress.attempts.length === 0 && progress.completedPasses > 0) {
      const continuation = await readUnreviewedErrandHead({
        cwd: input.cwd, exec, rawExec: input.rawExec, publisher, store, repositoryId, errand: selected.record,
        target: input.target, pullRequest: input.pullRequest, sourceId: input.sourceId,
        completedPasses: progress.completedPasses,
        ...(input.currentBaseOid === undefined ? {} : { currentBaseOid: input.currentBaseOid }),
        ...(input.changeRequestCandidate === undefined ? {}
          : { currentBaseRef: input.changeRequestCandidate.baseRefName }),
        ...(input.baseMovement === undefined ? {} : { baseMovement: input.baseMovement }),
        ...(input.ceilingOverride === undefined ? {} : { ceilingOverride: input.ceilingOverride }),
        ...(input.additionalPassAuthorization === undefined ? {}
          : { additionalPassAuthorization: input.additionalPassAuthorization }),
      });
      return await branchAtHead(exec, input.target.headRef, input.remote ?? "origin", input.target.headSha)
        ? continuation
        : blocked("The Errand identity's branch moved during review status composition.");
    }
    let latest: { readonly attempt: LanePolicyAttempt; readonly complete: boolean } | null = null;
    let currentClaimAttempt = false;
    let obsoleteClaimDetail: string | null = null;
    for (const attempt of progress.attempts) {
      const hosted = attempt.hosted;
      if (hosted?.handle !== undefined) {
        const handle = hosted.handle;
        const vehicle = handle.vehicle;
        if (vehicle?.kind !== "errand"
          || vehicle.key !== selected.record.slug
          || vehicle.branch !== selected.record.branch) {
          return blocked("Recorded review progress does not match the exact Errand identity and change request.");
        }
        if (vehicle.claimId !== selected.record.claimId) {
          obsoleteClaimDetail = "Recorded review progress does not match the exact Errand identity and change request.";
          continue;
        }
        if (handle.target.repository.toLowerCase() !== input.target.repository.toLowerCase()
          || handle.target.headSha !== input.target.headSha) {
          return blocked("Recorded review progress does not match the exact Errand identity and change request.");
        }
        if (handle.target.pullRequest !== input.pullRequest) continue;
        currentClaimAttempt = true;
        latest = {
          attempt,
          complete: completesCurrentRubric(attempt, input.pullRequest)
            && await reviewCoversCurrentBase(
              exec,
              hosted.reviewTarget,
              input.currentBaseOid,
              input.changeRequestCandidate?.baseRefName,
              input,
            ),
        };
      } else if (hosted !== undefined) {
        if (attempt.outcome === "clean" || attempt.outcome === "findings"
          || attempt.outcome === "settled-findings") {
          return blocked("Recorded hosted review has no exact Errand request binding.");
        }
        latest = { attempt, complete: false };
      } else if (attempt.local !== undefined) {
        if (attempt.local.vehicle.kind !== "errand"
          || attempt.local.vehicle.identity !== selected.record.slug
          || attempt.local.target.headSha !== input.target.headSha) {
          return blocked("Recorded local review does not match the exact Errand target.");
        }
        if (attempt.local.vehicle.claimId !== selected.record.claimId) {
          obsoleteClaimDetail = "Recorded local review does not match the exact Errand target.";
          continue;
        }
        currentClaimAttempt = true;
        latest = {
          attempt,
          complete: completesCurrentRubric(attempt, input.pullRequest)
            && await reviewCoversCurrentBase(
              exec,
              attempt.local.target,
              input.currentBaseOid,
              input.changeRequestCandidate?.baseRefName,
              input,
            ),
        };
      } else {
        latest = { attempt, complete: false };
      }
    }
    if (!currentClaimAttempt && obsoleteClaimDetail !== null) return blocked(obsoleteClaimDetail);
    if (latest === null || !latest.complete || progress.completedPasses === 0
      || (latest.attempt.outcome !== "clean" && latest.attempt.outcome !== "settled-findings")) {
      return { state: "review-required", detail: "The exact Errand standard-review lane is not settled." };
    }
    const terminal = latest.attempt;
    const resultReader = createRepositoryReviewResultReader(publisher);
    const result = await resultReader.readResult(terminal.attemptId);
    if (result.kind === "frontline" || result.admission.lineage.kind !== "head-bound"
      || result.admission.lineage.vehicleKind !== "errand"
      || result.admission.lineage.vehicleIdentity !== selected.record.claimId
      || result.target.headSha !== input.target.headSha) {
      return blocked("The terminal review producer does not match the exact Errand claim and head.");
    }
    const policy = await resolveErrandLaneAtHead({
      cwd: input.cwd, exec, publisher, store, resultReader, errand: selected.record, sourceId: input.sourceId,
      policyTarget: { repository: input.target.repository, pullRequest: input.pullRequest,
        headSha: input.target.headSha },
      completedPasses: progress.completedPasses, completePasses: progress.completePasses, terminal, result,
      ...(input.ceilingOverride === undefined ? {} : { ceilingOverride: input.ceilingOverride }),
      ...(input.additionalPassAuthorization === undefined ? {}
        : { additionalPassAuthorization: input.additionalPassAuthorization }),
    });
    if (!await branchAtHead(exec, input.target.headRef, input.remote ?? "origin", input.target.headSha)) {
      return blocked("The Errand identity's branch moved during review status composition.");
    }
    const refusal = projectReviewDriverRefusal({ policy, route: { kind: "target", target: input.target },
      allowOwnerStop: true });
    if (refusal !== null) return refusal;
    if (policy.state === "approval-required") {
      return { state: "approval-required", scope: "errand",
        detail: `This Errand claim has used ${progress.completePasses} complete standard-review passes; `
          + "another complete pass needs an exact one-pass Owner override.",
        consequence: policy.payload.consequence };
    }
    if (policy.state === "invalid-override") {
      return blocked(`The Errand's standard-review override is invalid: ${policy.payload.reason}.`);
    }
    const detail = `The exact Errand standard-review lane requires ${policy.state}/${policy.nextAction}.`;
    if (policy.state === "ready" && policy.nextAction === "hosted-request") {
      return errandHostedRequestObligation({ result, policyTarget: { repository: input.target.repository,
        pullRequest: input.pullRequest, headSha: input.target.headSha }, sourceId: policy.payload.sourceId, detail,
        ceilingOverride: input.ceilingOverride, additionalPassAuthorization: input.additionalPassAuthorization });
    }
    if (policy.state === "ready" && policy.nextAction === "local-prepare") return errandLocalReviewObligation(detail);
    return policy.state === "pass-complete"
      ? { state: "settled", detail: "The exact Errand standard-review lane is settled by verified convergence." }
      : {
        state: "review-required",
        detail,
      };
  } catch (error) {
    return blocked(error instanceof Error ? error.message : String(error));
  }
}
