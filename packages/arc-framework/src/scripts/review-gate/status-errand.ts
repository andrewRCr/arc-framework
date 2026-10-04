/** Positive Errand identity and exact-head lane progress for review status. */

import { readTransientIdentitySnapshot } from "../../lib/errand/identity-snapshot.js";
import { readConfigSettings } from "../../lib/config/status-reader.js";
import { resolveChangeRequestLifecycleConfiguration } from "../../lib/errand/change-request-lifecycle.js";
import type { TransientIdentityRecord } from "../../lib/errand/identity-record.js";
import { isErrandBranchType } from "../../lib/errand/branch-type.js";
import { RepositoryGitCommonStatePublisher } from "../../lib/git-common-state.js";
import type { GitExec } from "../../lib/git/exec.js";
import { isGitProcessError } from "../../lib/git/process-error.js";
import { resolveIdentity } from "../../lib/git/index.js";
import { canonicalize } from "../../lib/kernel/index.js";
import { LocalReviewOperationStateStore } from "./hosts/local/operation-state-store.js";
import { LocalApprovedDispositionRecordStore } from "./hosts/local/disposition-record-store.js";
import { createRepositoryReviewResultReader } from "./hosts/local/review-result-reader-composition.js";
import { LocalReviewResultReaderError } from "./hosts/local/review-result-reader.js";
import { resolveRepositoryIdentity } from "./hosts/local/git-common-state.js";
import {
  readLaneProgress,
  readLaneProgressOwner,
  readLaneResponsePerformance,
  type LanePolicyAttempt,
} from "./lane-progress.js";
import { GitObjectIdSchema, type ReviewTarget } from "./core/gate-contract-v2-schema.js";
import type { ReviewResult } from "./core/review-result.js";
import type { ChangeRequestCandidate } from "./change-request.js";
import { STANDARD_REVIEW_RUBRIC_IDENTITY } from "./policy/standard-review.js";
import { resolveConfiguredLanePolicy } from "./policy/lane-policy-config.js";
import { projectReviewPolicyAttempt } from "./policy/review-policy-driver.js";
import type { ReviewAdditionalPassAuthorization, ReviewCeilingOverride } from "./policy/review-policy-driver.js";
import {
  readIncrementalPredecessorResponseEvidence,
  resolveEvidenceBoundReviewPolicyContinuation,
} from "./policy/review-policy-evidence.js";
import { confirmErrandFixResponseApplicability } from "./policy/local-review-coverage-selection.js";
import type { IncrementalPredecessorApplicability } from "./policy/incremental-coverage-basis.js";
import type { RoutedReviewObligation } from "./status.js";

interface ExactErrandStatusTarget {
  readonly repository: string;
  readonly headRef: string;
  readonly headSha: string;
}

type OrdinaryErrand = Extract<TransientIdentityRecord, { kind: "errand"; purpose: "errand" }>;

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
  reviewed: ReviewTarget,
  currentBaseOid: string | undefined,
  currentBaseRef: string | undefined,
): Promise<boolean> {
  if (currentBaseOid === undefined || !GitObjectIdSchema.safeParse(currentBaseOid).success
    || (currentBaseRef !== undefined && reviewed.baseRef !== currentBaseRef)) return false;
  return await isAncestor(exec, reviewed.diffBaseSha, currentBaseOid)
    && await isAncestor(exec, currentBaseOid, reviewed.headSha);
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

function localProducerBelongsToErrand(result: Extract<ReviewResult, { kind: "attested-local" }>, errand: OrdinaryErrand): boolean {
  return result.vehicle.kind === "errand"
    && result.vehicle.identity === errand.slug
    && result.vehicle.claimId === errand.claimId
    && result.request.carrier.kind === "local-change-set"
    && result.request.carrier.errandClaimId === errand.claimId;
}

function hasErrandLineage(result: ReviewResult, errand: OrdinaryErrand): boolean {
  const lineage = result.admission.lineage;
  return lineage.kind === "head-bound" && lineage.vehicleKind === "errand"
    && lineage.vehicleIdentity === errand.claimId && lineage.headSha === result.target.headSha;
}

/** Check the exact producer's Errand binding, including hosted history omitted from normalized results. */
async function producerBelongsToErrand(
  result: ReviewResult,
  store: LocalReviewOperationStateStore,
  errand: OrdinaryErrand,
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
  errand: OrdinaryErrand;
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
  const performance = await readPerformance(predecessor);
  if (performance?.producerId !== predecessor.producerId
    || performance.originatingHeadSha !== predecessor.target.headSha
    || performance.producedHeadSha !== current.target.headSha) return "unavailable";
  const response = await readIncrementalPredecessorResponseEvidence(
    predecessor, dispositionStore, readPerformance,
  );
  return response.status === "performed" ? "applicable" : "unavailable";
}

/** Prove each changed-head Errand correction leg before the shared coverage-chain validator accepts it. */
async function confirmErrandCorrectionPredecessor(input: {
  predecessor: ReviewResult;
  current: ReviewResult;
  store: LocalReviewOperationStateStore;
  dispositionStore: LocalApprovedDispositionRecordStore;
  errand: OrdinaryErrand;
}): Promise<IncrementalPredecessorApplicability> {
  const { predecessor, current, store, errand } = input;
  if (!await producerBelongsToErrand(predecessor, store, errand)
    || !await producerBelongsToErrand(current, store, errand)
    || predecessor.repositoryId !== current.repositoryId) return "unavailable";
  if (canonicalize(predecessor.target) === canonicalize(current.target)) return "applicable";
  if (!sharesCorrectionBase(predecessor, current)) return "unavailable";
  return confirmChangedErrandResponse(input);
}

/** Preserve the claim-wide ceiling when an older producer has no readable result artifact. */
function missingHistoricalResultObligation(input: {
  readonly policyTarget: { readonly repository: string; readonly pullRequest: number; readonly headSha: string };
  readonly completedPasses: number;
  readonly maxPasses: number;
  readonly ceilingOverride?: ReviewCeilingOverride;
}): RoutedReviewObligation {
  if (input.completedPasses < input.maxPasses) {
    return { state: "review-required", detail: "The exact Errand standard-review lane is not settled." };
  }
  const consequence = {
    target: input.policyTarget, lane: "standard" as const,
    exhaustedPassCount: input.completedPasses, nextPass: input.completedPasses + 1,
  };
  const override = input.ceilingOverride;
  if (override === undefined) {
    return { state: "approval-required", scope: "errand",
      detail: "The Errand claim has exhausted its standard-review pass ceiling; the historical "
        + "producer result is unavailable, and another pass needs an exact one-pass Owner override.",
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
      + "execution admission must verify the next pass." };
}

/** Carry one claim's spent passes into the status of a new, unreviewed head. */
async function readUnreviewedErrandHead(input: {
  cwd: string;
  publisher: RepositoryGitCommonStatePublisher;
  store: LocalReviewOperationStateStore;
  repositoryId: string;
  errand: OrdinaryErrand;
  target: ExactErrandStatusTarget;
  pullRequest: number;
  completedPasses: number;
  ceilingOverride?: ReviewCeilingOverride;
  additionalPassAuthorization?: ReviewAdditionalPassAuthorization;
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
  const historical = [...owner.attempts]
    .filter((attempt) => attempt.headSha !== target.headSha && attempt.terminalProducer
      && (attempt.outcome === "clean" || attempt.outcome === "findings"
        || attempt.outcome === "settled-findings"))
    .sort((left, right) => right.logicalPass - left.logicalPass)[0];
  if (historical === undefined) return blocked("The Errand's completed review producer is unavailable.");
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
      maxPasses: configured.maxPasses, ceilingOverride: input.ceilingOverride });
  }
  if (result.kind === "frontline" || result.repositoryId !== repositoryId
    || result.target.headSha !== historical.headSha
    || !await producerBelongsToErrand(result, store, errand)) {
    return blocked("The Errand's completed review producer does not match its claim.");
  }
  const requirement = result.requirement;
  const policy = await resolveEvidenceBoundReviewPolicyContinuation({
    schemaVersion: 1, target: policyTarget, lane: "standard", frontlineActive: false,
    standardReview: {
      obligation: requirement.obligation, reasons: requirement.reasons,
      rubricVersion: requirement.rubricVersion, rubricDigest: requirement.rubricDigest,
      retrigger: requirement.retrigger, count: requirement.count,
    },
    completedPasses, attempts: [],
    ...(input.ceilingOverride === undefined ? {} : { ceilingOverride: input.ceilingOverride }),
    ...(input.additionalPassAuthorization === undefined ? {}
      : { additionalPassAuthorization: input.additionalPassAuthorization }),
  }, { terminalResponsePerformed: false }, {
    sources: configured.sources, maxPasses: configured.maxPasses, resultReader,
    dispositionStore: new LocalApprovedDispositionRecordStore(input.publisher),
    readResponsePerformance: (producer) => readLaneResponsePerformance(store, producer),
    confirmTarget: (current) => Promise.resolve(current),
  });
  const count = `${completedPasses} of ${configured.maxPasses} configured standard-review passes`;
  if (policy.state === "approval-required") {
    return { state: "approval-required", scope: "errand",
      detail: `This Errand claim has used ${count}; another pass needs an exact one-pass Owner override.`,
      consequence: policy.payload.consequence };
  }
  if (policy.state === "invalid-override" || policy.state === "blocked"
    || policy.state === "unavailable") {
    return blocked(`The Errand's next standard-review pass is ${policy.state}/${policy.nextAction}.`);
  }
  return { state: "review-required",
    detail: `This Errand claim has used ${count}; the new head still requires review.` };
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
  readonly target: ExactErrandStatusTarget;
  readonly pullRequest: number;
  readonly remote?: string;
  readonly changeRequestCandidate?: Pick<ChangeRequestCandidate, "baseRefName" | "url">;
  readonly currentBaseOid?: string;
  readonly ceilingOverride?: ReviewCeilingOverride;
  readonly additionalPassAuthorization?: ReviewAdditionalPassAuthorization;
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
        cwd: input.cwd, publisher, store, repositoryId, errand: selected.record,
        target: input.target, pullRequest: input.pullRequest,
        completedPasses: progress.completedPasses,
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
    const rubric = STANDARD_REVIEW_RUBRIC_IDENTITY;
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
          complete: hosted.effectiveCoverage !== null
            && vehicle.standardReview.rubricVersion === rubric.version
            && vehicle.standardReview.rubricDigest === rubric.digest
            && hosted.requirement.rubricVersion === rubric.version
            && hosted.requirement.rubricDigest === rubric.digest
            && await reviewCoversCurrentBase(
              exec,
              hosted.reviewTarget,
              input.currentBaseOid,
              input.changeRequestCandidate?.baseRefName,
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
          complete: attempt.chunkSeriesComplete !== false
            && attempt.local.rubricIdentity?.version === rubric.version
            && attempt.local.rubricIdentity.digest === rubric.digest
            && await reviewCoversCurrentBase(
              exec,
              attempt.local.target,
              input.currentBaseOid,
              input.changeRequestCandidate?.baseRefName,
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
    const settings = (await readConfigSettings(input.cwd)).settings;
    const configured = await resolveConfiguredLanePolicy({
      lane: "standard",
      settings,
      preferences: {
        readDeveloperSourceIds: () => Promise.resolve([]),
        readProjectSourceIds: () => Promise.resolve([]),
      },
    });
    const policyTarget = {
      repository: input.target.repository,
      pullRequest: input.pullRequest,
      headSha: input.target.headSha,
    };
    const requirement = result.requirement;
    const dispositionStore = new LocalApprovedDispositionRecordStore(publisher);
    const policy = await resolveEvidenceBoundReviewPolicyContinuation({
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
      completedPasses: progress.completedPasses,
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
      maxPasses: configured.maxPasses,
      resultReader,
      dispositionStore,
      readResponsePerformance: (producer) => readLaneResponsePerformance(store, producer),
      confirmIncrementalApplicability: (predecessor, current) => confirmErrandCorrectionPredecessor({
        predecessor, current, store, dispositionStore, errand: selected.record,
      }),
      confirmTarget: (target) => Promise.resolve(target),
    });
    if (!await branchAtHead(exec, input.target.headRef, input.remote ?? "origin", input.target.headSha)) {
      return blocked("The Errand identity's branch moved during review status composition.");
    }
    if (policy.state === "approval-required") {
      return { state: "approval-required", scope: "errand",
        detail: `This Errand claim has used ${progress.completedPasses} standard-review passes; `
          + "another pass needs an exact one-pass Owner override.",
        consequence: policy.payload.consequence };
    }
    if (policy.state === "invalid-override") {
      return blocked(`The Errand's standard-review override is invalid: ${policy.payload.reason}.`);
    }
    return policy.state === "pass-complete"
      ? { state: "settled", detail: "The exact Errand standard-review lane is settled by verified convergence." }
      : {
        state: "review-required",
        detail: `The exact Errand standard-review lane requires ${policy.state}/${policy.nextAction}.`,
      };
  } catch (error) {
    return blocked(error instanceof Error ? error.message : String(error));
  }
}
