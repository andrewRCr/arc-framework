/** Production adapters for the local review prepare command. */

import { createCandidateResponseHeadContinuationReader } from "./candidate-response-head-continuation.js";
import { readFile } from "node:fs/promises";

import { readConfigSettings } from "../../../lib/config/status-reader.js";
import type { GitExec } from "../../../lib/git/exec.js";
import { RepositoryGitCommonStatePublisher } from "../../../lib/git-common-state.js";
import { getFrameworkVersion } from "../../../lib/version.js";
import { canonicalize } from "../../../lib/kernel/index.js";
import {
  LocalReviewOperationStateStore,
} from "../hosts/local/operation-state-store.js";
import {
  resolveRepositoryIdentity,
  withRepositoryLocalReviewLock,
  withRepositoryReviewOperationLock,
} from "../hosts/local/git-common-state.js";
import { RepositoryLocalReviewSourceStore } from "../hosts/local/source-store.js";
import {
  createLocalReviewSourceDescriptor,
  ensureLocalReviewSourceMaterialized,
} from "../hosts/local/review-materialization.js";
import {
  composeDeliveryMemberTarget,
  deriveLocalReviewTarget,
  confirmLocalReviewTarget,
} from "../hosts/local/repository-target.js";
import {
  RepositoryDeliveryMemberLookup,
} from "../hosts/local/delivery-member-lookup.js";
import {
  resolveLocalReviewAuthority,
  resolveLocalReviewVehicle,
} from "../hosts/local/review-authority.js";
import type { LocalReviewAuthority } from "../core/local-review-authority.js";
import {
  readLocalReviewLiveContext,
  type ResolvedLocalReviewLiveContext,
} from "../hosts/local/live-context.js";
import {
  createLocalReviewMethodFilePort,
  createLocalReviewRubricBindingPort,
} from "../hosts/local/method-files.js";
import {
  composeWorkUnitReviewAssurance,
} from "../policy/assurance.js";
import {
  bindReviewMethodActivity,
  resolveReviewMethodActivity,
} from "../policy/activity.js";
import { projectLocalReviewGuidance } from "../policy/local-review-guidance.js";
import {
  resolveLocalReviewPolicyBinding,
  validateLocalReviewPolicySelection,
} from "../policy/local-review-policy.js";
import { RepositoryLocalReviewSourceSweepAdapter } from "../hosts/local/source-sweep.js";
import { LocalForwardReviewReceiptStore } from "../hosts/local/receipt-store.js";
import {
  confirmCurrentDispositionSet,
  LocalApprovedDispositionRecordStore,
} from "../hosts/local/disposition-record-store.js";
import { createRepositoryReviewResultReader } from
  "../hosts/local/review-result-reader-composition.js";
import { sweepLocalReviewSources } from "../core/local-source-sweep.js";
import type { LocalPrepareDependencies } from "./local-prepare.js";
import { resolveReviewStatus } from "../status.js";
import { createReviewStatusPort } from "../status-composition.js";
import { readSubmissionBoundaryVersioned } from "../../../lib/work-unit/submission-boundary-store.js";
import {
  readCandidateRecord,
  readRepositoryCandidateSupersessionChain,
} from "../../../lib/work-unit/candidate-record-store.js";
import type { CandidateManagedRecordV1 } from "../../../lib/work-unit/candidate-attestation.js";
import { createRawGitExec } from "../../../lib/io-context.js";
import {
  LaneSubjectLineageSchema,
  type LaneSubjectLineage,
} from "../core/lane-admission.js";
import { createLocalFrontlineSourcePreferenceReader } from
  "../hosts/local/frontline-source-preferences.js";
import { createGhChangeRequestResolutionPort } from "../hosts/github/change-request.js";
import { resolveChangeRequest } from "../change-request.js";
import { resolveConfiguredLanePolicy } from "../policy/lane-policy-config.js";
import {
  assertEvidenceBoundReviewExecutionAdmission,
  resolveEvidenceBoundReviewPolicyContinuation,
} from "../policy/review-policy-evidence.js";
import {
  confirmErrandFixResponseApplicability,
  confirmNonDeliveryIncrementalApplicability,
  confirmPrivateCandidateCorrectionBasis,
  resolveLocalReviewCoverageSelection,
} from
  "../policy/local-review-coverage-selection.js";
import {
  laneContinuationOperationId,
  readLaneResponsePerformance,
} from "../lane-progress.js";
import type { ReviewTarget } from "../core/gate-contract-v2-schema.js";
import type { ReviewResult } from "../core/review-result.js";

const LOCAL_STANDARD_SOURCE = {
  sourceKind: "agent",
  qualifier: "standard-review/v1",
} as const;

async function resolveLocalPolicyTarget(
  input: { cwd: string; exec: GitExec },
  repositoryId: string,
  target: ReviewTarget,
  baseRef: string,
) {
      const branch = (await input.exec("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
        cwd: input.cwd,
      })).stdout.trim();
      if (branch === "" || branch === "HEAD") {
        throw new Error("Local review requires an attached originating branch.");
      }
      const changeRequest = await resolveChangeRequest({
        headRef: branch,
        headSha: target.headSha,
        baseRef: baseRef,
      }, createGhChangeRequestResolutionPort(input.exec, input.cwd));
      if (changeRequest.targetRef !== null && (changeRequest.state === "blocked"
        || changeRequest.state === "ambiguous")) {
        throw new Error("Local review could not resolve exact change-request authority.");
      }
      const policyTarget = changeRequest.targetRef === null
        ? {
            repository: `local/${repositoryId}`,
            pullRequest: null,
            headSha: target.headSha,
          }
        : {
            repository: changeRequest.targetRef.repository,
            pullRequest: changeRequest.state === "open" ? changeRequest.candidate.number : null,
            headSha: target.headSha,
          };
  return policyTarget;
}

function createLocalPolicyRequest(
  request: Parameters<LocalPrepareDependencies["validatePolicyAdmission"]>[0],
  policyTarget: { repository: string; pullRequest: number | null; headSha: string },
) {
  const { standardReview, completedPasses, attempts, judgment } = request;
      const policyRequest = {
        schemaVersion: 1,
        target: policyTarget,
        lane: "standard",
        frontlineActive: false,
        standardReview,
        completedPasses,
        attempts,
        ...(judgment?.scopeMode === undefined
          ? {}
          : { scopeSelection: { mode: judgment.scopeMode, target: policyTarget } }),
        invocation: judgment?.invocation ?? {
          mode: "force",
          sourceId: "delegated-agent",
        },
        ...(judgment?.ceilingOverride === undefined
          ? {}
          : {
              ceilingOverride: {
                ...judgment.ceilingOverride,
                target: policyTarget,
                lane: "standard" as const,
              },
            }),
        ...(judgment?.additionalPassAuthorization === undefined
          ? {}
          : {
              additionalPassAuthorization: {
                precedingProducerId: judgment.additionalPassAuthorization.precedingProducerId,
                completedPasses: judgment.additionalPassAuthorization.completedPasses,
                nextPass: judgment.additionalPassAuthorization.nextPass,
                target: { ...policyTarget, headSha: judgment.additionalPassAuthorization.headSha },
                lane: "standard" as const,
              },
            }),
        ...(judgment?.terminus === undefined ? {} : { terminus: judgment.terminus }),
      };
  return policyRequest;
}

/** Bind the exact Errand fix-response bridge and ordinary contribution proof to one live target. */
function createLocalContributionConfirmation(input: {
  context: {
    input: { cwd: string; exec: GitExec };
    dispositionStore: LocalApprovedDispositionRecordStore;
    operationStore: LocalReviewOperationStateStore;
  };
  repositoryId: string;
  baseRef: string;
  policyTarget: { repository: string; pullRequest: number | null };
  candidate: CandidateManagedRecordV1 | null;
}) {
  return async (
    predecessor: ReviewResult,
    currentTarget: ReviewTarget,
    currentLineage: LaneSubjectLineage,
    currentResult?: ReviewResult,
  ) => {
    const observeTarget = () => deriveLocalReviewTarget({
      exec: input.context.input.exec,
      cwd: input.context.input.cwd,
      baseRef: input.baseRef,
      repositoryId: input.repositoryId,
    });
    if (input.policyTarget.pullRequest === null && currentLineage.kind === "head-bound"
      && currentLineage.vehicleKind === "errand") {
      const live = await readLocalReviewLiveContext(input.context.input).catch(() => null);
      return confirmErrandFixResponseApplicability({
        predecessor,
        currentTarget,
        currentLineage,
        currentClaimId: live?.context.errand?.claimId === currentLineage.vehicleIdentity
          ? live.context.errand.claimId : null,
        ...(currentResult === undefined ? {} : { currentResult }),
        observeTarget,
        dispositionStore: input.context.dispositionStore,
        readResponsePerformance: (result) => readLaneResponsePerformance(input.context.operationStore, result),
      });
    }
    if (input.policyTarget.pullRequest === null && currentLineage.kind === "candidate") {
      return confirmPrivateCandidateCorrectionBasis({
        predecessor,
        currentTarget,
        currentLineage,
        ...(currentResult === undefined ? {} : { currentResult }),
        candidate: input.candidate,
        cwd: input.context.input.cwd,
        baseRef: input.baseRef,
        exec: input.context.input.exec,
        observeTarget,
        readResponsePerformance: (result) => readLaneResponsePerformance(
          input.context.operationStore, result,
        ),
      });
    }
    return confirmNonDeliveryIncrementalApplicability({
      predecessor,
      currentTarget,
      currentLineage,
      repository: input.policyTarget.repository,
      pullRequest: input.policyTarget.pullRequest,
      candidate: input.candidate,
      exec: createRawGitExec(input.context.input.cwd),
      observeTarget,
    });
  };
}

async function validateLocalPolicyAdmission(
  request: Parameters<LocalPrepareDependencies["validatePolicyAdmission"]>[0],
  context: {
    input: { cwd: string; exec: GitExec };
    resultReader: ReturnType<typeof createRepositoryReviewResultReader>;
    dispositionStore: LocalApprovedDispositionRecordStore;
    operationStore: LocalReviewOperationStateStore;
  },
): ReturnType<LocalPrepareDependencies["validatePolicyAdmission"]> {
  const {
    repositoryId, target, lineage, standardReview, workUnitId,
    terminalResponsePerformed, predecessorOperationId, coverageAdmission,
  } = request;

      const settings = (await readConfigSettings(context.input.cwd)).settings;
      const policy = await resolveConfiguredLanePolicy({
        lane: "standard",
        settings,
        preferences: createLocalFrontlineSourcePreferenceReader({
          cwd: context.input.cwd,
          exec: context.input.exec,
          readFile: (path) => readFile(path, "utf8"),
        }),
      });
      const policyTarget = await resolveLocalPolicyTarget(
        context.input, repositoryId, target, settings["branch.base"],
      );
      const policyRequest = createLocalPolicyRequest(request, policyTarget);
      const candidate = lineage.kind === "candidate" && workUnitId !== undefined
        ? await readCandidateRecord(context.input.cwd, workUnitId)
        : null;
      const confirmContribution = createLocalContributionConfirmation({
        context, repositoryId, baseRef: settings["branch.base"], policyTarget, candidate,
      });
      const policyDependencies = {
        sources: policy.sources.length === 0 ? ["delegated-agent"] : policy.sources,
        maxPasses: policy.maxPasses,
        resultReader: context.resultReader,
        dispositionStore: context.dispositionStore,
        readResponsePerformance: (predecessor: ReviewResult) => readLaneResponsePerformance(
          context.operationStore,
          predecessor,
        ),
        confirmIncrementalApplicability: (predecessor: ReviewResult, current: ReviewResult) =>
          confirmContribution(predecessor, current.target, current.admission.lineage, current),
        confirmTarget: (attemptedTarget: ReviewTarget) => Promise.resolve(attemptedTarget),
      };
      const unresolved = await resolveEvidenceBoundReviewPolicyContinuation(policyRequest, {
        terminalResponsePerformed,
      }, policyDependencies);
      const coverage = await resolveLocalReviewCoverageSelection({
        policy: unresolved,
        target,
        sourceId: "delegated-agent",
        lineage,
        standardReview,
        ...(predecessorOperationId === undefined ? {} : { predecessorOperationId }),
        ...(coverageAdmission === undefined ? {} : { coverageAdmission }),
      }, {
        resultReader: context.resultReader,
        dispositionStore: context.dispositionStore,
        readResponsePerformance: (predecessor) => readLaneResponsePerformance(
          context.operationStore,
          predecessor,
        ),
        confirmIncrementalApplicability: (predecessor, current) =>
          confirmContribution(predecessor, current.target, current.admission.lineage, current),
        confirmCurrentApplicability: (predecessor, currentTarget) =>
          confirmContribution(predecessor, currentTarget, lineage),
      });
      if (coverage.state === "coverage-required") return coverage;
      const resolution = await assertEvidenceBoundReviewExecutionAdmission(policyRequest, {
        terminalResponsePerformed,
        ...(coverage.coverageSelected ? { coverageSelected: true } : {}),
      }, {
        sourceId: "delegated-agent",
        nextAction: "local-prepare",
      }, policyDependencies);
      return { state: "ready", pass: resolution.payload.pass };
}

/** Bind local prepare to the current repository, managed methods, and Git-common stores. */
export function createLocalPrepareDependencies(input: {
  exec: GitExec;
  cwd: string;
}): LocalPrepareDependencies {
  const publisher = new RepositoryGitCommonStatePublisher(input.exec, input.cwd);
  const operationStore = new LocalReviewOperationStateStore(publisher);
  const sourceStore = new RepositoryLocalReviewSourceStore(publisher);
  const dispositionStore = new LocalApprovedDispositionRecordStore(publisher);
  const resultReader = createRepositoryReviewResultReader(publisher);
  const sweepAdapter = new RepositoryLocalReviewSourceSweepAdapter(input.exec, input.cwd);
  let receiptStore: Promise<LocalForwardReviewReceiptStore> | null = null;
  const receipts = () => {
    receiptStore ??= resolveRepositoryIdentity(publisher)
      .then((repositoryId) => new LocalForwardReviewReceiptStore(publisher, repositoryId));
    return receiptStore;
  };
  let liveContext: Promise<ResolvedLocalReviewLiveContext> | null = null;
  const readLive = () => {
    liveContext ??= readLocalReviewLiveContext(input);
    return liveContext;
  };
  const memberLookup = new RepositoryDeliveryMemberLookup(input);
  const methodFiles = createLocalReviewMethodFilePort({ cwd: input.cwd });
  const rubricPort = createLocalReviewRubricBindingPort({ cwd: input.cwd });

  return {
    laneSourceId: "delegated-agent",
    operationStore,
    sourceStore,
    now: () => new Date().toISOString(),
    withLaneOperationLock: (coordinates, action) => withRepositoryReviewOperationLock(
      input.exec,
      input.cwd,
      laneContinuationOperationId(coordinates),
      10_000,
      action,
    ),
    confirmResponseHeadContinuation: createCandidateResponseHeadContinuationReader({ ...input, dispositionStore, operationStore }),
    confirmDispositionSetCurrent: (producerId, dispositionSetId) => confirmCurrentDispositionSet(
      dispositionStore,
      producerId,
      dispositionSetId,
    ),
    withLocalReviewLock: (action) => withRepositoryLocalReviewLock(input.exec, input.cwd, action),
    sweep: async () => {
      const receiptStore = await receipts();
      await withRepositoryLocalReviewLock(input.exec, input.cwd, async () => {
        await sweepLocalReviewSources({
          listOperationIds: () => sweepAdapter.listOperationIds(),
          readOperation: (operationId) => operationStore.readOperation(operationId),
          readReceipts: (targetId) => receiptStore.readReceipts(targetId),
          release: (operationId) => sweepAdapter.releaseWithinLock(operationId),
          now: () => new Date().toISOString(),
        });
      });
    },
    readReceipts: async (targetId) => (await receipts()).readReceipts(targetId),
    resolveRepositoryId: () => resolveRepositoryIdentity(publisher),
    readCurrentHeadSha: async () => (await input.exec("git", ["rev-parse", "HEAD"], {
      cwd: input.cwd,
    })).stdout.trim(),
    deriveTarget: async (repositoryId, member) => {
      const config = await readConfigSettings(input.cwd);
      const boundary = {
        exec: input.exec,
        cwd: input.cwd,
        baseRef: config.settings["branch.base"],
        repositoryId,
      };
      return member === undefined
        ? deriveLocalReviewTarget(boundary)
        : composeDeliveryMemberTarget({ ...boundary, member });
    },
    confirmTarget: (target) => confirmLocalReviewTarget({
      exec: input.exec,
      cwd: input.cwd,
      attemptedTarget: target,
    }),
    resolveAuthority: (evaluatorIdentity, memberHeadObjectId, deliveryAdmission) => resolveLocalReviewAuthority(
      {
        evaluatorIdentity,
        ...(memberHeadObjectId === undefined ? {} : { memberHeadObjectId }),
        ...(deliveryAdmission === undefined ? {} : { deliveryAdmission }),
      },
      {
        readLiveContext: async () => (await readLive()).context,
        resolveRuntimeBinding: () => Promise.resolve({
          kind: "arc-cli",
          identity: `arc-cli/${getFrameworkVersion()}`,
        }),
        memberLookup,
      },
    ),
    resolveVehicle: (memberHeadObjectId, deliveryAdmission) => resolveLocalReviewVehicle({
      ...(memberHeadObjectId === undefined ? {} : { memberHeadObjectId }),
      ...(deliveryAdmission === undefined ? {} : { deliveryAdmission }),
    }, { readLiveContext: async () => (await readLive()).context, memberLookup }),
    resolveLineage: async (vehicle, headSha, deliveryAdmission, member) => {
      if (vehicle.kind === "delivery-member") {
        if (member === undefined) {
          throw new Error("delivery-member lineage authority is unavailable");
        }
        return LaneSubjectLineageSchema.parse({
          kind: "delivery-member",
          planId: deliveryAdmission?.vehicle.planId ?? member.planId,
          workUnitId: deliveryAdmission?.vehicle.workUnitId ?? member.workUnitId,
          deliverableId: deliveryAdmission?.vehicle.deliverableId ?? member.deliverableId,
        });
      }
      if (vehicle.kind === "work-unit") {
        const boundary = (await readSubmissionBoundaryVersioned(input.cwd, vehicle.identity)).boundary;
        if (boundary === null || boundary.workUnit !== vehicle.identity) {
          throw new Error("Candidate lineage authority is unavailable for local review");
        }
        return LaneSubjectLineageSchema.parse({
          kind: "candidate",
          candidateId: boundary.candidateId,
        });
      }
      const claim = (await readLive()).context.errand;
      if (claim?.identity !== vehicle.identity || claim.claimId !== vehicle.claimId) {
        throw new Error("Errand claim authority is unavailable for local review");
      }
      return LaneSubjectLineageSchema.parse({
        kind: "head-bound",
        vehicleKind: "errand",
        vehicleIdentity: claim.claimId,
        headSha,
      });
    },
    resolveSupersessionAncestors: async (workUnitId, candidateId) => {
      const record = await readCandidateRecord(input.cwd, workUnitId);
      if (record === null || record.attestation.candidateId !== candidateId) {
        throw new Error("Candidate supersession authority is unavailable for local review");
      }
      return readRepositoryCandidateSupersessionChain({
        cwd: input.cwd,
        workUnit: workUnitId,
        record,
        exec: input.exec,
      });
    },
    composeAssurance: async (authority: LocalReviewAuthority) => {
      const live = await readLive();
      // A member's assurance is its owning work unit's: same meta, same work
      // class, same rubric. Left unrouted it would fall to the Errand arm below
      // and compose an assurance with no work class at all.
      if (authority.vehicle.kind === "work-unit" || authority.vehicle.kind === "delivery-member") {
        if (live.meta === null) return { status: "refused", diagnostics: ["work-unit meta unavailable"] };
        const composed = composeWorkUnitReviewAssurance(live.meta, methodFiles, rubricPort);
        if (composed.status === "refused") {
          return { status: "refused", diagnostics: [...composed.diagnostics] };
        }
        return {
          status: "resolved",
          assurance: composed.assurance.assurance,
          activity: composed.assurance.activity,
          guidance: projectLocalReviewGuidance(
            composed.guidance.projectAugmentation ?? undefined,
          ),
          diagnostics: [...composed.diagnostics],
        };
      }
      const activity = resolveReviewMethodActivity(bindReviewMethodActivity(methodFiles).activityPort);
      return {
        status: "resolved",
        assurance: { workContext: "errand", workClass: "none" },
        activity: activity.activity,
        guidance: projectLocalReviewGuidance(),
        diagnostics: activity.diagnostics,
      };
    },
    resolvePolicy: () => resolveLocalReviewPolicyBinding(null, [LOCAL_STANDARD_SOURCE]),
    validatePolicySelection: (binding, authority) => {
      validateLocalReviewPolicySelection(binding, {
        source: LOCAL_STANDARD_SOURCE,
        runtimeKind: authority.attestationRuntimeKind,
      });
    },
    validatePolicyAdmission: (request) => validateLocalPolicyAdmission(request, {
      input, resultReader, dispositionStore, operationStore,
    }),
    validateDeliveryAdmission: async (admission) => {
      const before = await readSubmissionBoundaryVersioned(input.cwd, admission.vehicle.workUnitId);
      const reservation = before.boundary?.reservation;
      if (reservation === null || reservation === undefined
        || reservation.target.kind !== "delivery"
        || reservation.target.workUnitId !== admission.vehicle.workUnitId
        || reservation.target.planId !== admission.vehicle.planId
        || !reservation.sources.includes(admission.sourceId)) {
        throw new Error("Local delivery-member review has no matching standard-review reservation.");
      }
      const current = await resolveReviewStatus({
        target: admission.statusTarget,
        ...(admission.ceilingOverride === undefined
          ? {}
          : { ceilingOverride: admission.ceilingOverride }),
        ...(admission.additionalPassAuthorization === undefined ? {}
          : { additionalPassAuthorization: admission.additionalPassAuthorization }),
        coverage: admission.requestedCoverage,
      }, createReviewStatusPort({ ...input, sourceId: admission.sourceId }));
      if (current.nextAction !== "review-local-prepare"
        || canonicalize(current.action) !== canonicalize(admission)) {
        throw new Error("Local delivery-member review no longer has exact driver admission.");
      }
      const after = await readSubmissionBoundaryVersioned(input.cwd, admission.vehicle.workUnitId);
      if (after.version !== before.version) {
        throw new Error("Local delivery-member review authority changed during admission validation.");
      }
      return reservation.obligation;
    },
    describeSource: (operationId, target, coverageAdmission) => createLocalReviewSourceDescriptor({
      exec: input.exec,
      cwd: input.cwd,
      operationId,
      target,
      ...(coverageAdmission.correctionScope === undefined
        ? {}
        : { correctionScope: coverageAdmission.correctionScope }),
    }),
    materialize: (source) => ensureLocalReviewSourceMaterialized({ exec: input.exec, source }),
  };
}
