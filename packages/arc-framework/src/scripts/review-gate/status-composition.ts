/** Production composition for exact-target review status. */

import { readConfigSettings } from "../../lib/config/status-reader.js";
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
import type { DeliveryHostPort } from "../../lib/delivery/host.js";
import { GhDeliveryHostPort } from "../delivery/hosts/github.js";
import { projectGitDeliveryTerminalCoordinateAdvance } from
  "../../lib/delivery/public-review-continuation-git.js";
import {
  resolveAcceptableDeliveryBaseRefs,
  type DeliveryDischargeTargetLookup,
  type DeliveryMemberLookup,
  type DeliveryTerminalRecordLookup,
} from "./core/delivery-member-lookup.js";
import { resolveReviewSubject } from "./core/review-subject.js";
import {
  createHostedReservationDischargeReader,
  resolveHostedReservationTargets,
} from "./policy/hosted-reservation-discharge.js";
import {
  resolveChangeRequest,
  type ChangeRequestTargetRef,
} from "./change-request.js";
import { createGhChangeRequestResolutionPort } from "./hosts/github/change-request.js";
import { aggregateChecks } from "./checks-await.js";
import { createGhRequiredChecksPort } from "./hosts/github/checks-await.js";
import { RepositoryDeliveryMemberLookup } from "./hosts/local/delivery-member-lookup.js";
import { resolveRepositoryIdentity } from "./hosts/local/git-common-state.js";
import { LocalReviewOperationStateStore } from "./hosts/local/operation-state-store.js";
import { hostedGhRunner } from "./hosted/gh-process.js";
import type { HostedReviewCoverage } from "./hosted/request.js";
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

async function readBasePosition(input: {
  cwd: string;
  exec: GitExec;
  headSha: string;
}): Promise<Pick<ReviewStatusObservation, "currentBaseOid" | "baseContained">> {
  const { settings } = await readConfigSettings(input.cwd);
  const base = settings["branch.base"];
  await input.exec("git", ["fetch", "origin", base], { cwd: input.cwd });
  const currentBaseOid = (await input.exec(
    "git",
    ["rev-parse", "--verify", `refs/remotes/origin/${base}`],
    { cwd: input.cwd, objectAccess: "local-only" },
  )).stdout.trim();
  if (!isGitObjectId(currentBaseOid)) throw new Error("invalid base object ID");
  try {
    await input.exec("git", ["merge-base", "--is-ancestor", currentBaseOid, input.headSha], {
      cwd: input.cwd,
      objectAccess: "local-only",
    });
    return { currentBaseOid, baseContained: true };
  } catch (error) {
    if (isGitProcessError(error) && error.kind === "nonzero-exit" && error.exitCode === 1) {
      return { currentBaseOid, baseContained: false };
    }
    throw error;
  }
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

  await input.exec("git", ["fetch", "origin", input.headSha], { cwd: input.cwd });
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
  deliveryHost: Pick<DeliveryHostPort, "readRequest"> = new GhDeliveryHostPort(hostedGhRunner),
): Promise<RoutedReviewObligation> {
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
    if (correctiveContinuation !== undefined) {
      effective = await projectGitCandidateEffectiveTarget({
        cwd,
        name: workUnit,
        baseBranch,
        ...(currentBaseRevision === undefined ? {} : { baseRevision: currentBaseRevision }),
        record,
        exec,
        rawExec: createRawGitExec(cwd),
      });
      if (effective.state !== "current") {
        return { state: "blocked", detail: "The owning work-unit Candidate is not current." };
      }
      const delivery = await memberLookup.resolveTerminalRecords(workUnit);
      const terminalCoordinates = delivery.status === "resolved"
        ? delivery.state.members.at(-1)?.coordinates ?? undefined
        : undefined;
      const terminalCoordinateAdvance = await projectGitDeliveryTerminalCoordinateAdvance({
        cwd,
        exec,
        candidate: effective,
        workUnitId: workUnit,
        baseBranch,
        ...(terminalCoordinates === undefined ? {} : { terminalCoordinates }),
      });
      if (delivery.status !== "resolved"
        || validateDeliveryPublicReviewContinuation({
          continuation: correctiveContinuation,
          plan: delivery.plan,
          state: delivery.state,
          stateRevision: delivery.stateRevision,
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
      }
    } else {
      await ensureCandidateHeadAvailable({ cwd, exec, headSha: candidateHead });
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
      host: deliveryHost,
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
        host: deliveryHost,
        ...(terminalAdvance === undefined ? {} : { terminalAdvance }),
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
  input: { cwd: string; exec: GitExec },
  precomputed?: {
    readonly target: ChangeRequestTargetRef;
    readonly pullRequest: number;
    readonly routedObligation: RoutedReviewObligation;
  },
): ReviewStatusPort {
  return {
    observe: async (target, ceilingOverride, coverage) => {
      try {
        const changeRequestPort = createGhChangeRequestResolutionPort(input.exec, input.cwd);
        const memberLookup = new RepositoryDeliveryMemberLookup(input);
        const baseRef = (await readConfigSettings(input.cwd)).settings["branch.base"];
        const refs = await changeRequestPort.readHeadRef(target.headRef);
        const actualHeadSha = refs.remote ?? refs.local ?? target.headSha;
        const resolution = await resolveChangeRequest(
          {
            headRef: target.headRef,
            headSha: target.headSha,
            baseRef,
            acceptableBaseRefs: await resolveAcceptableDeliveryBaseRefs(memberLookup, target.headSha),
          },
          changeRequestPort,
        );
        const base = await readBasePosition({ cwd: input.cwd, exec: input.exec, headSha: target.headSha });
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
            ...base,
          };
        }
        const matchesPrecomputed = precomputed !== undefined
          && precomputed.target.repository.toLowerCase() === target.repository.toLowerCase()
          && precomputed.target.headRef === target.headRef
          && precomputed.target.headSha === target.headSha;
        const routedObligation = matchesPrecomputed
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
              ceilingOverride === undefined && coverage === undefined
                ? undefined
                : {
                    ...(ceilingOverride === undefined ? {} : { ceilingOverride }),
                    ...(coverage === undefined ? {} : { coverage }),
                  },
            );
        const checksPort = createGhRequiredChecksPort(hostedGhRunner);
        const repository = await checksPort.resolveRepository();
        if (repository.toLowerCase() !== target.repository.toLowerCase()) {
          return {
            actualHeadSha,
            requiredChecks: "unavailable",
            routedObligation: {
              state: "blocked",
              detail: "The required-check repository does not match the target.",
            },
            ...base,
          };
        }
        const signal = new AbortController().signal;
        const checkedHead = await checksPort.readHead(repository, resolution.candidate.number, signal);
        const requiredChecks = aggregateChecks(
          await checksPort.readRequiredChecks(repository, resolution.candidate.number, signal),
        );
        return { actualHeadSha: checkedHead, requiredChecks, routedObligation, ...base };
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
        };
      }
    },
  };
}

/** Resolve the live stacked-delivery review action without reconstructing a member target. */
export async function resolveReviewStatusForWorkUnit(input: {
  readonly cwd: string;
  readonly exec: GitExec;
  readonly workUnitId: string;
  readonly ceilingOverride?: ReviewStatusTargetInput["ceilingOverride"];
  readonly coverage?: HostedReviewCoverage;
  readonly sourceId?: string;
}): Promise<ReviewStatusResult> {
  const workUnitId = SlugSchema.parse(input.workUnitId);
  const versionedBoundary = await readSubmissionBoundaryVersioned(input.cwd, workUnitId);
  const boundary = versionedBoundary.boundary;
  if (boundary?.locus !== "hosted-review-pending"
    || boundary.nextAction.kind !== "continue-hosted-review"
    || boundary.nextAction.workUnitId !== workUnitId
    || boundary.reservation.target.kind !== "delivery"
    || boundary.reservation.target.workUnitId !== workUnitId
    || boundary.candidateSubjectDigest === null
    || versionedBoundary.version === null) {
    throw new Error("The work unit has no self-contained hosted delivery-review continuation.");
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
  );
  let selectedTarget = anchor;
  let selectedPullRequest = terminalPullRequest;
  if ("conjunction" in routed && routed.conjunction.status === "outstanding") {
    const selected = routed.conjunction.members.find((member) => member.state === "outstanding");
    const selectedState = selected === undefined
      ? undefined
      : delivery.state.members.find((member) => member.deliverableId === selected.vehicle.deliverableId);
    const selectedHeadRef = deliveryHeadRef(selectedState?.ref ?? null);
    if (selected === undefined
      || selectedState?.coordinates === null
      || selectedState?.coordinates.head !== selected.target.headSha
      || selectedHeadRef === null) {
      throw new Error("The selected delivery-member review target is unavailable.");
    }
    selectedTarget = {
      repository: selected.target.repository,
      headRef: selectedHeadRef,
      headSha: selected.target.headSha,
    };
    selectedPullRequest = selected.target.pullRequest;
  }
  const result = await resolveReviewStatus({
    target: selectedTarget,
    ...(input.ceilingOverride === undefined ? {} : { ceilingOverride: input.ceilingOverride }),
    ...(input.coverage === undefined ? {} : { coverage: input.coverage }),
  }, createReviewStatusPort(input, {
    target: selectedTarget,
    pullRequest: selectedPullRequest,
    routedObligation: routed,
  }));
  return bindDeliveryReviewTerminusOffer(result, {
    workUnitId,
    expectedBoundaryVersion: versionedBoundary.version,
    candidateId: boundary.candidateId,
    candidateSubjectDigest: boundary.candidateSubjectDigest,
  });
}
