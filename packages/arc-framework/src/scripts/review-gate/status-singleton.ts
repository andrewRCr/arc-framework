/** Compose the actionable review status of one published singleton Candidate. */

import { readConfigSettings } from "../../lib/config/status-reader.js";
import type { GitExec } from "../../lib/git/exec.js";
import { RepositoryGitCommonStatePublisher } from "../../lib/git-common-state.js";
import type { CandidateManagedRecordV1 } from "../../lib/work-unit/candidate-attestation.js";
import { LocalReviewOperationStateStore } from "./hosts/local/operation-state-store.js";
import { LocalApprovedDispositionRecordStore } from "./hosts/local/disposition-record-store.js";
import { createRepositoryReviewResultReader } from "./hosts/local/review-result-reader-composition.js";
import { readLaneResponsePerformance } from "./lane-progress.js";
import { resolveConfiguredLanePolicy } from "./policy/lane-policy-config.js";
import {
  resolveEvidenceBoundSingletonHostedReservationPolicy,
} from "./policy/hosted-reservation-admission.js";
import type { HostedReservationDischarge, HostedReservationDischargeReader } from
  "./policy/hosted-reservation-discharge.js";
import type { StandardReviewReservationV1 } from "./policy/integration-boundary-locus.js";
import { composeSingletonReviewObligation, type RoutedReviewObligation } from "./status.js";
import type { ReviewStatusPolicyJudgment } from "./status-judgment.js";

interface PublishedSingletonInput {
  cwd: string;
  exec: GitExec;
  settings: Awaited<ReturnType<typeof readConfigSettings>>["settings"];
  reservation: StandardReviewReservationV1;
  record: CandidateManagedRecordV1;
  recordVersion: string;
  baseRevision: string;
  workUnit: string;
  target: { repository: string; pullRequest: number; headSha: string };
  judgment?: ReviewStatusPolicyJudgment;
  readDischarge: HostedReservationDischargeReader;
}

/**
 * Resolve the carried reservation only after an exact open PR has been bound to the Candidate.
 *
 * @param input - Current Candidate, reservation, exact PR, and repository-backed discharge reader.
 * @returns The status obligation and any fully composed hosted request action.
 */
export async function composePublishedSingletonReview(input: PublishedSingletonInput): Promise<RoutedReviewObligation> {
  const { target, reservation, readDischarge } = input;
  const dischargeInput = {
    reservation,
    baseRevision: input.baseRevision,
    approvedHead: target.headSha,
    changeRequest: { repository: target.repository, pullRequest: target.pullRequest },
    candidate: input.record,
    ...(input.judgment?.sourceId === undefined ? {}
      : { invocation: { mode: "force" as const, sourceId: input.judgment.sourceId } }),
  };
  const discharge = await readDischarge(dischargeInput);
  const applicabilityContext = {
    workUnitId: input.workUnit,
    expectedRecordVersion: input.recordVersion,
    candidateId: input.record.attestation.candidateId,
  };
  const request = !discharge.discharged && discharge.nextSource !== null
    ? await resolveSingletonRequest(input, discharge, dischargeInput)
    : undefined;
  return composeSingletonReviewObligation({
    discharge,
    applicabilityContext,
    ...(request === undefined ? {} : { request }),
  });
}

async function resolveSingletonRequest(
  input: PublishedSingletonInput,
  discharge: HostedReservationDischarge,
  dischargeInput: Parameters<HostedReservationDischargeReader>[0],
): Promise<NonNullable<Parameters<typeof composeSingletonReviewObligation>[0]["request"]>> {
  if (discharge.nextSource === null) throw new Error("The singleton review source is unavailable.");
  const publisher = new RepositoryGitCommonStatePublisher(input.exec, input.cwd);
  const store = new LocalReviewOperationStateStore(publisher);
  const policy = await resolveConfiguredLanePolicy({
    lane: "standard",
    settings: input.settings,
    preferences: {
      readDeveloperSourceIds: () => Promise.resolve([]),
      readProjectSourceIds: () => Promise.resolve([]),
    },
  });
  const invocation = input.judgment?.sourceId === undefined
    ? discharge.invocation : { mode: "force" as const, sourceId: input.judgment.sourceId };
  const admission = await resolveEvidenceBoundSingletonHostedReservationPolicy({
    reservation: input.reservation,
    discharge,
    target: input.target,
    maxPasses: policy.maxPasses,
    coverageSelected: input.judgment?.coverage !== undefined,
    ceilingOverride: input.judgment?.ceilingOverride,
    additionalPassAuthorization: input.judgment?.additionalPassAuthorization,
    ...(invocation === undefined ? {} : { invocation }),
  }, {
    resultReader: createRepositoryReviewResultReader(publisher),
    dispositionStore: new LocalApprovedDispositionRecordStore(publisher),
    readResponsePerformance: (predecessor) => readLaneResponsePerformance(store, predecessor),
    confirmTarget: (attemptedTarget) => Promise.resolve(attemptedTarget),
    confirmIncrementalApplicability: (predecessor, current) => (
      input.readDischarge.confirmIncrementalApplicability(dischargeInput, predecessor, current)
    ),
  });
  const sourceId = admission.state === "ready" ? admission.payload.sourceId : discharge.nextSource;
  return {
    target: input.target,
    admission,
    sourceId,
    coverage: input.judgment?.coverage ?? discharge.requestCoverage ?? "complete",
    correctionScope: discharge.correctionScope,
    ceilingOverride: input.judgment?.ceilingOverride,
    additionalPassAuthorization: input.judgment?.additionalPassAuthorization,
    ...(invocation === undefined ? {} : { invocation: { ...invocation, sourceId } }),
  };
}
