/** Discharge evidence for a hosted-review reservation carried across publication. */

import {
  DeliveryReviewMemberVehicleSchema,
  sameDeliveryReviewMemberVehicle,
  type DeliveryReviewMemberVehicle,
} from "../../../lib/delivery/review-vehicle.js";
import { canonicalize } from "../../../lib/canonical/canonical-json.js";
import { RepositoryGitCommonStatePublisher } from "../../../lib/git-common-state.js";
import type { GitExec } from "../../../lib/git/index.js";
import { createRawGitExec } from "../../../lib/io-context.js";
import type { CandidateManagedRecordV1 } from "../../../lib/work-unit/candidate-attestation.js";
import type { DeliveryDischargeTargetLookup } from "../core/delivery-member-lookup.js";
import { resolveRepositoryIdentity } from "../hosts/local/git-common-state.js";
import { LocalApprovedDispositionRecordStore } from
  "../hosts/local/disposition-record-store.js";
import { LocalReviewOperationStateStore } from "../hosts/local/operation-state-store.js";
import {
  laneProgressOperationId,
  readLaneProgress,
  type LaneProgressProjection,
} from "../lane-progress.js";
import type { StandardReviewReservationV1 } from "./integration-boundary-locus.js";
import type { EarlierHostedAttemptApplicabilityRead } from "./earlier-review-applicability.js";
import type { ReviewContributionApplicabilityResult } from
  "./review-contribution-applicability.js";
import type { HostedFindingsResponsePlan } from "../core/response-plan-schema.js";
import { bindReviewSourceReference } from "../core/review-source-reference.js";
import {
  candidateExpectsEarlierReviewAttempt,
  projectEarlierReviewApplicability,
} from "./earlier-review-applicability.js";

type ProjectedLaneAttempt = Extract<LaneProgressProjection, { status: "recorded" }>["attempts"][number];

function lastMatchingIndex<T>(values: readonly T[], predicate: (value: T) => boolean): number {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const value = values[index];
    if (value !== undefined && predicate(value)) return index;
  }
  return -1;
}

function isCompleteStandardVerdict(attempt: ProjectedLaneAttempt): boolean {
  return attempt.local !== undefined || attempt.hosted?.effectiveCoverage === "complete";
}

function isCompleteStandardRequest(attempt: ProjectedLaneAttempt): boolean {
  return attempt.local !== undefined || attempt.hosted?.requestedCoverage === "complete";
}

function attemptMatchesTarget(
  attempt: ProjectedLaneAttempt,
  stateHead: string,
  target: NonNullable<Parameters<typeof projectHostedReservationDischarge>[0]["target"]>,
): boolean {
  const hosted = attempt.hosted;
  if (hosted !== undefined) {
    return hosted.target.repository.toLowerCase() === target.repository.toLowerCase()
      && hosted.target.pullRequest === target.pullRequest
      && hosted.target.headSha === stateHead
      && sameDeliveryReviewMemberVehicle(target.vehicle, hosted.vehicle);
  }
  const local = attempt.local;
  if (local === undefined || local.target.headSha !== stateHead) return false;
  if (target.vehicle === undefined) return local.vehicle.kind === "work-unit";
  const admission = local.deliveryAdmission;
  return admission !== undefined
    && local.vehicle.kind === "delivery-member"
    && local.target.kind === "delivery-member"
    && sameDeliveryReviewMemberVehicle(target.vehicle, admission.vehicle)
    && admission.target.repository.toLowerCase() === target.repository.toLowerCase()
    && admission.target.pullRequest === target.pullRequest
    && admission.target.headSha === stateHead;
}

/** Safe source progress retained for the next request's standard-review driver admission. */
export interface HostedReservationRequestAttempt {
  readonly sourceId: string;
  readonly outcome: "rate-limited" | "transient-unavailable";
}

interface PendingFindingRoute {
  readonly sourceId: string;
  readonly responsePlan?: HostedFindingsResponsePlan;
  readonly localResumeAction?: { readonly schemaVersion: 1; readonly operationId: string };
}

function projectPendingFindings(
  attempts: readonly PendingFindingRoute[],
  timing: "current" | "retained",
): HostedReservationDischarge | null {
  if (attempts.length === 0) return null;
  const exact = attempts.length === 1 ? attempts[0] : undefined;
  if (exact?.responsePlan !== undefined && exact.localResumeAction === undefined) {
    return {
      discharged: false,
      detail: `Hosted source \`${exact.sourceId}\` has ${timing} findings awaiting disposition.`,
      nextSource: null,
      responsePlan: exact.responsePlan,
    };
  }
  if (exact?.localResumeAction !== undefined && exact.responsePlan === undefined) {
    return {
      discharged: false,
      detail: `Standard source \`${exact.sourceId}\` has ${timing === "retained" ? "retained " : ""}`
        + "local findings awaiting disposition.",
      nextSource: null,
      localResumeAction: exact.localResumeAction,
    };
  }
  return {
    discharged: false,
    detail: `The reserved standard-review sources have ${timing} findings without one exact response route.`,
    nextSource: null,
  };
}

function retainedSafeUnavailableAttempt(
  sourceId: string,
  attempts: readonly { readonly outcome: string }[],
): HostedReservationRequestAttempt | null {
  if (attempts.length === 0 || attempts.some(({ outcome }) => (
    outcome !== "rate-limited" && outcome !== "transient-unavailable"
  ))) return null;
  const outcome = attempts.at(-1)?.outcome;
  return outcome === "rate-limited" || outcome === "transient-unavailable"
    ? { sourceId, outcome }
    : null;
}

/** Whether the reserved hosted review has produced a verdict, with the evidence for that reading. */
export interface HostedReservationDischarge {
  discharged: boolean;
  detail: string;
  nextSource: string | null;
  applicability?: ReviewContributionApplicabilityResult;
  equivalentApplicabilities?: readonly ReviewContributionApplicabilityResult[];
  applicabilityAuthority?: "decision-required" | "blocked";
  responsePlan?: HostedFindingsResponsePlan;
  localResumeAction?: { readonly schemaVersion: 1; readonly operationId: string };
  requestAttempts?: readonly HostedReservationRequestAttempt[];
}

function applicabilityEquivalenceKey(
  projection: ReviewContributionApplicabilityResult,
): string | null {
  if (projection.state !== "decision-required") return null;
  const selector = projection.selector;
  const currentVehicle = selector.currentVehicle;
  return canonicalize({
    member: currentVehicle === undefined
      ? { repository: selector.repository, pullRequest: selector.pullRequest }
      : {
          planId: currentVehicle.planId,
          deliverableId: currentVehicle.deliverableId,
          workUnitId: currentVehicle.workUnitId,
        },
    sourceId: selector.sourceId,
    currentHead: selector.currentHead,
    residual: {
      verdict: projection.verdict,
      paths: projection.paths,
      before: {
        predecessorTree: projection.projection.before.predecessor.tree,
        memberTree: projection.projection.before.member.tree,
      },
      after: {
        predecessorTree: projection.projection.after.predecessor.tree,
        memberTree: projection.projection.after.member.tree,
      },
    },
  });
}

/** Decide the work-unit obligation from its ordered member discharges. */
export function allHostedReservationTargetsDischarged(
  discharges: readonly { readonly discharged: boolean }[],
): boolean {
  return discharges.every(({ discharged }) => discharged);
}

/** One exact hosted target and its contribution span base. */
export interface HostedReservationTarget {
  readonly repository: string;
  readonly pullRequest: number;
  readonly headSha: string;
  readonly baseRevision: string;
  readonly position?: number;
  readonly memberCount?: number;
  readonly chunkKey?: string;
  readonly title?: string;
  readonly vehicle?: DeliveryReviewMemberVehicle;
}

/** Contained target derivation for singleton and delivery review obligations. */
export type HostedReservationTargetResolution =
  | {
    readonly status: "resolved";
    readonly kind: "singleton" | "delivery";
    readonly targets: readonly HostedReservationTarget[];
  }
  | { readonly status: "unavailable"; readonly targets: readonly [] };

/** Derive the current hosted-review targets without persisting a target list. */
export async function resolveHostedReservationTargets(input: {
  readonly workUnitId: string;
  readonly reservation: StandardReviewReservationV1 | null;
  readonly singleton: HostedReservationTarget;
  readonly delivery: DeliveryDischargeTargetLookup;
}): Promise<HostedReservationTargetResolution> {
  try {
    const marker = input.reservation?.target;
    if (marker !== undefined
      && marker.repository.toLowerCase() !== input.singleton.repository.toLowerCase()) {
      return { status: "unavailable", targets: [] };
    }
    if (marker?.kind === "pinned-head") {
      return { status: "resolved", kind: "singleton", targets: [input.singleton] };
    }
    if (marker?.kind === "delivery" && marker.workUnitId !== input.workUnitId) {
      return { status: "unavailable", targets: [] };
    }
    const resolved = await input.delivery.resolveDischargeTargets(input.workUnitId);
    if (resolved.status === "unbound" && marker === undefined) {
      return { status: "resolved", kind: "singleton", targets: [input.singleton] };
    }
    if (resolved.status !== "resolved" || resolved.targets.length === 0) {
      return { status: "unavailable", targets: [] };
    }
    const targets: HostedReservationTarget[] = [];
    for (const binding of resolved.targets) {
      if (marker?.kind === "delivery"
        && (binding.planId !== marker.planId || binding.workUnitId !== marker.workUnitId)) {
        return { status: "unavailable", targets: [] };
      }
      if (!/^[1-9][0-9]*$/u.test(binding.changeRequestId)) {
        return { status: "unavailable", targets: [] };
      }
      const pullRequest = Number(binding.changeRequestId);
      if (!Number.isSafeInteger(pullRequest)) return { status: "unavailable", targets: [] };
      targets.push({
        repository: input.singleton.repository,
        pullRequest,
        headSha: binding.head,
        baseRevision: binding.base,
        position: binding.position,
        memberCount: binding.memberCount,
        chunkKey: binding.chunkKey,
        title: binding.title,
        vehicle: DeliveryReviewMemberVehicleSchema.parse({
          kind: "delivery-member",
          planId: binding.planId,
          deliverableId: binding.deliverableId,
          workUnitId: binding.workUnitId,
          head: binding.head,
        }),
      });
    }
    return { status: "resolved", kind: "delivery", targets };
  } catch {
    return { status: "unavailable", targets: [] };
  }
}

/**
 * Decide whether a carried hosted-review reservation has been discharged.
 *
 * Discharge is a complete `clean` attempt by the first ordered source that
 * was not safely unavailable on the standard lane anywhere in the Candidate span. It is read rather than written because a discharge
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
    vehicle?: DeliveryReviewMemberVehicle;
  } | null;
  readLaneProgress: (headSha: string) => Promise<LaneProgressProjection>;
  readEarlierAttemptApplicability?: (
    sourceId: string,
  ) => Promise<EarlierHostedAttemptApplicabilityRead>;
  requireEarlierApplicabilityEvidence?: boolean | ((sourceId: string) => boolean);
  bindCurrentAttemptRef?: (attemptId: string) => string;
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
  for (const headSha of input.span) {
    const progress = await input.readLaneProgress(headSha);
    if (progress.status !== "recorded") continue;
    attemptsByHead.set(headSha, progress.attempts.filter((attempt) => (
      attemptMatchesTarget(attempt, headSha, target)
    )));
  }
  const allAttempts = [...attemptsByHead.values()].flat();
  const currentAttemptHistory = attemptsByHead.get(target.headSha) ?? [];
  const latestSettledIndex = lastMatchingIndex(currentAttemptHistory, (attempt) => (
    attempt.outcome === "settled-findings" && isCompleteStandardVerdict(attempt)
  ));
  const currentAttempts = latestSettledIndex < 0
    ? currentAttemptHistory
    : currentAttemptHistory.slice(latestSettledIndex + 1);
  const requestAttempts: HostedReservationRequestAttempt[] = [];
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
          || attempt.hosted.findings.length === 0
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
            findings: attempt.hosted.findings.map((finding) => ({
              findingId: finding.findingId,
              severity: finding.severity,
              locus: finding.locus,
              evidenceUrlOrId: finding.url,
            })),
          },
        };
      })
  ));
  const currentFindings = projectPendingFindings(currentFindingRoutes, "current");
  if (currentFindings !== null) return currentFindings;

  const earlierBySource = new Map<string, EarlierHostedAttemptApplicabilityRead>();
  const readEarlier = async (sourceId: string): Promise<EarlierHostedAttemptApplicabilityRead | null> => {
    if (input.readEarlierAttemptApplicability === undefined) return null;
    const cached = earlierBySource.get(sourceId);
    if (cached !== undefined) return cached;
    const read = await input.readEarlierAttemptApplicability(sourceId);
    earlierBySource.set(sourceId, read);
    return read;
  };
  let activeEarlierBySource: Map<string, EarlierHostedAttemptApplicabilityRead> | null = null;
  const earlierTimeline = { settledPass: false };
  const readActiveEarlier = async (sourceId: string): Promise<EarlierHostedAttemptApplicabilityRead | null> => {
    if (input.readEarlierAttemptApplicability === undefined) return null;
    if (activeEarlierBySource === null) {
      await Promise.all(reservation.sources.map((reservedSourceId) => readEarlier(reservedSourceId)));
      const ordered = [...earlierBySource.values()].flatMap((read) => read.status === "complete"
        ? read.attempts
        : []);
      ordered.sort((left, right) => left.updatedAt.localeCompare(right.updatedAt)
        || left.operationId.localeCompare(right.operationId)
        || left.attemptId.localeCompare(right.attemptId));
      const settledIndex = lastMatchingIndex(ordered, ({
        outcome, applicability, requestedCoverage, effectiveCoverage,
      }) => (
        outcome === "settled-findings"
        && applicability === "retain-prior-attempt"
        && (requestedCoverage === "complete" || effectiveCoverage === "complete")
      ));
      earlierTimeline.settledPass = settledIndex >= 0;
      const activeKeys = new Set(ordered.slice(settledIndex + 1).map((attempt) => (
        `${attempt.operationId}\0${attempt.attemptId}`
      )));
      activeEarlierBySource = new Map([...earlierBySource].map(([reservedSourceId, read]) => [
        reservedSourceId,
        read.status !== "complete"
          ? read
          : {
              ...read,
              attempts: read.attempts.filter((attempt) => activeKeys.has(
                `${attempt.operationId}\0${attempt.attemptId}`,
              )),
            },
      ]));
    }
    return activeEarlierBySource.get(sourceId) ?? null;
  };
  const retainedFindingsBeforeRequest = async (): Promise<HostedReservationDischarge | null> => {
    if (input.readEarlierAttemptApplicability === undefined) return null;
    await Promise.all(reservation.sources.map((sourceId) => readActiveEarlier(sourceId)));
    const routes: PendingFindingRoute[] = [];
    for (const sourceId of reservation.sources) {
      const earlier = activeEarlierBySource?.get(sourceId);
      const evidenceRequired = typeof input.requireEarlierApplicabilityEvidence === "function"
        ? input.requireEarlierApplicabilityEvidence(sourceId)
        : input.requireEarlierApplicabilityEvidence === true;
      if (earlier === undefined || earlier.status === "unavailable") {
        return {
          discharged: false,
          detail: earlier?.status === "unavailable"
            ? earlier.detail
            : "Earlier review applicability evidence is incomplete.",
          nextSource: null,
        };
      }
      if ((earlier.status === "not-found" && evidenceRequired && !earlierTimeline.settledPass)
        || (earlier.status === "complete" && earlier.attempts.length === 0 && !earlierTimeline.settledPass)) {
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
  for (const sourceId of reservation.sources) {
    const settledCurrentHead = currentAttempts.some((attempt) => attempt.sourceId === sourceId
      && isCompleteStandardVerdict(attempt)
      && attempt.outcome === "clean");
    const settledWithoutApplicabilityReader = input.readEarlierAttemptApplicability === undefined
      && allAttempts.some((attempt) => attempt.sourceId === sourceId
        && isCompleteStandardVerdict(attempt)
        && attempt.outcome === "clean");
    if (settledCurrentHead || settledWithoutApplicabilityReader) {
      return {
        discharged: true,
        detail: `${sourceId === "delegated-agent" ? "Standard" : "Hosted"} source \`${sourceId}\`.`,
        nextSource: null,
      };
    }
    const sourceAttempts = currentAttempts.filter((attempt) => attempt.sourceId === sourceId);
    const safelyUnavailable = retainedSafeUnavailableAttempt(
      sourceId,
      sourceAttempts.filter(isCompleteStandardRequest),
    );
    if (safelyUnavailable !== null) {
      requestAttempts.push(safelyUnavailable);
      continue;
    }
    if (input.readEarlierAttemptApplicability !== undefined) {
      const earlier = await readActiveEarlier(sourceId);
      if (earlier === null) throw new Error("earlier applicability reader disappeared");
      const evidenceRequired = typeof input.requireEarlierApplicabilityEvidence === "function"
        ? input.requireEarlierApplicabilityEvidence(sourceId)
        : input.requireEarlierApplicabilityEvidence === true;
      if ((earlier.status === "not-found" && !evidenceRequired)
        || (earlier.status === "complete" && earlier.attempts.length === 0 && earlierTimeline.settledPass)) {
        const retainedFindings = await retainedFindingsBeforeRequest();
        if (retainedFindings !== null) return retainedFindings;
        return {
          discharged: false,
          detail: `The reserved standard-review source order beginning at \`${reservation.sources[0]}\` has not produced `
            + "a settled review across the Candidate span.",
          nextSource: sourceId,
          requestAttempts,
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
      const standardAttempts = selected.filter(({ requestedCoverage, effectiveCoverage }) => (
        requestedCoverage === "complete" || effectiveCoverage === "complete"
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
          requestAttempts,
        };
      }
      const applicable = standardAttempts.filter(({ applicability }) => applicability === "retain-prior-attempt");
      const cleanApplicable = applicable.find(({ outcome, effectiveCoverage }) => effectiveCoverage === "complete"
        && outcome === "clean");
      if (cleanApplicable !== undefined) {
        return {
          discharged: true,
          detail: `${sourceId === "delegated-agent" ? "Standard" : "Hosted"} source \`${sourceId}\` through `
            + "contribution applicability.",
          nextSource: null,
        };
      }
      const earlierSafelyUnavailable = retainedSafeUnavailableAttempt(
        sourceId,
        applicable.filter(({ requestedCoverage }) => requestedCoverage === "complete"),
      );
      if (earlierSafelyUnavailable !== null) {
        requestAttempts.push(earlierSafelyUnavailable);
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
      requestAttempts,
    };
  }
  return {
    discharged: false,
    detail: `The reserved standard-review source order beginning at \`${reservation.sources[0]}\` has not produced `
      + "a settled review across the Candidate span.",
    nextSource: null,
  };
}

/**
 * Bind the repository's durable lane progress and Candidate span to the discharge projection.
 *
 * @param input - The repository root and its Git boundary.
 * @returns A reader resolving discharge for one reservation over one Candidate span.
 */
export function createHostedReservationDischargeReader(input: {
  cwd: string;
  exec: GitExec;
}): (args: {
  reservation: StandardReviewReservationV1 | null;
  baseRevision: string;
  approvedHead: string;
  changeRequest: { repository: string; pullRequest: number } | null;
  vehicle?: DeliveryReviewMemberVehicle;
  candidate?: CandidateManagedRecordV1;
}) => Promise<HostedReservationDischarge> {
  const publisher = new RepositoryGitCommonStatePublisher(input.exec, input.cwd);
  const store = new LocalReviewOperationStateStore(publisher);
  const dispositions = new LocalApprovedDispositionRecordStore(publisher);
  let repositoryIdPromise: Promise<string> | null = null;
  const repositoryId = () => {
    repositoryIdPromise ??= resolveRepositoryIdentity(publisher);
    return repositoryIdPromise;
  };
  const rawExec = createRawGitExec(input.cwd);

  return async ({ reservation, baseRevision, approvedHead, changeRequest, vehicle, candidate }) => {
    if (reservation === null) {
      return projectHostedReservationDischarge({
        reservation,
        span: [],
        target: null,
        readLaneProgress: () => Promise.resolve({ status: "unrecorded" }),
      });
    }
    const { stdout } = await input.exec("git", ["rev-list", `${baseRevision}..${approvedHead}`], {
      cwd: input.cwd,
      objectAccess: "local-only",
    });
    const span = [baseRevision, ...stdout.trim().split("\n").filter((line) => line !== "")];
    const currentRepositoryId = await repositoryId();
    const snapshot = candidate === undefined || changeRequest === null
      ? null
      : store.readOperationSnapshot();
    return projectHostedReservationDischarge({
      reservation,
      span,
      target: changeRequest === null
        ? null
        : { ...changeRequest, headSha: approvedHead, ...(vehicle === undefined ? {} : { vehicle }) },
      readLaneProgress: async (headSha) => readLaneProgress(store, {
        lane: "standard",
        repositoryId: currentRepositoryId,
        headSha,
      }),
      bindCurrentAttemptRef: (attemptId) => bindReviewSourceReference({
        kind: "hosted",
        operationId: laneProgressOperationId({
          lane: "standard",
          repositoryId: currentRepositoryId,
          headSha: approvedHead,
        }),
        durableRef: attemptId,
      }),
      ...(snapshot === null || changeRequest === null || candidate === undefined
        ? {}
        : {
            readEarlierAttemptApplicability: async (sourceId: string) => projectEarlierReviewApplicability({
              query: {
                schemaVersion: 1,
                repositoryId: currentRepositoryId,
                repository: changeRequest.repository,
                pullRequest: changeRequest.pullRequest,
                currentHead: approvedHead,
                lane: "standard",
                sourceId,
                ...(vehicle === undefined ? {} : { currentVehicle: vehicle }),
              },
              currentBase: baseRevision,
              snapshot: await snapshot,
              candidate,
              exec: rawExec,
              readDispositionRecord: (attemptId) => dispositions.readDispositionRecord(attemptId),
            }),
            requireEarlierApplicabilityEvidence: (sourceId: string) => (
              candidateExpectsEarlierReviewAttempt(candidate, {
                schemaVersion: 1,
                repositoryId: currentRepositoryId,
                repository: changeRequest.repository,
                pullRequest: changeRequest.pullRequest,
                currentHead: approvedHead,
                lane: "standard",
                sourceId,
                ...(vehicle === undefined ? {} : { currentVehicle: vehicle }),
              })
            ),
          }),
    });
  };
}
