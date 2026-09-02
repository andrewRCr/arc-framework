/** Discharge evidence for a hosted-review reservation carried across publication. */

import { RepositoryGitCommonStatePublisher } from "../../../lib/git-common-state.js";
import type { GitExec } from "../../../lib/git/index.js";
import type { DeliveryHostPort } from "../../../lib/delivery/host.js";
import type { DeliveryDischargeTargetLookup } from "../core/delivery-member-lookup.js";
import { resolveRepositoryIdentity } from "../hosts/local/git-common-state.js";
import { LocalReviewOperationStateStore } from "../hosts/local/operation-state-store.js";
import { readLaneProgress, type LaneProgressProjection } from "../lane-progress.js";
import type { StandardReviewReservationV1 } from "./integration-boundary-locus.js";

type ProjectedLaneAttempt = Extract<LaneProgressProjection, { status: "recorded" }>["attempts"][number];

/** Whether the reserved hosted review has produced a verdict, with the evidence for that reading. */
export interface HostedReservationDischarge {
  discharged: boolean;
  detail: string;
}

/** Decide the work-unit obligation from its ordered member discharges. */
export function allHostedReservationTargetsDischarged(
  discharges: readonly Pick<HostedReservationDischarge, "discharged">[],
): boolean {
  return discharges.every(({ discharged }) => discharged);
}

/** One exact hosted target and its contribution span base. */
export interface HostedReservationTarget {
  readonly repository: string;
  readonly pullRequest: number;
  readonly headSha: string;
  readonly baseRevision: string;
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
  readonly singleton: HostedReservationTarget;
  readonly delivery: DeliveryDischargeTargetLookup;
  readonly host: Pick<DeliveryHostPort, "readRequest">;
}): Promise<HostedReservationTargetResolution> {
  try {
    const resolved = await input.delivery.resolveDischargeTargets(input.workUnitId);
    if (resolved.status === "unbound") {
      return { status: "resolved", kind: "singleton", targets: [input.singleton] };
    }
    if (resolved.status === "unavailable") return { status: "unavailable", targets: [] };
    if (resolved.targets.length === 0) return { status: "unavailable", targets: [] };
    const targets: HostedReservationTarget[] = [];
    const requestIds = new Set<string>();
    let baseRevision = input.singleton.baseRevision;
    for (const binding of resolved.targets) {
      if (!/^[1-9][0-9]*$/u.test(binding.changeRequestId)) {
        return { status: "unavailable", targets: [] };
      }
      const pullRequest = Number(binding.changeRequestId);
      if (!Number.isSafeInteger(pullRequest)) return { status: "unavailable", targets: [] };
      const requestKey = `${binding.providerId}:${binding.changeRequestId}`;
      if (requestIds.has(requestKey)) return { status: "unavailable", targets: [] };
      requestIds.add(requestKey);
      const observed = await input.host.readRequest(input.singleton.repository, {
        providerId: binding.providerId,
        changeRequestId: binding.changeRequestId,
      });
      if (observed.status !== "observed") return { status: "unavailable", targets: [] };
      const request = observed.request;
      const expectedHeadRef = binding.ref?.replace(/^refs\/heads\//u, "") ?? null;
      if (request.binding.providerId !== binding.providerId
        || request.binding.changeRequestId !== binding.changeRequestId
        || request.repository.toLowerCase() !== input.singleton.repository.toLowerCase()
        || request.headRepository.toLowerCase() !== input.singleton.repository.toLowerCase()
        || request.state === "closed"
        || (expectedHeadRef !== null && request.headRef !== expectedHeadRef)
        || (request.state === "open" && request.headSha !== binding.head)) {
        return { status: "unavailable", targets: [] };
      }
      targets.push({
        repository: input.singleton.repository,
        pullRequest,
        headSha: request.headSha,
        baseRevision,
      });
      baseRevision = request.headSha;
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
  target: { repository: string; pullRequest: number; headSha: string } | null;
  readLaneProgress: (headSha: string) => Promise<LaneProgressProjection>;
}): Promise<HostedReservationDischarge> {
  const { reservation } = input;
  if (reservation === null) {
    return { discharged: true, detail: "Local carrier `local-attestation`." };
  }
  if (input.target === null) {
    return { discharged: false, detail: "The reserved hosted review has no exact open change-request target." };
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
    )));
  }
  const allAttempts = [...attemptsByHead.values()].flat();
  const currentAttempts = attemptsByHead.get(target.headSha) ?? [];
  for (const sourceId of reservation.sources) {
    const settledAcrossSpan = allAttempts.some((attempt) => attempt.sourceId === sourceId
      && (attempt.outcome === "clean" || attempt.outcome === "settled-findings"));
    if (settledAcrossSpan) {
      return { discharged: true, detail: `Hosted source \`${sourceId}\`.` };
    }
    const sourceAttempts = currentAttempts.filter((attempt) => attempt.sourceId === sourceId);
    const safelyUnavailable = sourceAttempts.length > 0 && sourceAttempts.every(({ outcome }) => (
      outcome === "rate-limited" || outcome === "transient-unavailable"
    ));
    if (!safelyUnavailable) break;
  }
  return {
    discharged: false,
    detail: `The reserved standard-review source order beginning at \`${reservation.sources[0]}\` has not produced `
      + "a settled review across the Candidate span.",
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
  delivery: DeliveryDischargeTargetLookup;
  host: Pick<DeliveryHostPort, "readRequest">;
}): (args: {
  workUnitId: string;
  reservation: StandardReviewReservationV1 | null;
  baseRevision: string;
  approvedHead: string;
  changeRequest: { repository: string; pullRequest: number } | null;
}) => Promise<HostedReservationDischarge> {
  const publisher = new RepositoryGitCommonStatePublisher(input.exec, input.cwd);
  const store = new LocalReviewOperationStateStore(publisher);
  let repositoryIdPromise: Promise<string> | null = null;
  const repositoryId = () => {
    repositoryIdPromise ??= resolveRepositoryIdentity(publisher);
    return repositoryIdPromise;
  };

  const readTarget = async (
    reservation: StandardReviewReservationV1,
    target: HostedReservationTarget,
  ): Promise<HostedReservationDischarge> => {
    let stdout: string;
    try {
      ({ stdout } = await input.exec("git", ["rev-list", `${target.baseRevision}..${target.headSha}`], {
        cwd: input.cwd,
        objectAccess: "local-only",
      }));
    } catch {
      return {
        discharged: false,
        detail: "The reserved hosted-review target span is unavailable.",
      };
    }
    const span = [target.baseRevision, ...stdout.trim().split("\n").filter((line) => line !== "")];
    return projectHostedReservationDischarge({
      reservation,
      span,
      target: {
        repository: target.repository,
        pullRequest: target.pullRequest,
        headSha: target.headSha,
      },
      readLaneProgress: async (headSha) => readLaneProgress(store, {
        lane: "standard",
        repositoryId: await repositoryId(),
        headSha,
      }),
    });
  };

  return async ({ workUnitId, reservation, baseRevision, approvedHead, changeRequest }) => {
    if (reservation === null) {
      return projectHostedReservationDischarge({
        reservation,
        span: [],
        target: null,
        readLaneProgress: () => Promise.resolve({ status: "unrecorded" }),
      });
    }
    const singleton = changeRequest === null ? null : {
      ...changeRequest,
      headSha: approvedHead,
      baseRevision,
    };
    if (singleton === null) {
      return {
        discharged: false,
        detail: "The reserved hosted review has no exact open change-request target.",
      };
    }
    const resolution = await resolveHostedReservationTargets({
      workUnitId,
      singleton,
      delivery: input.delivery,
      host: input.host,
    });
    if (resolution.status === "unavailable") {
      return { discharged: false, detail: "The reserved hosted-review targets are unavailable." };
    }
    const discharges: HostedReservationDischarge[] = [];
    for (const target of resolution.targets) {
      discharges.push(await readTarget(reservation, target));
    }
    if (!allHostedReservationTargetsDischarged(discharges)) {
      const index = discharges.findIndex(({ discharged }) => !discharged);
      const discharge = discharges[index];
      if (discharge === undefined) {
        return { discharged: false, detail: "The reserved hosted-review target is unavailable." };
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
        }
      : details.length === 1
        ? { discharged: true, detail: details[0] ?? "Hosted review discharged." }
        : { discharged: false, detail: "The reserved hosted-review target is unavailable." };
  };
}
