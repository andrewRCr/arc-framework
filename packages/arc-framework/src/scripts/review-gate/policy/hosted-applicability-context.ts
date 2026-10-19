/** Fresh hosted applicability reads for one exact Candidate or delivery member. */
import type { LaneSubjectLineage } from "../core/lane-admission.js";
import type { GitExec, RawGitExec } from "../../../lib/git/exec.js";
import type { DeliveryHostPort } from "../../../lib/delivery/host.js";
import { readGitCandidateTargetBase } from "../../../lib/work-unit/git-candidate-effective-target.js";
import type { DeliveryDischargeTargetLookup } from "../core/delivery-member-lookup.js";
import type { LocalReviewOperationStateStore } from "../hosts/local/operation-state-store.js";
import type { LocalApprovedDispositionRecordStore } from "../hosts/local/disposition-record-store.js";
import { projectEarlierReviewApplicability, type EarlierHostedAttemptApplicabilityRead } from "./earlier-review-applicability.js";
import type { HostedReservationDischargeReaderArgs } from "./hosted-reservation-support.js";

interface HostedApplicabilityContextInput {
  readonly cwd: string;
  readonly exec: GitExec;
  readonly rawExec: RawGitExec;
  readonly remote?: string;
  readonly delivery?: DeliveryDischargeTargetLookup;
  readonly host?: Pick<DeliveryHostPort, "readRequest">;
  readonly store: LocalReviewOperationStateStore;
  readonly dispositions: LocalApprovedDispositionRecordStore;
  readonly repositoryId: () => Promise<string>;
  readonly args: Omit<HostedReservationDischargeReaderArgs, "workUnitId" | "reservation">;
}

/** Observe exact request endpoints and retain the repository's existing earlier-attempt authority. */
export async function createHostedApplicabilityContext(input: HostedApplicabilityContextInput): Promise<{
  readonly currentRepositoryId: string;
  readonly lineage: LaneSubjectLineage | undefined;
  readonly readEarlierAttemptApplicability: ((sourceId: string) => Promise<EarlierHostedAttemptApplicabilityRead>) | undefined;
}> {
  const { baseRevision, approvedHead, changeRequest, vehicle, candidate } = input.args;
  const { store, dispositions, repositoryId, rawExec } = input;
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
    const observedBase = await readGitCandidateTargetBase({
      cwd: input.cwd,
      revision: observed.request.headSha,
      baseBranch: observed.request.baseRef,
      ...(input.remote === undefined ? {} : { remote: input.remote }),
      exec: input.exec,
    });
    if (observedBase.status !== "resolved") throw new Error(observedBase.detail);
    return { head: observed.request.headSha, base: observedBase.base };
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
}
