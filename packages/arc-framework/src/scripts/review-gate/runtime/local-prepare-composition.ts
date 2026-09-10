/** Production adapters for the local review prepare command. */

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
import { LaneSubjectLineageSchema } from "../core/lane-admission.js";
import { createLocalFrontlineSourcePreferenceReader } from
  "../hosts/local/frontline-source-preferences.js";
import { createGhChangeRequestResolutionPort } from "../hosts/github/change-request.js";
import { resolveChangeRequest } from "../change-request.js";
import { resolveConfiguredLanePolicy } from "../policy/lane-policy-config.js";
import { assertEvidenceBoundReviewExecutionAdmission } from "../policy/review-policy-evidence.js";
import { laneProgressOperationId } from "../lane-progress.js";

const LOCAL_STANDARD_SOURCE = {
  sourceKind: "agent",
  qualifier: "standard-review/v1",
} as const;

/** Bind local prepare to the current repository, managed methods, and Git-common stores. */
export function createLocalPrepareDependencies(input: {
  exec: GitExec;
  cwd: string;
}): LocalPrepareDependencies {
  const publisher = new RepositoryGitCommonStatePublisher(input.exec, input.cwd);
  const operationStore = new LocalReviewOperationStateStore(publisher);
  const sourceStore = new RepositoryLocalReviewSourceStore(publisher);
  const dispositionStore = new LocalApprovedDispositionRecordStore(publisher);
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
      laneProgressOperationId(coordinates),
      10_000,
      action,
    ),
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
    resolveLineage: async (vehicle, target, deliveryAdmission, member) => {
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
      return LaneSubjectLineageSchema.parse({
        kind: "head-bound",
        vehicleKind: vehicle.kind,
        vehicleIdentity: vehicle.identity,
        headSha: target.headSha,
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
    validatePolicyAdmission: async ({
      repositoryId,
      target,
      standardReview,
      completedPasses,
      attempts,
      terminalResponsePerformed,
      judgment,
    }) => {
      const settings = (await readConfigSettings(input.cwd)).settings;
      const policy = await resolveConfiguredLanePolicy({
        lane: "standard",
        settings,
        preferences: createLocalFrontlineSourcePreferenceReader({
          cwd: input.cwd,
          exec: input.exec,
          readFile: (path) => readFile(path, "utf8"),
        }),
      });
      const branch = (await input.exec("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
        cwd: input.cwd,
      })).stdout.trim();
      if (branch === "" || branch === "HEAD") {
        throw new Error("Local review requires an attached originating branch.");
      }
      const changeRequest = await resolveChangeRequest({
        headRef: branch,
        headSha: target.headSha,
        baseRef: settings["branch.base"],
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
      const resolution = await assertEvidenceBoundReviewExecutionAdmission({
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
        ...(judgment?.terminus === undefined ? {} : { terminus: judgment.terminus }),
      }, {
        terminalResponsePerformed,
      }, {
        sourceId: "delegated-agent",
        nextAction: "local-prepare",
      }, {
        sources: policy.sources.length === 0 ? ["delegated-agent"] : policy.sources,
        maxPasses: policy.maxPasses,
        resultReader: createRepositoryReviewResultReader(publisher),
        dispositionStore,
        confirmTarget: (attemptedTarget) => Promise.resolve(attemptedTarget),
      });
      return resolution.payload.pass;
    },
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
      }, createReviewStatusPort(input));
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
    describeSource: (operationId, target) => createLocalReviewSourceDescriptor({
      exec: input.exec,
      cwd: input.cwd,
      operationId,
      target,
    }),
    materialize: (source) => ensureLocalReviewSourceMaterialized({ exec: input.exec, source }),
  };
}
