/** Repository-backed adapter for read-only delivery-entry inspection. */

import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { RepositoryGitCommonStatePublisher } from "../git-common-state.js";
import { validateManagedPath } from "../kernel/index.js";
import { resolveActiveWu } from "../release/wu-resolution.js";
import type { GitExec } from "../git/exec.js";
import { createRawGitExec } from "../io-context.js";
import { projectGitCandidateEffectiveTarget } from "../work-unit/git-candidate-effective-target.js";
import { readCandidateRecord } from "../work-unit/candidate-record-store.js";
import { readSubmissionBoundary } from "../work-unit/submission-boundary-store.js";
import { RepositoryDeliveryAuthoringStore } from "./authoring-store.js";
import { resolveExistingDeliveryAuthoringMap } from "./authoring-resolution.js";
import {
  inspectDeliveryCandidateRenewal,
  inspectDeliveryEntry,
  inspectDeliveryPlanLocus,
  inspectDeliveryReopen,
  type DeliveryEntryInspectionDependencies,
  type DeliveryEntryInspectionRequest,
  type DeliveryEntryInspectionResult,
  type DeliveryCandidateRenewalInspectionResult,
  type DeliveryReopenInspectionResult,
} from "./entry-inspection.js";
import type { IntegrationBoundaryLocus } from
  "../../scripts/review-gate/policy/integration-boundary-locus.js";
import {
  RepositoryDeliveryPlanStore,
  RepositoryDeliveryStateStore,
} from "./local-stores.js";
import { DeliveryPlanV1Codec } from "./plan.js";
import { selectPendingDeliveryReviewFixAuthority } from "./review-fix-continuation.js";
import { validateDeliveryStateAgainstPlan } from "./state.js";
import {
  classifyGitDeliveryTerminalDelta,
  readGitDeliveryLifecycleArtifactsAtRef,
} from "./git-lifecycle-contribution.js";
import type { DeliveryTerminalDeltaClassification } from "./lifecycle-contribution.js";
import { projectGitDeliveryTerminalCoordinateAdvance } from
  "./public-review-continuation-git.js";
import {
  GitDeliveryRenameTransitionSource,
  resolveExistingDeliveryPlan,
} from "./plan-resolution.js";
import { LocalApprovedDispositionRecordStore } from
  "../../scripts/review-gate/hosts/local/disposition-record-store.js";

export interface RepositoryDeliveryInspectionInput {
  readonly cwd: string;
  /** Validated repository-relative task-list path. */
  readonly taskListPath: string;
  readonly workUnitId: string;
  readonly baseBranch: string;
  readonly exec: GitExec;
}

function createRepositoryDeliveryInspectionDependencies(
  input: RepositoryDeliveryInspectionInput,
): DeliveryEntryInspectionDependencies {
  const workUnitId = input.workUnitId;
  const publisher = new RepositoryGitCommonStatePublisher(input.exec, input.cwd);
  const planStore = new RepositoryDeliveryPlanStore(publisher, DeliveryPlanV1Codec);
  const stateStore = new RepositoryDeliveryStateStore(publisher);
  const authoringStore = new RepositoryDeliveryAuthoringStore(publisher);
  const transitionSource = new GitDeliveryRenameTransitionSource(createRawGitExec(input.cwd));
  const base = input.baseBranch.trim();
  const authority = base === ""
    ? { status: "unestablished" as const }
    : { status: "established" as const, ref: `refs/heads/${base}` };

  return {
    readTaskList: () => readFile(join(input.cwd, input.taskListPath), "utf8"),
    resolvePlan: async () => {
      const result = await resolveExistingDeliveryPlan({
        planStore: { enumerateCurrent: () => planStore.enumerateCurrentReadOnly() },
        currentWorkUnitId: workUnitId,
        planWorkUnitId: (plan) => plan.workUnitId,
        authority,
        transitionSource,
      });
      return result.status === "match" ? result : { status: result.status };
    },
    resolveAuthoring: async () => {
      const result = await resolveExistingDeliveryAuthoringMap({
        store: { enumerate: () => authoringStore.enumerateReadOnly() },
        currentWorkUnitId: workUnitId,
        authority,
        transitionSource,
      });
      return result.status === "match"
        ? {
            status: "match",
            mapId: result.record.snapshot.mapId,
            candidatePlanDigest: result.record.snapshot.candidatePlanDigest,
          }
        : { status: result.status };
    },
    readState: async (planId) => {
      const result = await stateStore.read(planId);
      return result.status === "refused"
        ? { status: "refused" }
        : result.value === null
          ? { status: "ok", value: null, revision: null }
          : { status: "ok", value: result.value.value, revision: result.value.revision };
    },
    readIntegrationBoundary: async () => ({
      status: "ok",
      value: await readSubmissionBoundary(input.cwd, workUnitId),
    }),
    readCandidate: async (terminalCoordinates) => {
      const record = await readCandidateRecord(input.cwd, workUnitId);
      if (record === null) return { status: "ok", value: null };
      try {
        const projected = await projectGitCandidateEffectiveTarget({
          cwd: input.cwd,
          name: workUnitId,
          baseBranch: input.baseBranch,
          record,
          exec: input.exec,
          rawExec: createRawGitExec(input.cwd),
        });
        if (projected.state !== "current") {
          const terminalDelta = terminalCoordinates === undefined
            ? null
            : await classifyTerminalDelta(input, terminalCoordinates.head);
          return terminalDelta === null
            ? { status: "non-current" }
            : { status: "non-current", terminalDelta };
        }
        const tail = record.transitions.at(-1);
        const terminalCoordinateAdvance = await projectGitDeliveryTerminalCoordinateAdvance({
          cwd: input.cwd,
          exec: input.exec,
          candidate: projected,
          workUnitId,
          baseBranch: input.baseBranch,
          ...(terminalCoordinates === undefined ? {} : { terminalCoordinates }),
        });
        return {
          status: "ok",
          value: {
            candidateId: record.attestation.candidateId,
            subjectDigest: projected.recognizedTarget.subject.subjectDigest,
            verificationResponseCurrent: tail?.transitionKind === "verification-response"
              && tail.newTarget.revision === projected.durableBaselineTarget.revision
              && tail.newTarget.subject.subjectDigest
                === projected.durableBaselineTarget.subject.subjectDigest,
            ...(terminalCoordinateAdvance === undefined ? {} : { terminalCoordinateAdvance }),
          },
        };
      } catch {
        return { status: "refused" };
      }
    },
  };
}

async function classifyTerminalDelta(
  input: RepositoryDeliveryInspectionInput,
  terminalHead: string,
): Promise<DeliveryTerminalDeltaClassification | null> {
  const active = await resolveActiveWu({ cwd: input.cwd });
  const base = input.baseBranch.trim();
  if (active.status !== "resolved" || active.name !== input.workUnitId
    || active.branch === null || base === "") {
    return null;
  }
  return classifyGitDeliveryTerminalDelta({
    exec: input.exec,
    workUnitId: input.workUnitId,
    activeMetaPath: validateManagedPath(active.path),
    protectedBaseRef: `refs/heads/${base}`,
    topRef: `refs/heads/${active.branch}`,
    fromRevision: terminalHead,
    toRevision: "HEAD",
    readDirectory: (path) => readdir(resolve(input.cwd, path)),
    readArtifactsAtRef: (ref, workUnitId) =>
      readGitDeliveryLifecycleArtifactsAtRef(input.exec, ref, workUnitId),
  });
}

/** Inspect one exact work unit through repository-backed read-only delivery stores. */
export async function inspectRepositoryDeliveryEntry(input: {
  readonly cwd: string;
  /** Validated repository-relative task-list path. */
  readonly taskListPath: string;
  readonly request: DeliveryEntryInspectionRequest;
  readonly baseBranch: string;
  readonly exec: GitExec;
}): Promise<DeliveryEntryInspectionResult> {
  const inspected = await inspectDeliveryEntry(input.request, createRepositoryDeliveryInspectionDependencies({
    ...input,
    workUnitId: input.request.workUnitId,
  }));
  if (!("entryMode" in input.request) || input.request.entryMode !== "integrating"
    || inspected.status === "review-fix-verification-required") {
    return inspected;
  }
  const publisher = new RepositoryGitCommonStatePublisher(input.exec, input.cwd);
  let records;
  try {
    records = await new LocalApprovedDispositionRecordStore(publisher).listDispositionRecords();
  } catch {
    return {
      status: "refused",
      nextAction: "stop",
      reason: "review-fix-response-unavailable",
      recommendedActionText:
        "Restore readable approved review-response records before resuming the delivery correction.",
    };
  }
  const selection = selectPendingDeliveryReviewFixAuthority({
    workUnitId: input.request.workUnitId,
    records,
  });
  if (selection.status === "none") return inspected;
  if (selection.status === "refused") {
    return {
      status: "refused",
      nextAction: "stop",
      reason: selection.reason,
      recommendedActionText: selection.reason === "review-fix-response-ambiguous"
        ? "Retain exactly one pending approved delivery-member response before resuming the correction."
        : "Restore the exact approved response and delivery-member binding before resuming the correction.",
    };
  }
  const planStore = new RepositoryDeliveryPlanStore(publisher, DeliveryPlanV1Codec);
  const stateStore = new RepositoryDeliveryStateStore(publisher);
  const [taskList, planRead, stateRead] = await Promise.all([
    readFile(join(input.cwd, input.taskListPath), "utf8").catch(() => null),
    planStore.readCurrent(selection.planId),
    stateStore.read(selection.planId),
  ]);
  const plan = planRead.status === "ok" ? planRead.value : null;
  const state = stateRead.status === "ok" ? stateRead.value : null;
  if (taskList === null || plan === null || state === null
    || plan.workUnitId !== input.request.workUnitId
    || state.value.workUnitId !== input.request.workUnitId
    || inspectDeliveryPlanLocus(taskList, plan).status !== "canonical"
    || validateDeliveryStateAgainstPlan(state.value, plan).status !== "valid"
    || plan.members.filter(
      ({ deliverableId }) => deliverableId === selection.selectedDeliverableId,
    ).length !== 1
    || state.value.members.filter(
      ({ deliverableId }) => deliverableId === selection.selectedDeliverableId,
    ).length !== 1) {
    return {
      status: "refused",
      nextAction: "stop",
      reason: "review-fix-response-stale",
      recommendedActionText:
        "Restore the exact approved response, delivery plan, member, and current state binding before resuming.",
    };
  }
  if (state.value.activeOperation !== null) return inspected;
  return {
    status: "correction-routing-required",
    nextAction: "plan-review-fix",
    planId: selection.planId,
    stateRevision: state.revision,
    selectedDeliverableId: selection.selectedDeliverableId,
    entryMode: "execution",
    recommendedActionText:
      "Continue the exact approved delivery-member correction through its selector-free driver.",
  };
}

/** Classify ordinary reopen from exact repository-backed delivery composition. */
export async function inspectRepositoryDeliveryReopen(input: RepositoryDeliveryInspectionInput)
  : Promise<DeliveryReopenInspectionResult> {
  return inspectDeliveryReopen(
    input.workUnitId,
    createRepositoryDeliveryInspectionDependencies(input),
  );
}

/**
 * Prepare exact public delivery evidence before corrective Candidate attestation.
 *
 * @param input - Repository locus and the versioned public boundary to carry forward.
 * @returns Exact renewal evidence, a not-applicable singleton result, or a closed refusal.
 */
export async function inspectRepositoryDeliveryCandidateRenewal(
  input: RepositoryDeliveryInspectionInput & {
    readonly sourceBoundary: IntegrationBoundaryLocus | null;
  },
): Promise<DeliveryCandidateRenewalInspectionResult> {
  return inspectDeliveryCandidateRenewal(
    input.workUnitId,
    input.sourceBoundary,
    createRepositoryDeliveryInspectionDependencies(input),
  );
}
