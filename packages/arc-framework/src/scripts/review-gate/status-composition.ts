/** Production composition for exact-target review status. */

import { readConfigSettings } from "../../lib/config/status-reader.js";
import { workUnitPathTreatmentContext } from "../../lib/base-drift/current-adapters.js";
import type { DeliveryHostPort } from "../../lib/delivery/host.js";
import {
  BaseMovementObservationSchema,
  type EvidenceOverlapObservation,
} from "../../lib/evidence-applicability/index.js";
import { analyzeRevisionOverlap } from "../../lib/git/base-overlap.js";
import type { GitExec } from "../../lib/git/exec.js";
import { isGitProcessError } from "../../lib/git/process-error.js";
import { isGitObjectId } from "../../lib/git/object-id.js";
import { createRawGitExec } from "../../lib/io-context.js";
import { resolveChangeStats } from "../../lib/change-stats.js";
import { SlugSchema } from "../../lib/kernel/schema/slug.js";
import { readCandidateRecordVersioned } from "../../lib/work-unit/candidate-record-store.js";
import {
  projectGitCandidateEffectiveTarget,
  resolveGitCandidateTargetBase,
} from "../../lib/work-unit/git-candidate-effective-target.js";
import {
  readSubmissionBoundaryVersioned,
} from "../../lib/work-unit/submission-boundary-store.js";
import { RepositoryGitCommonStatePublisher } from "../../lib/git-common-state.js";
import { validateDeliveryPublicReviewContinuation } from
  "../../lib/delivery/public-review-continuation.js";
import { validateDeliveryActiveOperation } from "../../lib/delivery/operation.js";
import {
  projectGitDeliveryTerminalCoordinateAdvance,
  projectGitDeliveryTerminalRecordAdvance,
} from
  "../../lib/delivery/public-review-continuation-git.js";
import { sameDeliveryReviewMemberIdentity } from "../../lib/delivery/review-vehicle.js";
import {
  resolveAcceptableDeliveryBaseRefs,
  type DeliveryDischargeTargetLookup,
  type DeliveryMemberLookup,
  type DeliveryTerminalRecordLookup,
} from "./core/delivery-member-lookup.js";
import { resolveReviewSubject } from "./core/review-subject.js";
import { readErrandRoutedObligation } from "./status-errand.js";
import {
  createHostedReservationDischargeReader,
  resolveHostedReservationTargets,
} from "./policy/hosted-reservation-discharge.js";
import {
  resolveChangeRequest,
  type ChangeRequestCandidate,
  type ChangeRequestTargetRef,
} from "./change-request.js";
import { createGhChangeRequestResolutionPort } from "./hosts/github/change-request.js";
import { GhDeliveryHostPort } from "../delivery/hosts/github.js";
import { aggregateChecks } from "./checks-await.js";
import { createGhRequiredChecksPort } from "./hosts/github/checks-await.js";
import { RepositoryDeliveryMemberLookup } from "./hosts/local/delivery-member-lookup.js";
import { resolveRepositoryIdentity } from "./hosts/local/git-common-state.js";
import { LocalReviewOperationStateStore } from "./hosts/local/operation-state-store.js";
import { hostedGhRunner } from "./hosted/gh-process.js";
import {
  HostedProviderIdSchema,
  type HostedReviewCoverage,
} from "./hosted/request.js";
import { resolveConfiguredLanePolicy } from "./policy/lane-policy-config.js";
import {
  projectHostedReservationPolicyProgress,
  resolveHostedReservationPolicy,
} from "./policy/hosted-reservation-admission.js";
import type { ReviewPolicyCommandRequest } from "./policy/review-policy-driver.js";
import type { DeliveryLocalReviewScopeSelection } from
  "./policy/delivery-local-review-admission.js";
import {
  parseReviewChunkingThresholds,
  resolveReviewChunkingPolicy,
} from "./policy/review-chunking.js";
import {
  bindDeliveryReviewTerminusOffer,
  composeDeliveryReviewObligation,
  composeSingletonReviewObligation,
  isDeliveryReviewMemberDischargedByOwnerTerminus,
  resolveReviewStatus,
  type DeliveryReviewOwnerTerminusAdvance,
  type ReviewStatusObservation,
  type ReviewStatusPort,
  type ReviewStatusResult,
  type ReviewStatusTargetInput,
  type RoutedReviewObligation,
} from "./status.js";

function deliveryHeadRef(ref: string | null): string | null {
  if (ref === null) return null;
  return ref.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : ref;
}

async function resolveDeliveryMemberScopeSelection(input: {
  readonly cwd: string;
  readonly settings: Awaited<ReturnType<typeof readConfigSettings>>["settings"];
  readonly planId: string;
  readonly sourceId?: string;
  readonly target: {
    readonly repository: string;
    readonly pullRequest: number;
    readonly baseRevision: string;
    readonly headSha: string;
  };
}): Promise<DeliveryLocalReviewScopeSelection | undefined> {
  const parsed = parseReviewChunkingThresholds({
    "changeset.advisory_threshold_lines": input.settings["changeset.advisory_threshold_lines"],
    "changeset.advisory_threshold_files": input.settings["changeset.advisory_threshold_files"],
  });
  if (parsed.kind === "invalid") {
    throw new Error(`Invalid review chunking threshold ${parsed.key}: ${parsed.value}`);
  }
  if (parsed.thresholds.lines === 0 && parsed.thresholds.files === 0) return undefined;
  const stats = await resolveChangeStats(
    createRawGitExec(input.cwd),
    input.target.baseRevision,
    input.target.headSha,
  );
  if (stats.kind === "unknown") {
    throw new Error(`Unable to measure exact delivery-member review target: ${stats.reason}`);
  }
  const resolution = resolveReviewChunkingPolicy({
    thresholds: parsed.thresholds,
    metrics: stats.metrics,
    deliveryBinding: {
      status: "bound",
      planId: input.planId,
      targetKind: "delivery-member",
    },
  });
  if (resolution.disposition === "consider-chunks") {
    if (HostedProviderIdSchema.safeParse(input.sourceId).success) return undefined;
    return {
      mode: "chunked",
      target: {
        repository: input.target.repository,
        pullRequest: input.target.pullRequest,
        headSha: input.target.headSha,
      },
    };
  }
  if (resolution.disposition === "below-threshold" || resolution.disposition === "disabled") {
    return undefined;
  }
  throw new Error(`Delivery-member review chunking returned ${resolution.disposition}.`);
}

export async function readBasePosition(input: {
  cwd: string;
  exec: GitExec;
  headSha: string;
  repository: string;
  changeRequest: number;
  subject: Awaited<ReturnType<typeof resolveReviewSubject>>;
  remote?: string;
}): Promise<Pick<
  ReviewStatusObservation,
  "currentBaseOid" | "baseContained" | "baseMovement" | "baseMovementDetail"
>> {
  const { settings } = await readConfigSettings(input.cwd);
  const base = settings["branch.base"];
  const remote = input.remote ?? "origin";
  await input.exec("git", ["fetch", remote, base], { cwd: input.cwd });
  const currentBaseOid = (await input.exec(
    "git",
    ["rev-parse", "--verify", `refs/remotes/${remote}/${base}`],
    { cwd: input.cwd, objectAccess: "local-only" },
  )).stdout.trim();
  if (!isGitObjectId(currentBaseOid)) throw new Error("invalid base object ID");
  const unavailableMovement = (
    reason: Extract<EvidenceOverlapObservation, { status: "unavailable" }>["reason"],
    detail: string,
  ) => ({
    currentBaseOid,
    baseContained: false,
    baseMovement: BaseMovementObservationSchema.parse({
      coordinates: {
        repository: input.repository,
        changeRequest: input.changeRequest,
        base: currentBaseOid,
        head: input.headSha,
      },
      overlap: { status: "unavailable", reason },
    }),
    baseMovementDetail: detail,
  });
  try {
    await ensureCandidateHeadAvailable(input);
  } catch {
    return unavailableMovement(
      "branch-diff-failed",
      `The exact reviewed head ${input.headSha} could not be resolved locally or fetched.`,
    );
  }
  let baseContained: boolean;
  try {
    await input.exec("git", ["merge-base", "--is-ancestor", currentBaseOid, input.headSha], {
      cwd: input.cwd,
      objectAccess: "local-only",
    });
    baseContained = true;
  } catch (error) {
    if (isGitProcessError(error) && error.kind === "nonzero-exit" && error.exitCode === 1) {
      baseContained = false;
    } else {
      return unavailableMovement(
        "merge-base-failed",
        "Containment between the observed base and exact reviewed head could not be established.",
      );
    }
  }
  const overlap = await analyzeRevisionOverlap({
    exec: input.exec,
    leftRevision: input.headSha,
    rightRevision: currentBaseOid,
    treatmentContext: input.subject.status === "resolved"
      ? workUnitPathTreatmentContext(input.subject.workUnitId)
      : {},
  });
  const observedOverlap: EvidenceOverlapObservation = overlap.status === "available"
    ? overlap.overlap
    : overlap.status === "ambiguous" || overlap.status === "unrelated"
      ? { status: overlap.status }
      : {
          status: "unavailable",
          reason: overlap.reason === "merge-base-failed"
            ? "merge-base-failed"
            : overlap.reason === "left-diff-failed"
              ? "branch-diff-failed"
              : overlap.reason === "right-diff-failed"
                ? "base-diff-failed"
                : "classification-failed",
        };
  return {
    currentBaseOid,
    baseContained,
    baseMovement: BaseMovementObservationSchema.parse({
      coordinates: {
        repository: input.repository,
        changeRequest: input.changeRequest,
        base: currentBaseOid,
        head: input.headSha,
      },
      overlap: observedOverlap,
    }),
    ...(overlap.status === "available" ? {} : { baseMovementDetail: overlap.detail }),
  };
}

/**
 * Materialize an exact Candidate head only when the local object database does not already contain it.
 *
 * @param input - Repository, Git boundary, and exact Candidate head required by local projection.
 * @returns After the exact commit is available locally.
 */
export async function ensureCandidateHeadAvailable(input: {
  cwd: string;
  exec: GitExec;
  headSha: string;
  remote?: string;
}): Promise<void> {
  const resolveExactHead = async (): Promise<string> => (
    await input.exec("git", ["rev-parse", "--verify", `${input.headSha}^{commit}`], {
      cwd: input.cwd,
      objectAccess: "local-only",
    })
  ).stdout.trim();

  try {
    const resolved = await resolveExactHead();
    if (resolved !== input.headSha) throw new Error("the local Candidate head resolved to a different commit");
    return;
  } catch (error) {
    if (!isGitProcessError(error) || error.kind !== "nonzero-exit") throw error;
  }

  await input.exec("git", ["fetch", input.remote ?? "origin", input.headSha], { cwd: input.cwd });
  const fetched = await resolveExactHead();
  if (fetched !== input.headSha) throw new Error("the fetched Candidate head resolved to a different commit");
}

/**
 * Reduce the routed review obligation for one exact target from the repository's own evidence.
 *
 * @param cwd - The repository root holding the boundary, Candidate record, and lane progress.
 * @param exec - The Git boundary the Candidate span and durable state are read through.
 * @param target - The exact change-request target the obligation is reported for.
 * @returns The obligation state and the evidence sentence naming what decided it.
 */
export async function readRoutedObligation(
  cwd: string,
  exec: GitExec,
  target: ChangeRequestTargetRef,
  pullRequest: number,
  memberLookup: DeliveryMemberLookup & DeliveryDischargeTargetLookup & DeliveryTerminalRecordLookup
    = new RepositoryDeliveryMemberLookup({ cwd, exec }),
  currentBaseRevision?: string,
  judgment?: {
    readonly ceilingOverride?: ReviewPolicyCommandRequest["ceilingOverride"];
    readonly coverage?: HostedReviewCoverage;
    readonly sourceId?: string;
  },
  host: Pick<DeliveryHostPort, "readRequest"> = new GhDeliveryHostPort(hostedGhRunner),
  options: {
    readonly remote?: string;
    readonly changeRequestCandidate?: Pick<ChangeRequestCandidate, "baseRefName" | "url">;
    readonly preparedNativeLanding?: {
      readonly planId: string;
      readonly operationId: string;
    };
    readonly captureTerminalAdvance?: (
      advance: { readonly stateHead: string; readonly currentHead: string },
    ) => void;
  } = {},
): Promise<RoutedReviewObligation> {
  const errand = await readErrandRoutedObligation({
    cwd,
    exec,
    target,
    pullRequest,
    ...(currentBaseRevision === undefined ? {} : { currentBaseOid: currentBaseRevision }),
    ...(options.remote === undefined ? {} : { remote: options.remote }),
    ...(options.changeRequestCandidate === undefined
      ? {}
      : { changeRequestCandidate: options.changeRequestCandidate }),
  });
  if (errand !== null) return errand;
  const subject = await resolveReviewSubject({
    headRef: target.headRef,
    headSha: target.headSha,
    memberLookup,
  });
  if (subject.status === "unavailable") {
    return { state: "blocked", detail: "The delivery member's owning work unit is unavailable." };
  }
  if (subject.status === "unbound") {
    return { state: "blocked", detail: "The target branch does not identify a work unit." };
  }
  const workUnit = subject.workUnitId;
  try {
    const boundary = (await readSubmissionBoundaryVersioned(cwd, workUnit)).boundary;
    if (boundary === null) {
      return { state: "blocked", detail: "The publication boundary is unavailable." };
    }
    const versionedRecord = await readCandidateRecordVersioned(cwd, workUnit);
    if (versionedRecord.record === null || versionedRecord.version === null) {
      return { state: "blocked", detail: "The managed Candidate record behind the reservation is unavailable." };
    }
    const record = versionedRecord.record;
    const settings = (await readConfigSettings(cwd)).settings;
    const baseBranch = settings["branch.base"];
    const candidateHead = subject.member?.candidateHead ?? target.headSha;
    const correctiveContinuation = "deliveryContinuation" in boundary
      ? boundary.deliveryContinuation
      : undefined;
    let effective: Awaited<ReturnType<typeof projectGitCandidateEffectiveTarget>>;
    let terminalAdvance: { readonly stateHead: string; readonly currentHead: string } | undefined;
    let preparedTerminal: { readonly deliverableId: string; readonly stateHead: string } | undefined;
    if (correctiveContinuation !== undefined) {
      const delivery = await memberLookup.resolveTerminalRecords(workUnit);
      if (delivery.status !== "resolved") {
        return { state: "blocked", detail: "The public delivery continuation is unavailable." };
      }
      const preparedScope = options.preparedNativeLanding;
      let continuationState = delivery.state;
      let continuationStateRevision = delivery.stateRevision;
      let preparedTerminalHead: string | undefined;
      if (preparedScope !== undefined) {
        const active = validateDeliveryActiveOperation({
          revision: delivery.stateRevision,
          value: delivery.state,
        });
        if (delivery.plan.planId !== preparedScope.planId
          || active.status !== "valid"
          || active.operation.operationId !== preparedScope.operationId
          || active.operation.kind !== "land"
          || active.operation.mode !== "native"
          || active.operation.native?.phase !== "prepared"
          || active.operation.effectIdentity !== null) {
          return { state: "blocked", detail: "The prepared native landing review scope is not current." };
        }
        continuationState = { ...active.state, activeOperation: null };
        continuationStateRevision = active.operation.stateRevision;
        const terminal = continuationState.members.at(-1);
        preparedTerminalHead = terminal?.coordinates?.head;
        if (terminal === undefined || preparedTerminalHead === undefined
          || active.operation.affectedDeliverableIds.includes(terminal.deliverableId)) {
          return { state: "blocked", detail: "The prepared native landing has no terminal Candidate coordinate." };
        }
        preparedTerminal = { deliverableId: terminal.deliverableId, stateHead: preparedTerminalHead };
      }
      const historicalTarget = preparedTerminalHead === undefined
        ? undefined
        : {
            revision: preparedTerminalHead,
            currentBase: await resolveGitCandidateTargetBase({
              cwd,
              revision: preparedTerminalHead,
              baseBranch,
              ...(currentBaseRevision === undefined ? {} : { baseRevision: currentBaseRevision }),
              exec,
            }),
          };
      effective = await projectGitCandidateEffectiveTarget({
        cwd,
        name: workUnit,
        baseBranch,
        ...(historicalTarget === undefined && currentBaseRevision !== undefined
          ? { baseRevision: currentBaseRevision }
          : {}),
        record,
        exec,
        rawExec: createRawGitExec(cwd),
        ...(historicalTarget === undefined ? {} : { target: historicalTarget }),
      });
      if (effective.state !== "current") {
        return { state: "blocked", detail: "The owning work-unit Candidate is not current." };
      }
      const terminalCoordinates = continuationState.members.at(-1)?.coordinates ?? undefined;
      const terminalCoordinateAdvance = await projectGitDeliveryTerminalCoordinateAdvance({
        cwd,
        exec,
        candidate: effective,
        workUnitId: workUnit,
        baseBranch,
        ...(terminalCoordinates === undefined ? {} : { terminalCoordinates }),
      });
      if (validateDeliveryPublicReviewContinuation({
          continuation: correctiveContinuation,
          plan: delivery.plan,
          state: continuationState,
          stateRevision: continuationStateRevision,
          ...(terminalCoordinateAdvance === undefined ? {} : { terminalCoordinateAdvance }),
        }).status !== "current") {
        return { state: "blocked", detail: "The public delivery continuation is not current." };
      }
      if (terminalCoordinates !== undefined
        && terminalCoordinateAdvance !== undefined
        && terminalCoordinates.head !== effective.recognizedTarget.revision) {
        terminalAdvance = {
          stateHead: terminalCoordinates.head,
          currentHead: effective.recognizedTarget.revision,
        };
        options.captureTerminalAdvance?.(terminalAdvance);
      }
    } else {
      await ensureCandidateHeadAvailable({
        cwd,
        exec,
        headSha: candidateHead,
        ...(options.remote === undefined ? {} : { remote: options.remote }),
      });
      const targetBase = await resolveGitCandidateTargetBase({
        cwd,
        revision: candidateHead,
        baseBranch,
        baseRevision: currentBaseRevision,
        exec,
      });
      effective = await projectGitCandidateEffectiveTarget({
        cwd,
        name: workUnit,
        baseBranch,
        record,
        exec,
        rawExec: createRawGitExec(cwd),
        target: { revision: candidateHead, currentBase: targetBase },
      });
    }
    if (effective.state !== "current"
      || (correctiveContinuation === undefined && effective.recognizedTarget.revision !== candidateHead)) {
      return { state: "blocked", detail: "The owning work-unit Candidate is not current." };
    }
    const candidateSubjectDigest = effective.recognizedTarget.subject.subjectDigest;
    if (boundary.candidateId !== record.attestation.candidateId
      || boundary.candidateSubjectDigest !== candidateSubjectDigest) {
      return { state: "blocked", detail: "The publication boundary belongs to a different Candidate subject." };
    }
    // A carried reservation is not itself an unsettled obligation — nothing clears it, so reading it
    // that way reports every hosted-first work unit as forever mid-review. What settles it is the
    // reserved source's own verdict on the lane.
    const { reservation } = boundary;
    if (reservation === null) {
      return { state: "settled", detail: "No hosted review was reserved across publication." };
    }
    const readDischarge = createHostedReservationDischargeReader({
      cwd,
      exec,
      delivery: memberLookup,
      host,
    });
    if (reservation.target.kind === "delivery") {
      const resolution = await resolveHostedReservationTargets({
        workUnitId: workUnit,
        reservation,
        singleton: {
          repository: target.repository,
          pullRequest,
          headSha: target.headSha,
          baseRevision: record.attestation.baseRevision,
        },
        delivery: memberLookup,
        host,
        ...(terminalAdvance === undefined ? {} : { terminalAdvance }),
        ...(preparedTerminal === undefined ? {} : { preparedTerminal }),
      });
      if (resolution.status !== "resolved" || resolution.kind !== "delivery") {
        return { state: "blocked", detail: "The retained delivery-member review targets are unavailable." };
      }
      const deliveryTargets = resolution.targets.flatMap((memberTarget) => (
        memberTarget.vehicle === undefined
          || memberTarget.position === undefined
          || memberTarget.memberCount === undefined
          || memberTarget.chunkKey === undefined
          || memberTarget.title === undefined
          ? []
          : [{
              ...memberTarget,
              vehicle: memberTarget.vehicle,
              position: memberTarget.position,
              memberCount: memberTarget.memberCount,
              chunkKey: memberTarget.chunkKey,
              title: memberTarget.title,
            }]
      ));
      if (deliveryTargets.length !== resolution.targets.length) {
        return { state: "blocked", detail: "The retained delivery-member review selectors are unavailable." };
      }
      const terminalTarget = deliveryTargets.at(-1);
      const ownerTerminusAdvances: DeliveryReviewOwnerTerminusAdvance[] = terminalTarget === undefined
        || terminalTarget.position !== terminalTarget.memberCount
        ? []
        : (await Promise.all(boundary.deliveryReviewTermini.map(async (record) => {
            if (!sameDeliveryReviewMemberIdentity(record.vehicle, terminalTarget.vehicle)
              || record.vehicle.head === terminalTarget.vehicle.head) return [];
            const proof = await projectGitDeliveryTerminalRecordAdvance({
              cwd,
              exec,
              workUnitId: workUnit,
              baseBranch,
              priorHead: record.vehicle.head,
              currentHead: terminalTarget.vehicle.head,
            });
            return proof === undefined
              ? []
              : [{
                  priorVehicle: record.vehicle,
                  currentVehicle: terminalTarget.vehicle,
                  proof,
                }];
          }))).flat();
      const discharges = await Promise.all(deliveryTargets.map((memberTarget) => readDischarge({
        reservation,
        baseRevision: memberTarget.baseRevision,
        approvedHead: memberTarget.headSha,
        changeRequest: {
          repository: memberTarget.repository,
          pullRequest: memberTarget.pullRequest,
        },
        vehicle: memberTarget.vehicle,
        candidate: record,
      })));
      const publisher = new RepositoryGitCommonStatePublisher(exec, cwd);
      const store = new LocalReviewOperationStateStore(publisher);
      const snapshot = await store.readOperationSnapshot();
      const repositoryId = await resolveRepositoryIdentity(publisher);
      const policy = await resolveConfiguredLanePolicy({
        lane: "standard",
        settings,
        preferences: {
          readDeveloperSourceIds: () => Promise.resolve([]),
          readProjectSourceIds: () => Promise.resolve([]),
        },
      });
      const progress = deliveryTargets.map((memberTarget) => projectHostedReservationPolicyProgress({
        snapshot,
        repositoryId,
        target: {
          repository: memberTarget.repository,
          pullRequest: memberTarget.pullRequest,
          headSha: memberTarget.headSha,
        },
        vehicle: memberTarget.vehicle,
      }));
      const unavailableProgress = progress.find((memberProgress) => memberProgress.status === "unavailable");
      if (unavailableProgress?.status === "unavailable") {
        return { state: "blocked", detail: unavailableProgress.detail };
      }
      let composedDischarges: Parameters<typeof composeDeliveryReviewObligation>[0]["discharges"] = discharges.map(
        (discharge, index) => {
          const memberProgress = progress[index];
          if (memberProgress === undefined || memberProgress.status !== "complete") {
            throw new Error("delivery-member review progress is unavailable");
          }
          return {
            ...discharge,
            completedPasses: memberProgress.completedPasses,
            passCeiling: policy.maxPasses,
            attemptHistory: memberProgress.attemptHistory,
          };
        },
      );
      const firstOutstandingIndex = composedDischarges.findIndex((discharge, index) => {
        const memberTarget = deliveryTargets[index];
        return !discharge.discharged && (memberTarget === undefined
          || !isDeliveryReviewMemberDischargedByOwnerTerminus({
            target: memberTarget,
            discharge,
            ownerTermini: boundary.deliveryReviewTermini,
            ownerTerminusAdvances,
          }));
      });
      const firstOutstanding = discharges[firstOutstandingIndex];
      const firstTarget = deliveryTargets[firstOutstandingIndex];
      if (firstOutstanding?.nextSource !== null
        && firstOutstanding?.nextSource !== undefined
        && firstTarget !== undefined) {
        const scopeSelection = await resolveDeliveryMemberScopeSelection({
          cwd,
          settings,
          planId: reservation.target.planId,
          target: firstTarget,
          ...(judgment?.sourceId === undefined ? {} : { sourceId: judgment.sourceId }),
        });
        const admission = resolveHostedReservationPolicy({
          reservation,
          snapshot,
          repositoryId,
          target: {
            repository: firstTarget.repository,
            pullRequest: firstTarget.pullRequest,
            headSha: firstTarget.headSha,
          },
          vehicle: firstTarget.vehicle,
          maxPasses: policy.maxPasses,
          ...(firstOutstanding.requestAttempts === undefined
            ? {}
            : { requestAttempts: firstOutstanding.requestAttempts }),
          ...(judgment?.ceilingOverride === undefined
            ? {}
            : { ceilingOverride: judgment.ceilingOverride }),
          ...(judgment?.sourceId === undefined
            ? {}
            : { invocation: { mode: "force" as const, sourceId: judgment.sourceId } }),
          ...(scopeSelection === undefined ? {} : { scopeSelection }),
        });
        if (admission.status === "unavailable") {
          return { state: "blocked", detail: admission.detail };
        }
        composedDischarges = composedDischarges.map((discharge, index) => index !== firstOutstandingIndex
          ? discharge
          : {
              ...discharge,
              ...(admission.policy.state === "ready"
                ? { nextSource: admission.policy.payload.sourceId }
                : {}),
              requestAdmission: admission.policy,
              ...(judgment?.ceilingOverride === undefined
                ? {}
                : { requestCeilingOverride: judgment.ceilingOverride }),
              ...(scopeSelection === undefined ? {} : { requestScopeSelection: scopeSelection }),
            });
      }
      return composeDeliveryReviewObligation({
        targets: deliveryTargets,
        discharges: composedDischarges,
        ...(judgment?.coverage === undefined ? {} : { requestCoverage: judgment.coverage }),
        ...(judgment?.sourceId === undefined
          ? {}
          : { requestInvocation: { mode: "force" as const, sourceId: judgment.sourceId } }),
        applicabilityContext: {
          workUnitId: workUnit,
          expectedRecordVersion: versionedRecord.version,
          candidateId: record.attestation.candidateId,
        },
        ownerTermini: boundary.deliveryReviewTermini,
        ownerTerminusAdvances,
      });
    }
    const discharge = await readDischarge({
      reservation,
      baseRevision: record.attestation.baseRevision,
      approvedHead: target.headSha,
      changeRequest: { repository: target.repository, pullRequest },
      candidate: record,
    });
    return composeSingletonReviewObligation({
      discharge,
      applicabilityContext: {
        workUnitId: workUnit,
        expectedRecordVersion: versionedRecord.version,
        candidateId: record.attestation.candidateId,
      },
    });
  } catch (error) {
    return {
      state: "blocked",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Bind GitHub, publication-boundary, and Git base reads to the status reducer. */
export function createReviewStatusPort(
  input: {
    cwd: string;
    exec: GitExec;
    remote?: string;
    preparedNativeLanding?: {
      readonly planId: string;
      readonly operationId: string;
    };
  },
  precomputed?: {
    readonly target: ChangeRequestTargetRef;
    readonly pullRequest: number;
    readonly routedObligation: RoutedReviewObligation;
    readonly deliveryLookupHeadSha: string;
  },
): ReviewStatusPort {
  return {
    observe: async (target, ceilingOverride, coverage, sourceId) => {
      try {
        const remote = input.remote ?? "origin";
        const changeRequestPort = createGhChangeRequestResolutionPort(input.exec, input.cwd, remote);
        const memberLookup = new RepositoryDeliveryMemberLookup(input);
        const baseRef = (await readConfigSettings(input.cwd)).settings["branch.base"];
        const refs = await changeRequestPort.readHeadRef(target.headRef);
        const actualHeadSha = refs.remote ?? refs.local ?? target.headSha;
        const matchesPrecomputedTarget = precomputed !== undefined
          && precomputed.target.repository.toLowerCase() === target.repository.toLowerCase()
          && precomputed.target.headRef === target.headRef
          && precomputed.target.headSha === target.headSha;
        const resolution = await resolveChangeRequest(
          {
            headRef: target.headRef,
            headSha: target.headSha,
            baseRef,
            acceptableBaseRefs: await resolveAcceptableDeliveryBaseRefs(
              memberLookup,
              matchesPrecomputedTarget ? precomputed.deliveryLookupHeadSha : target.headSha,
            ),
          },
          changeRequestPort,
        );
        const subject = await resolveReviewSubject({
          headRef: target.headRef,
          headSha: matchesPrecomputedTarget ? precomputed.deliveryLookupHeadSha : target.headSha,
          memberLookup,
        });
        if (
          resolution.state !== "open"
          || resolution.targetRef.repository.toLowerCase() !== target.repository.toLowerCase()
        ) {
          return {
            actualHeadSha,
            requiredChecks: "unavailable",
            routedObligation: {
              state: "blocked",
              detail: `The exact target has no reusable open change request (${resolution.state}).`,
            },
            currentBaseOid: null,
            baseContained: false,
            baseMovement: null,
          };
        }
        const base = await readBasePosition({
          cwd: input.cwd,
          exec: input.exec,
          headSha: target.headSha,
          repository: target.repository,
          changeRequest: resolution.candidate.number,
          subject,
          remote,
        });
        const routedObligation = matchesPrecomputedTarget
          ? resolution.candidate.number === precomputed.pullRequest
            ? precomputed.routedObligation
            : {
                state: "blocked" as const,
                detail: "The selected delivery member's open change request does not match its retained binding.",
              }
          : await readRoutedObligation(
              input.cwd,
              input.exec,
              target,
              resolution.candidate.number,
              memberLookup,
              base.currentBaseOid ?? undefined,
              ceilingOverride === undefined && coverage === undefined && sourceId === undefined
                ? undefined
                : {
                    ...(ceilingOverride === undefined ? {} : { ceilingOverride }),
                    ...(coverage === undefined ? {} : { coverage }),
                    ...(sourceId === undefined ? {} : { sourceId }),
                  },
              undefined,
              {
                remote,
                changeRequestCandidate: resolution.candidate,
                ...(input.preparedNativeLanding === undefined
                  ? {}
                  : { preparedNativeLanding: input.preparedNativeLanding }),
              },
            );
        const checksPort = createGhRequiredChecksPort(hostedGhRunner);
        const signal = new AbortController().signal;
        const checkedHead = await checksPort.readHead(target.repository, resolution.candidate.number, signal);
        const requiredChecks = aggregateChecks(
          await checksPort.readRequiredChecks(target.repository, resolution.candidate.number, signal),
        );
        return {
          actualHeadSha: checkedHead,
          requiredChecks,
          routedObligation,
          ...base,
          ...(subject.status === "resolved" ? { workUnitId: subject.workUnitId } : {}),
        };
      } catch (error) {
        return {
          actualHeadSha: target.headSha,
          requiredChecks: "unavailable",
          routedObligation: {
            state: "blocked",
            detail: error instanceof Error ? error.message : String(error),
          },
          currentBaseOid: null,
          baseContained: false,
          baseMovement: null,
        };
      }
    },
  };
}

/**
 * Select the exact current member target, carrying only a previously validated terminal advance.
 *
 * @param input - Durable state, routed conjunction, and optional validated terminal movement.
 * @returns The exact selected target plus its state-backed member lookup head, or null when unjustified.
 */
export function selectDeliveryReviewStatusTarget(input: {
  readonly anchor: ChangeRequestTargetRef;
  readonly terminalPullRequest: number;
  readonly terminalDeliverableId: string;
  readonly stateMembers: readonly {
    readonly deliverableId: string;
    readonly ref: string | null;
    readonly coordinates: { readonly head: string } | null;
  }[];
  readonly outstanding: boolean;
  readonly firstOutstanding?: {
    readonly vehicle: { readonly deliverableId: string };
    readonly target: { readonly repository: string; readonly pullRequest: number; readonly headSha: string };
  };
  readonly terminalAdvance?: { readonly stateHead: string; readonly currentHead: string };
}): {
  readonly target: ChangeRequestTargetRef;
  readonly pullRequest: number;
  readonly deliveryLookupHeadSha: string;
} | null {
  if (!input.outstanding) {
    const headSha = input.terminalAdvance?.stateHead === input.anchor.headSha
      ? input.terminalAdvance.currentHead
      : input.anchor.headSha;
    return {
      target: { ...input.anchor, headSha },
      pullRequest: input.terminalPullRequest,
      deliveryLookupHeadSha: input.anchor.headSha,
    };
  }
  const selected = input.firstOutstanding;
  const selectedState = selected === undefined
    ? undefined
    : input.stateMembers.find(({ deliverableId }) => deliverableId === selected.vehicle.deliverableId);
  const selectedHeadRef = deliveryHeadRef(selectedState?.ref ?? null);
  if (selected === undefined || selectedState?.coordinates === null
    || selectedState?.coordinates === undefined || selectedHeadRef === null) return null;
  const exactStateHead = selectedState.coordinates.head === selected.target.headSha;
  const exactTerminalAdvance = selected.vehicle.deliverableId === input.terminalDeliverableId
    && input.terminalAdvance?.stateHead === selectedState.coordinates.head
    && input.terminalAdvance.currentHead === selected.target.headSha;
  if (!exactStateHead && !exactTerminalAdvance) return null;
  return {
    target: {
      repository: selected.target.repository,
      headRef: selectedHeadRef,
      headSha: selected.target.headSha,
    },
    pullRequest: selected.target.pullRequest,
    deliveryLookupHeadSha: selectedState.coordinates.head,
  };
}

/** Resolve live stacked-delivery status without reconstructing a member target. */
export async function resolveReviewStatusForWorkUnit(input: {
  readonly cwd: string;
  readonly exec: GitExec;
  readonly workUnitId: string;
  readonly ceilingOverride?: ReviewStatusTargetInput["ceilingOverride"];
  readonly coverage?: HostedReviewCoverage;
  readonly sourceId?: string;
  readonly remote?: string;
}): Promise<ReviewStatusResult> {
  const workUnitId = SlugSchema.parse(input.workUnitId);
  const versionedBoundary = await readSubmissionBoundaryVersioned(input.cwd, workUnitId);
  const boundary = versionedBoundary.boundary;
  if (boundary?.locus !== "delivery-status-required"
    || boundary.nextAction.workUnitId !== workUnitId
    || boundary.reservation.target.kind !== "delivery"
    || boundary.reservation.target.workUnitId !== workUnitId
    || boundary.candidateSubjectDigest === null
    || versionedBoundary.version === null) {
    throw new Error("The work unit has no self-contained delivery status action.");
  }
  const memberLookup = new RepositoryDeliveryMemberLookup(input);
  const delivery = await memberLookup.resolveTerminalRecords(workUnitId);
  if (delivery.status !== "resolved"
    || delivery.plan.planId !== boundary.reservation.target.planId
    || delivery.state.planId !== delivery.plan.planId) {
    throw new Error("The work unit's current delivery plan and state are unavailable.");
  }
  const terminalPlanMember = delivery.plan.members.at(-1);
  const terminalStateMember = delivery.state.members.at(-1);
  const terminalHeadRef = deliveryHeadRef(terminalStateMember?.ref ?? null);
  const terminalPullRequest = Number(terminalStateMember?.changeRequest?.changeRequestId);
  if (terminalPlanMember === undefined
    || terminalStateMember === undefined
    || terminalPlanMember.deliverableId !== terminalStateMember.deliverableId
    || terminalStateMember.coordinates === null
    || terminalHeadRef === null
    || !Number.isSafeInteger(terminalPullRequest)
    || terminalPullRequest <= 0) {
    throw new Error("The terminal delivery-member review anchor is unavailable.");
  }
  const anchor = {
    repository: boundary.reservation.target.repository,
    headRef: terminalHeadRef,
    headSha: terminalStateMember.coordinates.head,
  };
  let terminalAdvance: { readonly stateHead: string; readonly currentHead: string } | undefined;
  const routed = await readRoutedObligation(
    input.cwd,
    input.exec,
    anchor,
    terminalPullRequest,
    memberLookup,
    undefined,
    input.ceilingOverride === undefined && input.coverage === undefined && input.sourceId === undefined
      ? undefined
      : {
          ...(input.ceilingOverride === undefined ? {} : { ceilingOverride: input.ceilingOverride }),
          ...(input.coverage === undefined ? {} : { coverage: input.coverage }),
          ...(input.sourceId === undefined ? {} : { sourceId: input.sourceId }),
        },
    undefined,
    {
      ...(input.remote === undefined ? {} : { remote: input.remote }),
      captureTerminalAdvance: (advance) => {
        terminalAdvance = advance;
      },
    },
  );
  const outstanding = "conjunction" in routed && routed.conjunction.status === "outstanding";
  const firstOutstanding = outstanding
    ? routed.conjunction.members.find((member) => member.state === "outstanding")
    : undefined;
  const selection = selectDeliveryReviewStatusTarget({
    anchor,
    terminalPullRequest,
    terminalDeliverableId: terminalPlanMember.deliverableId,
    stateMembers: delivery.state.members,
    outstanding,
    ...(firstOutstanding === undefined ? {} : { firstOutstanding }),
    ...(terminalAdvance === undefined ? {} : { terminalAdvance }),
  });
  if (selection === null) throw new Error("The selected delivery-member review target is unavailable.");
  const selectedTarget = selection.target;
  const selectedPullRequest = selection.pullRequest;
  const result = await resolveReviewStatus({
    target: selectedTarget,
    ...(input.ceilingOverride === undefined ? {} : { ceilingOverride: input.ceilingOverride }),
    ...(input.coverage === undefined ? {} : { coverage: input.coverage }),
  }, createReviewStatusPort(input, {
    target: selectedTarget,
    pullRequest: selectedPullRequest,
    routedObligation: routed,
    deliveryLookupHeadSha: selection.deliveryLookupHeadSha,
  }));
  return bindDeliveryReviewTerminusOffer(result, {
    workUnitId,
    remote: input.remote ?? "origin",
    expectedBoundaryVersion: versionedBoundary.version,
    candidateId: boundary.candidateId,
    candidateSubjectDigest: boundary.candidateSubjectDigest,
  });
}
