/** Discharge evidence for a hosted-review reservation carried across publication. */

import type { DeliveryReviewMemberVehicle } from "../../../lib/delivery/review-vehicle.js";
import { canonicalize } from "../../../lib/canonical/canonical-json.js";
import type { DeliveryHostPort } from "../../../lib/delivery/host.js";
import { readConfigSettings } from "../../../lib/config/status-reader.js";
import { RepositoryGitCommonStatePublisher } from "../../../lib/git-common-state.js";
import type { GitExec } from "../../../lib/git/index.js";
import { createRawGitExec } from "../../../lib/io-context.js";
import type { DeliveryDischargeTargetLookup } from "../core/delivery-member-lookup.js";
import { resolveRepositoryIdentity } from "../hosts/local/git-common-state.js";
import { LocalApprovedDispositionRecordStore } from
  "../hosts/local/disposition-record-store.js";
import { LocalReviewOperationStateStore } from "../hosts/local/operation-state-store.js";
import { createRepositoryReviewResultReader } from
  "../hosts/local/review-result-reader-composition.js";
import {
  laneProgressOperationId,
  readLaneResponsePerformance,
  readLaneProgressAcrossLineage,
  type LaneProgressProjection,
} from "../lane-progress.js";
import type { StandardReviewReservationV1 } from "./integration-boundary-locus.js";
import type { EarlierHostedAttemptApplicabilityRead } from "./earlier-review-applicability.js";
import type { ReviewResult } from "../core/review-result.js";
import { projectHostedFinding } from "../hosted/await.js";
import type { HostedReviewCoverage } from "../hosted/request.js";
import { bindReviewSourceReference } from "../core/review-source-reference.js";
import {
  candidateExpectsEarlierReviewAttempt,
  projectEarlierReviewApplicability,
} from "./earlier-review-applicability.js";
import type { ReviewResolveEnvelope } from "./review-policy-driver.js";
import { projectReviewPolicyAttempt } from "./review-policy-driver.js";
import {
  readIncrementalPredecessorResponseEvidence,
  resolveEvidenceBoundReviewPolicy,
} from "./review-policy-evidence.js";
import type { IncrementalReviewScope } from "../core/incremental-review-scope.js";
import {
  resolveIncrementalCorrectionScope as resolveVerifiedIncrementalCorrectionScope,
  type IncrementalPredecessorApplicability,
} from "./incremental-coverage-basis.js";
import { ReviewCoverageSelectionActionSchema } from "./review-coverage-selection.js";

import {
  ProjectedLaneAttempt,
  EarlierApplicableAttempt,
  IncrementalCorrectionScopeCandidate,
  incrementalApplicabilityFromEarlierRead,
  confirmIncrementalPredecessorApplicability,
  confirmExactCurrentCorrectionPredecessor,
  isCompleteStandardVerdict,
  terminalPolicyOutcome,
  currentCorrectionScopeCandidate,
  attemptMatchesTarget,
  HostedReservationRequestAttempt,
  PendingFindingRoute,
  projectPendingFindings,
  projectSelectedOwnerDischarge,
  selectedOwnerCleanAttempt,
  retainedSafeUnavailableAttempt,
  HostedReservationDischarge,
  HostedReservationDischargeReaderArgs,
  HostedReservationDischargeReader,
  coverageSelectionChoices,
  oneRequestedCoverage,
  requestedCoverageOf,
  applicabilityEquivalenceKey,
  allHostedReservationTargetsDischarged,
  resolveHostedReservationTargets,
} from "./hosted-reservation-support.js";
export * from "./hosted-reservation-support.js";

/**
 * Decide whether a carried hosted-review reservation has been discharged.
 *
 * Discharge is a complete `clean` attempt by the first ordered source that
 * was not safely unavailable on the standard lane anywhere in the Candidate span, or by a complete
 * exact-member attempt whose admitted request retained an explicit Owner source selection.
 * It is read rather than written because a discharge
 * write needs a caller who remembers to make it, and a reservation nobody cleared is the realized
 * failure this replaces. The span rather than the approved head alone: a review that ran before a
 * later fix landed still discharged the obligation, and gating on the head would replace the
 * workflow's own review-applicability judgment with a CLI gate.
 *
 * @param input - The carried reservation, the Candidate span, and the lane-progress read.
 * @returns The discharge verdict and the evidence sentence naming what settled it.
 */
export async function projectHostedReservationDischarge(input: {
  reservation: StandardReviewReservationV1 | null;
  span: readonly string[];
  target: {
    repository: string;
    pullRequest: number;
    headSha: string;
    baseRevision?: string;
    vehicle?: DeliveryReviewMemberVehicle;
  } | null;
  readLaneProgress: (headSha: string) => Promise<LaneProgressProjection>;
  readEarlierAttemptApplicability?: (
    sourceId: string,
  ) => Promise<EarlierHostedAttemptApplicabilityRead>;
  requireEarlierApplicabilityEvidence?: boolean | ((sourceId: string) => boolean);
  bindCurrentAttemptRef?: (attemptId: string) => string;
  resolveTerminalPolicy: (attempt: ProjectedLaneAttempt) => Promise<ReviewResolveEnvelope>;
  resolveEarlierTerminalPolicy: (attempt: EarlierApplicableAttempt) => Promise<ReviewResolveEnvelope>;
  resolveIncrementalCorrectionScope?: (
    attempt: IncrementalCorrectionScopeCandidate,
    currentHeadSha: string,
  ) => Promise<IncrementalReviewScope | null>;
}): Promise<HostedReservationDischarge> {
  const { reservation } = input;
  if (reservation === null) {
    return { discharged: true, detail: "Local carrier `local-attestation`.", nextSource: null };
  }
  if (input.target === null) {
    return {
      discharged: false,
      detail: "The reserved hosted review has no exact open change-request target.",
      nextSource: reservation.sources[0] ?? null,
    };
  }
  const target = input.target;
  const attemptsByHead = new Map<string, ProjectedLaneAttempt[]>();
  const completedPassesByHead = new Map<string, number>();
  for (const headSha of input.span) {
    const progress = await input.readLaneProgress(headSha);
    if (progress.status !== "recorded") continue;
    completedPassesByHead.set(headSha, progress.completedPasses);
    attemptsByHead.set(headSha, progress.attempts.filter((attempt) => (
      attemptMatchesTarget(attempt, headSha, target)
    )));
  }
  const allAttempts = [...attemptsByHead.values()].flat();
  const currentAttemptHistory = attemptsByHead.get(target.headSha) ?? [];
  const currentAttempts = currentAttemptHistory;
  const completedPasses = Math.max(0, ...completedPassesByHead.values());
  const activeLogicalPass = completedPasses + 1;
  const activeCurrentAttempts = currentAttemptHistory.filter((attempt) => (
    attempt.logicalPass === activeLogicalPass
  ));
  const currentRequestCoverage = requestedCoverageOf(activeCurrentAttempts);
  if (currentRequestCoverage === "conflict") {
    return {
      discharged: false,
      detail: "The active review pass contains conflicting requested coverage.",
      nextSource: null,
    };
  }
  let requestCoverage: HostedReviewCoverage | null = currentRequestCoverage;
  const requestAttempts: HostedReservationRequestAttempt[] = [];
  const requestContext = () => ({
    requestAttempts, completedPasses,
    ...(requestCoverage === null ? {} : { requestCoverage }),
  });
  const currentFindingRoutes = reservation.sources.flatMap((sourceId) => (
    currentAttempts
      .filter((attempt) => attempt.sourceId === sourceId && attempt.outcome === "findings")
      .map((attempt): PendingFindingRoute => {
        if (attempt.local !== undefined) {
          return {
            sourceId,
            localResumeAction: { schemaVersion: 1, operationId: attempt.attemptId },
          };
        }
        if (attempt.hosted === undefined
          || attempt.hosted.sealedResult?.outcome !== "findings"
          || input.bindCurrentAttemptRef === undefined) return { sourceId };
        return {
          sourceId,
          responsePlan: {
            schemaVersion: 1,
            target: attempt.hosted.reviewTarget,
            source: {
              kind: "hosted",
              attemptRef: input.bindCurrentAttemptRef(attempt.attemptId),
            },
            findings: attempt.hosted.sealedResult.findings.map(projectHostedFinding),
          },
        };
      })
  ));
  const currentFindings = projectPendingFindings(currentFindingRoutes, "current");
  if (currentFindings !== null) return currentFindings;
  const pendingAttempts = currentAttempts.filter((attempt) => (
    attempt.outcome === "pending" && reservation.sources.includes(attempt.sourceId)
  ));
  if (pendingAttempts.length > 0) {
    const pending = pendingAttempts.length === 1 ? pendingAttempts[0] : undefined;
    if (pending?.hosted?.handle === undefined) {
      return {
        discharged: false,
        detail: "The reserved hosted sources have pending request progress without one exact durable handle.",
        nextSource: null,
      };
    }
    return {
      discharged: false,
      detail: `Hosted source \`${pending.sourceId}\` has one pending request awaiting a verdict.`,
      nextSource: null,
      awaitAction: { schemaVersion: 1, handle: pending.hosted.handle },
    };
  }
  const earlierReader = input.readEarlierAttemptApplicability;
  const activeEarlierBySource = earlierReader === undefined ? null : new Map(await Promise.all(
    reservation.sources.map(async (sourceId) => [sourceId, await earlierReader(sourceId)] as const),
  ));
  const readActiveEarlier = (sourceId: string): Promise<EarlierHostedAttemptApplicabilityRead | null> =>
    Promise.resolve(activeEarlierBySource?.get(sourceId) ?? null);
  let retainedTerminalLogicalPass = 0;
  let retainedTerminals: EarlierApplicableAttempt[] = [];
  if (input.readEarlierAttemptApplicability !== undefined) {
    retainedTerminals = reservation.sources.flatMap((sourceId) => {
      const earlier = activeEarlierBySource?.get(sourceId);
      return earlier?.status === "complete" ? earlier.attempts.filter((attempt) =>
        attempt.sourceId === sourceId && (attempt.outcome === "clean" || attempt.outcome === "settled-findings") && attempt.applicability === "retain-prior-attempt") : [];
    });
    retainedTerminalLogicalPass = Math.max(0, ...retainedTerminals.map((attempt) => attempt.logicalPass));
    const latestTerminalKeys = new Set(retainedTerminals.filter((attempt) => attempt.logicalPass === retainedTerminalLogicalPass)
      .map((attempt) => `${attempt.operationId}:${attempt.attemptId}:${attempt.outcome}`));
    if (latestTerminalKeys.size > 1) return {
      detail: "The latest retained logical pass contains conflicting terminal review evidence.",
      discharged: false, nextSource: null,
    };
  }
  const latestTerminal = currentAttempts.reduce<ProjectedLaneAttempt | undefined>((latest, attempt) => (
    reservation.sources.includes(attempt.sourceId)
      && (attempt.outcome === "clean" || attempt.outcome === "settled-findings")
      && (latest === undefined || attempt.logicalPass >= latest.logicalPass)
      ? attempt
      : latest
  ), undefined);
  const earlierHistoryReady = input.readEarlierAttemptApplicability === undefined || reservation.sources.every((sourceId) => {
    const earlier = activeEarlierBySource?.get(sourceId);
    const required = typeof input.requireEarlierApplicabilityEvidence === "function"
      ? input.requireEarlierApplicabilityEvidence(sourceId)
      : input.requireEarlierApplicabilityEvidence === true;
    return earlier?.status === "complete" ? earlier.attempts.length > 0 : earlier?.status === "not-found" && !required;
  });
  if (latestTerminal !== undefined && retainedTerminals.some((attempt) =>
    attempt.logicalPass === latestTerminal.logicalPass
      && (attempt.attemptId !== latestTerminal.attemptId || attempt.outcome !== latestTerminal.outcome))) return {
    discharged: false, detail: "The latest logical pass contains conflicting current and retained terminal review evidence.",
    nextSource: null,
  };
  const retainedFindingsBeforeRequest = async (): Promise<HostedReservationDischarge | null> => {
    if (input.readEarlierAttemptApplicability === undefined) return null;
    const routes: PendingFindingRoute[] = [];
    for (const sourceId of reservation.sources) {
      const earlier = await readActiveEarlier(sourceId);
      const evidenceRequired = typeof input.requireEarlierApplicabilityEvidence === "function"
        ? input.requireEarlierApplicabilityEvidence(sourceId)
        : input.requireEarlierApplicabilityEvidence === true;
      if (earlier === null || earlier.status === "unavailable") {
        return {
          discharged: false,
          detail: earlier?.status === "unavailable"
            ? earlier.detail
            : "Earlier review applicability evidence is incomplete.",
          nextSource: null,
        };
      }
      if ((earlier.status === "not-found" && evidenceRequired)
        || (earlier.status === "complete" && earlier.attempts.length === 0)) {
        return {
          discharged: false,
          detail: "Earlier review applicability evidence is incomplete.",
          nextSource: null,
        };
      }
      if (earlier.status !== "complete") continue;
      routes.push(...earlier.attempts
        .filter((attempt) => attempt.sourceId === sourceId && attempt.outcome === "findings")
        .map((attempt) => ({
          sourceId,
          ...(attempt.responsePlan === undefined ? {} : { responsePlan: attempt.responsePlan }),
          ...(attempt.localResumeAction === undefined
            ? {}
            : { localResumeAction: attempt.localResumeAction }),
        })));
    }
    return projectPendingFindings(routes, "retained");
  };
  const dischargeAfterRetained = async (detail: string): Promise<HostedReservationDischarge> =>
    await retainedFindingsBeforeRequest() ?? { discharged: true, detail, nextSource: null };
  const currentTerminalIsLatest = latestTerminal !== undefined && earlierHistoryReady
    && latestTerminal.logicalPass >= retainedTerminalLogicalPass;
  const selectedClean = latestTerminal && selectedOwnerCleanAttempt([latestTerminal], reservation);
  let selectedCleanValidated = false;
  let latestCurrentCorrectionCandidate: IncrementalCorrectionScopeCandidate | null = null;
  if (currentTerminalIsLatest) {
    const admittedLocalTerminal = [...currentAttemptHistory].reverse().find((attempt) => (
      attempt.logicalPass === latestTerminal.logicalPass
      && (attempt.outcome === "clean" || attempt.outcome === "settled-findings")
      && attempt.local?.deliveryAdmission !== undefined
    ));
    for (const sourceId of selectedClean === undefined ? reservation.sources : [selectedClean.sourceId]) {
      const sourceAttempts = currentAttemptHistory.filter((attempt) => (
        attempt.sourceId === sourceId && attempt.logicalPass === latestTerminal.logicalPass
      ));
      const currentTerminal = [...sourceAttempts].reverse().find((attempt) => (
        attempt.outcome === "clean" || attempt.outcome === "settled-findings"
      ));
      if (currentTerminal !== undefined) {
        const policy = await input.resolveTerminalPolicy(currentTerminal);
        if (policy.state === "pass-complete" && selectedClean !== undefined) {
          selectedCleanValidated = true;
          break;
        }
        if (policy.state === "pass-complete") {
          return dischargeAfterRetained(currentTerminal.outcome === "clean"
              ? `${sourceId === "delegated-agent" ? "Standard" : "Hosted"} source \`${sourceId}\`.`
              : `${sourceId === "delegated-agent" ? "Standard" : "Hosted"} source \`${sourceId}\` converged with `
                + "no verified material findings.");
        }
        if (currentTerminal.outcome === "clean" || policy.state !== "findings") {
          const correctionCandidate = currentCorrectionScopeCandidate(currentTerminal);
          const correctionScope = policy.state === "coverage-required"
            && correctionCandidate !== null
            && input.resolveIncrementalCorrectionScope !== undefined
            ? await input.resolveIncrementalCorrectionScope(correctionCandidate, target.headSha)
            : null;
          const coverageSelectionAction = policy.state === "coverage-required" && target.vehicle !== undefined
            ? ReviewCoverageSelectionActionSchema.parse({
                schemaVersion: 1,
                kind: "review-coverage-selection",
                workUnitId: target.vehicle.workUnitId,
                sourceId: policy.payload.sourceId,
                pass: policy.payload.pass,
                completedPasses: policy.payload.completedPasses,
                consumedPass: policy.payload.consumedPass,
                choices: coverageSelectionChoices(
                  reservation.sources,
                  correctionScope ?? undefined,
                ),
                interactionText: "Select one listed source and coverage pair, then re-run `arc review status "
                  + `--work-unit ${target.vehicle.workUnitId} --source <sourceId> --coverage <coverage> --json\`.`,
              })
            : undefined;
          return {
            discharged: false,
            detail: `The terminal review producer did not establish convergence (${policy.state}/${policy.nextAction}).`,
            nextSource: null,
            ...(correctionScope === null ? {} : { correctionScope }),
            ...(coverageSelectionAction === undefined ? {} : { coverageSelectionAction }),
          };
        }
        latestCurrentCorrectionCandidate = currentCorrectionScopeCandidate(currentTerminal);
        break;
      }
      if (admittedLocalTerminal !== undefined) continue;
      if (retainedSafeUnavailableAttempt(sourceId, sourceAttempts) === null) break;
    }
  }
  const correctionContext = async (): Promise<{ correctionScope?: IncrementalReviewScope }> => {
    if (input.resolveIncrementalCorrectionScope === undefined) return {};
    let candidate = latestCurrentCorrectionCandidate;
    if (candidate === null) {
      const candidates = reservation.sources.flatMap((sourceId) => {
        const earlier = activeEarlierBySource?.get(sourceId);
        return earlier?.status === "complete"
          ? earlier.attempts.filter((attempt) => (
              (attempt.outcome === "clean" || attempt.outcome === "settled-findings")
              && (attempt.applicability === "request-review"
                || attempt.applicability === "retain-prior-attempt")
            ))
          : [];
      }).sort((left, right) => right.logicalPass - left.logicalPass
        || right.updatedAt.localeCompare(left.updatedAt)
        || left.attemptId.localeCompare(right.attemptId));
      candidate = candidates[0] ?? null;
    }
    if (candidate === null) return {};
    const correctionScope = await input.resolveIncrementalCorrectionScope(candidate, target.headSha);
    return correctionScope === null ? {} : { correctionScope };
  };
  const retainedTerminalPolicyStop = async (
    policy: ReviewResolveEnvelope,
  ): Promise<HostedReservationDischarge> => {
    const context = policy.state === "coverage-required" ? await correctionContext() : {};
    const coverageSelectionAction = policy.state === "coverage-required" && target.vehicle !== undefined
      ? ReviewCoverageSelectionActionSchema.parse({
          schemaVersion: 1,
          kind: "review-coverage-selection",
          workUnitId: target.vehicle.workUnitId,
          sourceId: policy.payload.sourceId,
          pass: policy.payload.pass,
          completedPasses: policy.payload.completedPasses,
          consumedPass: policy.payload.consumedPass,
          choices: coverageSelectionChoices(reservation.sources, context.correctionScope),
          interactionText: "Select one listed source and coverage pair, then re-run `arc review status "
            + `--work-unit ${target.vehicle.workUnitId} --source <sourceId> --coverage <coverage> --json\`.`,
        })
      : undefined;
    return {
      discharged: false,
      detail: `The retained terminal review producer did not establish convergence `
        + `(${policy.state}/${policy.nextAction}).`,
      nextSource: null,
      ...context,
      ...(coverageSelectionAction === undefined ? {} : { coverageSelectionAction }),
    };
  };
  if (currentTerminalIsLatest && selectedClean !== undefined && selectedCleanValidated) {
    return projectSelectedOwnerDischarge(selectedClean, await retainedFindingsBeforeRequest());
  }
  const orderedLogicalPass = Math.max(latestTerminal?.logicalPass ?? 0, retainedTerminalLogicalPass) || activeLogicalPass;
  for (const sourceId of reservation.sources) {
    const orderedSourceAttempts = currentAttemptHistory.filter((attempt) => (
      attempt.sourceId === sourceId && attempt.logicalPass === orderedLogicalPass
    ));
    if (input.readEarlierAttemptApplicability === undefined
      && allAttempts.some((attempt) => attempt.sourceId === sourceId
        && isCompleteStandardVerdict(attempt)
        && attempt.outcome === "clean")) {
      return {
        discharged: false,
        detail: "Earlier review applicability evidence is incomplete.",
        nextSource: null,
      };
    }
    const safelyUnavailable = retainedSafeUnavailableAttempt(
      sourceId,
      orderedSourceAttempts,
    );
    if (safelyUnavailable !== null) {
      if (orderedLogicalPass === activeLogicalPass) requestAttempts.push(safelyUnavailable);
      continue;
    }
    if (input.readEarlierAttemptApplicability !== undefined) {
      const earlier = await readActiveEarlier(sourceId);
      if (earlier === null) throw new Error("earlier applicability reader disappeared");
      const evidenceRequired = typeof input.requireEarlierApplicabilityEvidence === "function"
        ? input.requireEarlierApplicabilityEvidence(sourceId)
        : input.requireEarlierApplicabilityEvidence === true;
      if (earlier.status === "not-found" && !evidenceRequired) {
        const retainedFindings = await retainedFindingsBeforeRequest();
        if (retainedFindings !== null) return retainedFindings;
        return {
          discharged: false,
          detail: `The reserved standard-review source order beginning at \`${reservation.sources[0]}\` has not produced `
            + "a settled review across the Candidate span.",
          nextSource: sourceId,
          ...requestContext(),
          ...await correctionContext(),
        };
      }
      if (earlier.status !== "complete" || earlier.attempts.length === 0) {
        return {
          discharged: false,
          detail: earlier.status === "unavailable"
            ? earlier.detail
            : "Earlier review applicability evidence is incomplete.",
          nextSource: null,
        };
      }
      const selected = earlier.attempts.filter((attempt) => attempt.sourceId === sourceId);
      const standardAttempts = selected.filter(({ requestedCoverage, effectiveCoverage, outcome }) => (
        requestedCoverage === "complete"
        || effectiveCoverage === "complete"
        || outcome === "clean"
        || outcome === "settled-findings"
      ));
      const stoppedAttempts = standardAttempts.filter(({ applicability }) => applicability === "stop");
      const stopped = stoppedAttempts[0];
      if (stopped !== undefined) {
        const equivalenceKey = stopped.projection === undefined
          ? null
          : applicabilityEquivalenceKey(stopped.projection);
        const equivalentApplicabilities = equivalenceKey === null
          ? []
          : stoppedAttempts.flatMap(({ projection, authorityState }) => (
              projection !== undefined
                && authorityState === "decision-required"
                && applicabilityEquivalenceKey(projection) === equivalenceKey
                ? [projection]
                : []
            ));
        return {
          discharged: false,
          detail: `Hosted source \`${sourceId}\` has an unresolved contribution-applicability decision.`,
          nextSource: null,
          ...(stopped.projection === undefined ? {} : { applicability: stopped.projection }),
          ...(equivalentApplicabilities.length < 2 ? {} : { equivalentApplicabilities }),
          ...(stopped.authorityState === undefined
            ? {}
            : { applicabilityAuthority: stopped.authorityState }),
        };
      }
      if (standardAttempts.some(({ applicability }) => applicability === "request-review")) {
        const retainedFindings = await retainedFindingsBeforeRequest();
        if (retainedFindings !== null) return retainedFindings;
        return {
          discharged: false,
          detail: `Hosted source \`${sourceId}\` requires a new review by Owner selection.`,
          nextSource: sourceId,
          ...requestContext(),
          ...await correctionContext(),
        };
      }
      const applicable = standardAttempts.filter(({ applicability, logicalPass }) =>
        applicability === "retain-prior-attempt" && logicalPass === orderedLogicalPass);
      const cleanApplicable = applicable.find(({ outcome }) => outcome === "clean");
      if (cleanApplicable !== undefined) {
        const policy = await input.resolveEarlierTerminalPolicy(cleanApplicable);
        if (policy.state !== "pass-complete") {
          return retainedTerminalPolicyStop(policy);
        }
        return dischargeAfterRetained(`${sourceId === "delegated-agent" ? "Standard" : "Hosted"} source `
          + `\`${sourceId}\` through contribution applicability.`);
      }
      const settledApplicable = applicable.find(({ outcome }) => outcome === "settled-findings");
      if (settledApplicable !== undefined) {
        const policy = await input.resolveEarlierTerminalPolicy(settledApplicable);
        if (policy.state === "pass-complete") {
          return dischargeAfterRetained(`${sourceId === "delegated-agent" ? "Standard" : "Hosted"} source `
            + `\`${sourceId}\` through contribution applicability with no verified material findings.`);
        }
        if (policy.state !== "findings") return retainedTerminalPolicyStop(policy);
      }
      const orderedApplicable = selected.filter(({ applicability, logicalPass }) => (
        applicability === "retain-prior-attempt" && logicalPass === orderedLogicalPass
      ));
      const earlierSafelyUnavailable = retainedSafeUnavailableAttempt(
        sourceId,
        orderedApplicable,
      );
      if (earlierSafelyUnavailable !== null) {
        const earlierCoverage = oneRequestedCoverage(orderedApplicable.map(({ requestedCoverage }) => (
          requestedCoverage
        )));
        if (earlierCoverage === "conflict"
          || (orderedLogicalPass === activeLogicalPass
            && requestCoverage !== null
            && earlierCoverage !== null
            && requestCoverage !== earlierCoverage)) {
          return {
            discharged: false,
            detail: "The active review pass contains conflicting requested coverage.",
            nextSource: null,
          };
        }
        if (orderedLogicalPass === activeLogicalPass) {
          requestCoverage ??= earlierCoverage;
          requestAttempts.push(earlierSafelyUnavailable);
        }
        continue;
      }
    }
    const retainedFindings = await retainedFindingsBeforeRequest();
    if (retainedFindings !== null) return retainedFindings;
    return {
      discharged: false,
      detail: `The reserved standard-review source order beginning at \`${reservation.sources[0]}\` has not produced `
        + "a settled review across the Candidate span.",
      nextSource: sourceId,
      ...requestContext(),
      ...await correctionContext(),
    };
  }
  return {
    discharged: false,
    detail: `The reserved standard-review source order beginning at \`${reservation.sources[0]}\` has not produced `
      + "a settled review across the Candidate span.",
    nextSource: null,
  };
}

/** Require the retained producer to cover the same standard-review policy as this reservation. */
export function predecessorMatchesHostedReservationPolicy(
  predecessor: Exclude<ReviewResult, { kind: "frontline" }>,
  reservation: StandardReviewReservationV1,
): boolean {
  const predecessorPolicy = {
    obligation: predecessor.requirement.obligation,
    reasons: [...predecessor.requirement.reasons].sort(),
    rubricVersion: predecessor.requirement.rubricVersion, rubricDigest: predecessor.requirement.rubricDigest,
    retrigger: predecessor.requirement.retrigger, count: predecessor.requirement.count,
  };
  return canonicalize(predecessorPolicy) === canonicalize({
    ...reservation.obligation, reasons: [...reservation.obligation.reasons].sort(),
  });
}

/**
 * Bind the repository's durable lane progress and Candidate span to the discharge projection.
 *
 * @param input - The repository root and its Git boundary.
 * @returns A reader resolving discharge and fresh incremental applicability for one Candidate target.
 */
export function createHostedReservationDischargeReader(input: {
  cwd: string;
  exec: GitExec;
  delivery?: DeliveryDischargeTargetLookup;
  host?: Pick<DeliveryHostPort, "readRequest">;
}): HostedReservationDischargeReader {
  const publisher = new RepositoryGitCommonStatePublisher(input.exec, input.cwd);
  const store = new LocalReviewOperationStateStore(publisher);
  const dispositions = new LocalApprovedDispositionRecordStore(publisher);
  const resultReader = createRepositoryReviewResultReader(publisher);
  let maxPassesPromise: Promise<number> | null = null;
  const maxPasses = () => {
    maxPassesPromise ??= readConfigSettings(input.cwd).then(({ settings }) => (
      Number(settings["review.standard_max_passes"])
    ));
    return maxPassesPromise;
  };
  let repositoryIdPromise: Promise<string> | null = null;
  const repositoryId = () => {
    repositoryIdPromise ??= resolveRepositoryIdentity(publisher);
    return repositoryIdPromise;
  };
  const rawExec = createRawGitExec(input.cwd);

  const createApplicabilityContext = async ({
    baseRevision,
    approvedHead,
    changeRequest,
    vehicle,
    candidate,
  }: Omit<HostedReservationDischargeReaderArgs, "workUnitId" | "reservation">) => {
    const currentRepositoryId = await repositoryId();
    const lineage = vehicle !== undefined
      ? {
          kind: "delivery-member" as const,
          planId: vehicle.planId,
          deliverableId: vehicle.deliverableId,
          workUnitId: vehicle.workUnitId,
        }
      : candidate === undefined
        ? undefined
        : { kind: "candidate" as const, candidateId: candidate.attestation.candidateId };
    const snapshot = candidate === undefined || changeRequest === null
      ? null
      : store.readOperationSnapshot();
    const observeEndpoints = async (): Promise<{ readonly head: string; readonly base: string }> => {
      if (changeRequest === null || input.host === undefined) {
        throw new Error("Fresh hosted-review endpoints are unavailable.");
      }
      if (vehicle !== undefined) {
        if (input.delivery === undefined) {
          throw new Error("Fresh delivery-member endpoints are unavailable.");
        }
        const resolved = await input.delivery.resolveDischargeTargets(vehicle.workUnitId);
        const matching = resolved.status !== "resolved"
          ? []
          : resolved.targets.filter((target) => (
              target.planId === vehicle.planId
              && target.deliverableId === vehicle.deliverableId
              && target.workUnitId === vehicle.workUnitId
              && target.changeRequestId === String(changeRequest.pullRequest)
            ));
        const current = matching.length === 1 ? matching[0] : undefined;
        if (current === undefined) throw new Error("Fresh delivery-member endpoints are ambiguous.");
        const observed = await input.host.readRequest(changeRequest.repository, {
          providerId: current.providerId,
          changeRequestId: current.changeRequestId,
        });
        if (observed.status !== "observed"
          || observed.request.repository.toLowerCase() !== changeRequest.repository.toLowerCase()) {
          throw new Error("Fresh delivery-member request coordinates are unavailable.");
        }
        return { head: observed.request.headSha, base: current.base };
      }
      const observed = await input.host.readRequest(changeRequest.repository, {
        providerId: "github",
        changeRequestId: String(changeRequest.pullRequest),
      });
      if (observed.status !== "observed"
        || observed.request.repository.toLowerCase() !== changeRequest.repository.toLowerCase()) {
        throw new Error("Fresh hosted-review request coordinates are unavailable.");
      }
      const { stdout: observedBase } = await input.exec(
        "git",
        ["merge-base", observed.request.headSha, observed.request.baseRef],
        { cwd: input.cwd, objectAccess: "local-only" },
      );
      return { head: observed.request.headSha, base: observedBase.trim() };
    };
    const readEarlierAttemptApplicability = snapshot === null
      || changeRequest === null
      || candidate === undefined
      || lineage === undefined
      ? undefined
      : async (sourceId: string): Promise<EarlierHostedAttemptApplicabilityRead> => (
          projectEarlierReviewApplicability({
            query: {
              schemaVersion: 1,
              repositoryId: currentRepositoryId,
              repository: changeRequest.repository,
              pullRequest: changeRequest.pullRequest,
              currentHead: approvedHead,
              currentBase: baseRevision,
              lane: "standard",
              sourceId,
              lineage,
              ...(vehicle === undefined ? {} : { currentVehicle: vehicle }),
            },
            currentBase: baseRevision,
            snapshot: await snapshot,
            candidate,
            exec: rawExec,
            observeEndpoints,
            readDispositionRecord: (attemptId) => dispositions.readDispositionRecord(attemptId),
          })
        );
    return { currentRepositoryId, lineage, readEarlierAttemptApplicability };
  };

  const readTarget = async ({
    reservation,
    baseRevision,
    approvedHead,
    changeRequest,
    vehicle,
    candidate,
  }: Omit<HostedReservationDischargeReaderArgs, "workUnitId">): Promise<HostedReservationDischarge> => {
    if (reservation === null) {
      const unreachableTerminalPolicy = (): Promise<ReviewResolveEnvelope> => Promise.reject(
        new Error("A reservation-free discharge has no terminal review policy."),
      );
      return projectHostedReservationDischarge({
        reservation,
        span: [],
        target: null,
        readLaneProgress: () => Promise.resolve({ status: "unrecorded" }),
        resolveTerminalPolicy: unreachableTerminalPolicy,
        resolveEarlierTerminalPolicy: unreachableTerminalPolicy,
      });
    }
    let stdout: string;
    try {
      ({ stdout } = await input.exec("git", ["rev-list", `${baseRevision}..${approvedHead}`], {
        cwd: input.cwd,
        objectAccess: "local-only",
      }));
    } catch {
      return {
        discharged: false,
        detail: "The reserved hosted-review target span is unavailable.",
        nextSource: null,
      };
    }
    const span = [baseRevision, ...stdout.trim().split("\n").filter((line) => line !== "")];
    const { currentRepositoryId, lineage, readEarlierAttemptApplicability } =
      await createApplicabilityContext({
        baseRevision,
        approvedHead,
        changeRequest,
        vehicle,
        candidate,
      });
    const confirmIncrementalApplicability = async (
      predecessor: ReviewResult,
      current: ReviewResult,
    ): Promise<IncrementalPredecessorApplicability> => confirmIncrementalPredecessorApplicability({
      predecessor,
      current,
      readEarlierAttemptApplicability,
    });
    const resolveTerminalPolicy = async (terminal: {
      readonly attemptId: string;
      readonly logicalPass: number;
      readonly sourceId: string;
      readonly outcome: "clean" | "settled-findings";
      readonly producerTarget: NonNullable<EarlierApplicableAttempt["producerTarget"]>;
      readonly scopeMode?: "whole-target" | "chunked";
      readonly chunkSeriesComplete?: boolean;
    }): Promise<ReviewResolveEnvelope> => {
      if (changeRequest === null) {
        throw new Error("Terminal review policy requires exact change-request coordinates.");
      }
      const policyTarget = {
        repository: changeRequest.repository,
        pullRequest: changeRequest.pullRequest,
        headSha: terminal.producerTarget.headSha,
      };
      return resolveEvidenceBoundReviewPolicy({
        schemaVersion: 1,
        target: policyTarget,
        lane: "standard",
        standardReview: reservation.obligation,
        completedPasses: terminal.logicalPass,
        attempts: [projectReviewPolicyAttempt({
          attemptId: terminal.attemptId,
          sourceId: terminal.sourceId,
          outcome: terminal.outcome,
          ...(terminal.chunkSeriesComplete === undefined
            ? {}
            : { chunkSeriesComplete: terminal.chunkSeriesComplete }),
        })],
        ...(terminal.scopeMode === undefined
          ? {}
          : { scopeSelection: { mode: terminal.scopeMode, target: policyTarget } }),
      }, {
        sources: reservation.sources,
        maxPasses: await maxPasses(),
        resultReader,
        dispositionStore: dispositions,
        readResponsePerformance: (predecessor) => readLaneResponsePerformance(store, predecessor),
        confirmTarget: () => Promise.resolve(terminal.producerTarget),
        confirmIncrementalApplicability,
      });
    };
    const resolveIncrementalCorrectionScope = async (
      attempt: IncrementalCorrectionScopeCandidate,
      currentHeadSha: string,
    ): Promise<IncrementalReviewScope | null> => {
      if (attempt.producerTarget === undefined) return null;
      const predecessor = await resultReader.readResult(attempt.attemptId).catch(() => null);
      if (predecessor === null
        || predecessor.kind === "frontline"
        || (predecessor.kind === "hosted"
          ? predecessor.sourceIdentity !== attempt.sourceId
          : attempt.sourceId !== "delegated-agent")
        || canonicalize(predecessor.target) !== canonicalize(attempt.producerTarget)) return null;
      if (!predecessorMatchesHostedReservationPolicy(predecessor, reservation)) return null;
      return resolveVerifiedIncrementalCorrectionScope({
        predecessor,
        currentHeadSha,
      }, {
        resultReader,
        readResponseEvidence: (candidate) => readIncrementalPredecessorResponseEvidence(
          candidate,
          dispositions,
          (result) => readLaneResponsePerformance(store, result),
        ),
        confirmApplicability: confirmIncrementalApplicability,
        confirmCurrentApplicability: async (candidate, headSha) => {
          if (await confirmExactCurrentCorrectionPredecessor({
            predecessor: candidate,
            currentHeadSha: headSha,
            approvedHeadSha: approvedHead,
            baseRevision,
            currentRepositoryId,
            currentLineage: lineage,
            ...(vehicle === undefined ? {} : { vehicle }),
            exec: input.exec,
            cwd: input.cwd,
          })) return "applicable";
          const sourceId = candidate.kind === "hosted"
            ? candidate.sourceIdentity
            : candidate.kind === "attested-local"
              ? "delegated-agent"
              : undefined;
          if (sourceId === undefined || readEarlierAttemptApplicability === undefined) return "unavailable";
          return incrementalApplicabilityFromEarlierRead({
            producerId: candidate.producerId,
            producerTarget: candidate.target,
            earlier: await readEarlierAttemptApplicability(sourceId),
          });
        },
      });
    };
    return projectHostedReservationDischarge({
      reservation,
      span,
      target: changeRequest === null
        ? null
        : {
            ...changeRequest, headSha: approvedHead, baseRevision,
            ...(vehicle === undefined ? {} : { vehicle }),
          },
      readLaneProgress: (headSha) => readLaneProgressAcrossLineage(store, {
        lane: "standard",
        repositoryId: currentRepositoryId,
        headSha,
        lineageHeadShas: [],
        ...(lineage === undefined ? {} : { lineage }),
      }),
      bindCurrentAttemptRef: (attemptId) => bindReviewSourceReference({
        kind: "hosted",
        operationId: laneProgressOperationId({
          lane: "standard",
          repositoryId: currentRepositoryId,
          headSha: approvedHead,
          ...(lineage === undefined ? {} : { lineage }),
        }),
        durableRef: attemptId,
      }),
      resolveTerminalPolicy: (attempt) => {
        const producerTarget = attempt.local?.target ?? attempt.hosted?.reviewTarget;
        if (producerTarget === undefined) {
          throw new Error("Terminal review progress has no immutable producer target.");
        }
        return resolveTerminalPolicy({
          attemptId: attempt.attemptId,
          logicalPass: attempt.logicalPass,
          sourceId: attempt.sourceId,
          outcome: terminalPolicyOutcome(attempt.outcome),
          producerTarget,
          ...(attempt.local === undefined
            ? {}
            : { scopeMode: attempt.local.scopeMode }),
          ...(attempt.chunkSeriesComplete === undefined
            ? {}
            : { chunkSeriesComplete: attempt.chunkSeriesComplete }),
        });
      },
      resolveEarlierTerminalPolicy: (attempt) => {
        if (attempt.producerTarget === undefined) {
          throw new Error("Earlier review applicability has no immutable producer target.");
        }
        return resolveTerminalPolicy({
          attemptId: attempt.attemptId,
          logicalPass: attempt.logicalPass,
          sourceId: attempt.sourceId,
          outcome: terminalPolicyOutcome(attempt.outcome),
          producerTarget: attempt.producerTarget,
          scopeMode: attempt.scopeMode,
          ...(attempt.chunkSeriesComplete === undefined
            ? {}
            : { chunkSeriesComplete: attempt.chunkSeriesComplete }),
        });
      },
      resolveIncrementalCorrectionScope,
      ...(readEarlierAttemptApplicability === undefined
        || changeRequest === null
        || candidate === undefined
        || lineage === undefined
        ? {}
        : {
            readEarlierAttemptApplicability,
            requireEarlierApplicabilityEvidence: (sourceId: string) => (
              candidateExpectsEarlierReviewAttempt(candidate, {
                schemaVersion: 1,
                repositoryId: currentRepositoryId,
                repository: changeRequest.repository,
                pullRequest: changeRequest.pullRequest,
                currentHead: approvedHead,
                lane: "standard",
                sourceId,
                lineage,
                ...(vehicle === undefined ? {} : { currentVehicle: vehicle }),
              })
            ),
          }),
    });
  };

  const reader = async ({ workUnitId, ...target }: HostedReservationDischargeReaderArgs) => {
    if (workUnitId === undefined) return readTarget(target);
    if (input.delivery === undefined || input.host === undefined) {
      return {
        discharged: false,
        detail: "The retained delivery-member review targets are unavailable.",
        nextSource: null,
      };
    }
    if (target.reservation === null || target.changeRequest === null) return readTarget(target);
    const resolution = await resolveHostedReservationTargets({
      workUnitId,
      reservation: target.reservation,
      singleton: {
        ...target.changeRequest,
        headSha: target.approvedHead,
        baseRevision: target.baseRevision,
      },
      delivery: input.delivery,
      host: input.host,
    });
    if (resolution.status === "unavailable") {
      return {
        discharged: false,
        detail: "The reserved hosted-review targets are unavailable.",
        nextSource: null,
      };
    }
    const discharges = await Promise.all(resolution.targets.map((resolvedTarget) => readTarget({
      reservation: target.reservation,
      baseRevision: resolvedTarget.baseRevision,
      approvedHead: resolvedTarget.headSha,
      changeRequest: {
        repository: resolvedTarget.repository,
        pullRequest: resolvedTarget.pullRequest,
      },
      ...(resolvedTarget.vehicle === undefined ? {} : { vehicle: resolvedTarget.vehicle }),
      ...(target.candidate === undefined ? {} : { candidate: target.candidate }),
    })));
    if (!allHostedReservationTargetsDischarged(discharges)) {
      const index = discharges.findIndex(({ discharged }) => !discharged);
      const discharge = discharges[index];
      if (discharge === undefined) {
        return {
          discharged: false,
          detail: "The reserved hosted-review target is unavailable.",
          nextSource: null,
        };
      }
      return resolution.kind === "delivery"
        ? { ...discharge, detail: `Delivery member ${index + 1}: ${discharge.detail}` }
        : discharge;
    }
    const details = discharges.map(({ detail }) => detail);
    return resolution.kind === "delivery"
      ? {
          discharged: true,
          detail: `All ${resolution.targets.length} delivery members are discharged (${details.join(" ")})`,
          nextSource: null,
        }
      : details.length === 1
        ? { discharged: true, detail: details[0] ?? "Hosted review discharged.", nextSource: null }
        : {
            discharged: false,
            detail: "The reserved hosted-review target is unavailable.",
            nextSource: null,
          };
  };
  return Object.assign(reader, {
    confirmIncrementalApplicability: async (
      args: HostedReservationDischargeReaderArgs,
      predecessor: ReviewResult,
      current: ReviewResult,
    ) => {
      const target = {
        baseRevision: args.baseRevision,
        approvedHead: args.approvedHead,
        changeRequest: args.changeRequest,
        ...(args.vehicle === undefined ? {} : { vehicle: args.vehicle }),
        ...(args.candidate === undefined ? {} : { candidate: args.candidate }),
      };
      const { readEarlierAttemptApplicability } = await createApplicabilityContext(target);
      return confirmIncrementalPredecessorApplicability({
        predecessor,
        current,
        readEarlierAttemptApplicability,
      });
    },
  });
}
