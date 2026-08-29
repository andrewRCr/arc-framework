/** Discharge evidence for a hosted-review reservation carried across publication. */

import {
  DeliveryReviewMemberVehicleSchema,
  sameDeliveryReviewMemberVehicle,
  type DeliveryReviewMemberVehicle,
} from "../../../lib/delivery/review-vehicle.js";
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

/** Safe source progress retained for the next request's standard-review driver admission. */
export interface HostedReservationRequestAttempt {
  readonly sourceId: string;
  readonly outcome: "rate-limited" | "transient-unavailable";
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
  applicabilityAuthority?: "decision-required" | "blocked";
  responsePlan?: HostedFindingsResponsePlan;
  requestAttempts?: readonly HostedReservationRequestAttempt[];
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
 * Discharge is a settled attempt — `clean` or `settled-findings` — by the first ordered source that
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
      attempt.hosted !== undefined
      && attempt.hosted.target.repository.toLowerCase() === target.repository.toLowerCase()
      && attempt.hosted.target.pullRequest === target.pullRequest
      && attempt.hosted.target.headSha === headSha
      && sameDeliveryReviewMemberVehicle(target.vehicle, attempt.hosted.vehicle)
    )));
  }
  const allAttempts = [...attemptsByHead.values()].flat();
  const currentAttempts = attemptsByHead.get(target.headSha) ?? [];
  const requestAttempts: HostedReservationRequestAttempt[] = [];
  for (const sourceId of reservation.sources) {
    const settledCurrentHead = currentAttempts.some((attempt) => attempt.sourceId === sourceId
      && (attempt.outcome === "clean" || attempt.outcome === "settled-findings"));
    const settledWithoutApplicabilityReader = input.readEarlierAttemptApplicability === undefined
      && allAttempts.some((attempt) => attempt.sourceId === sourceId
        && (attempt.outcome === "clean" || attempt.outcome === "settled-findings"));
    if (settledCurrentHead || settledWithoutApplicabilityReader) {
      return { discharged: true, detail: `Hosted source \`${sourceId}\`.`, nextSource: null };
    }
    const sourceAttempts = currentAttempts.filter((attempt) => attempt.sourceId === sourceId);
    const currentFindings = sourceAttempts.filter((attempt) => attempt.outcome === "findings");
    if (currentFindings.length > 0) {
      const responsePlans = currentFindings.flatMap((attempt) => {
        if (attempt.hosted === undefined
          || attempt.hosted.findings.length === 0
          || input.bindCurrentAttemptRef === undefined) return [];
        return [{
          schemaVersion: 1 as const,
          target: attempt.hosted.reviewTarget,
          source: {
            kind: "hosted" as const,
            attemptRef: input.bindCurrentAttemptRef(attempt.attemptId),
          },
          findings: attempt.hosted.findings.map((finding) => ({
            findingId: finding.findingId,
            severity: finding.severity,
            locus: finding.locus,
            evidenceUrlOrId: finding.url,
          })),
        }];
      });
      return responsePlans.length === 1
        ? {
            discharged: false,
            detail: `Hosted source \`${sourceId}\` has current findings awaiting disposition.`,
            nextSource: null,
            responsePlan: responsePlans[0],
          }
        : {
            discharged: false,
            detail: `Hosted source \`${sourceId}\` has current findings without one exact response plan.`,
            nextSource: null,
          };
    }
    const safelyUnavailable = retainedSafeUnavailableAttempt(sourceId, sourceAttempts);
    if (safelyUnavailable !== null) {
      requestAttempts.push(safelyUnavailable);
      continue;
    }
    if (input.readEarlierAttemptApplicability !== undefined) {
      const earlier = await input.readEarlierAttemptApplicability(sourceId);
      const evidenceRequired = typeof input.requireEarlierApplicabilityEvidence === "function"
        ? input.requireEarlierApplicabilityEvidence(sourceId)
        : input.requireEarlierApplicabilityEvidence === true;
      if (earlier.status === "not-found" && !evidenceRequired) {
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
      const findings = selected.filter(({ outcome }) => outcome === "findings");
      if (findings.length > 0) {
        const responsePlans = findings.flatMap(({ responsePlan }) => responsePlan === undefined ? [] : [responsePlan]);
        return responsePlans.length === 1
          ? {
              discharged: false,
              detail: `Hosted source \`${sourceId}\` has retained findings awaiting disposition.`,
              nextSource: null,
              responsePlan: responsePlans[0],
            }
          : {
              discharged: false,
              detail: `Hosted source \`${sourceId}\` has retained findings without one exact response plan.`,
              nextSource: null,
            };
      }
      const stopped = selected.find(({ applicability }) => applicability === "stop");
      if (stopped !== undefined) {
        return {
          discharged: false,
          detail: `Hosted source \`${sourceId}\` has an unresolved contribution-applicability decision.`,
          nextSource: null,
          ...(stopped.projection === undefined ? {} : { applicability: stopped.projection }),
          ...(stopped.authorityState === undefined
            ? {}
            : { applicabilityAuthority: stopped.authorityState }),
        };
      }
      if (selected.some(({ applicability }) => applicability === "request-review")) {
        return {
          discharged: false,
          detail: `Hosted source \`${sourceId}\` requires a new review by Owner selection.`,
          nextSource: sourceId,
          requestAttempts,
        };
      }
      const applicable = selected.filter(({ applicability }) => applicability === "retain-prior-attempt");
      const settledApplicable = applicable.find(({ outcome }) => (
        outcome === "clean" || outcome === "settled-findings"
      ));
      if (settledApplicable !== undefined) {
        return {
          discharged: true,
          detail: settledApplicable.retentionBasis === "verified-fix-response"
            ? `Hosted source \`${sourceId}\` through its verified changed-target response.`
            : `Hosted source \`${sourceId}\` through contribution applicability.`,
          nextSource: null,
        };
      }
      const earlierSafelyUnavailable = retainedSafeUnavailableAttempt(sourceId, applicable);
      if (earlierSafelyUnavailable !== null) {
        requestAttempts.push(earlierSafelyUnavailable);
        continue;
      }
    }
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
