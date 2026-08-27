/** Attended preparation, application, and recovery for one ordinary delivery landing. */

import { z } from "zod";

import type { DeliveryHostPort } from "./host.js";
import {
  acceptDeliveryOperationResult,
  checkDeliveryOperationPrecondition,
  reconcileDeliveryOperation,
  reserveDeliveryOperation,
} from "./operation.js";
import {
  assessDeliveryMemberReadiness,
  type DeliveryPositionFactsV1,
} from "./position.js";
import type { DeliveryRevisionedRecord, DeliveryStateStore } from "./ports.js";
import type {
  DeliveryContributionEndpoints,
  DeliveryContributionProofResult,
  DeliveryContributionRefusal,
} from "./contribution-proof.js";
import type {
  DeliveryLandEffectV1,
  DeliveryMergePolicyBindingV1,
  DeliveryOperationSnapshotV1,
  DeliveryPlanV1,
  DeliveryStateV1,
} from "./schema.js";
import {
  DeliveryCanonicalDigestSchema,
  DeliveryChangeRequestV1Schema,
  DeliveryGitObjectIdSchema,
  DeliveryOpaqueIdSchema,
  DeliveryPlanIdSchema,
  DeliveryStateV1Schema,
} from "./schema.js";

const DeliveryRecoverySelectorCommonV1Shape = {
  planId: DeliveryPlanIdSchema,
  operationId: z.string().min(1),
  affectedDeliverableIds: z.array(DeliveryCanonicalDigestSchema).min(1),
};
const DeliveryRecoveryRerunCommonV1Shape = {
  status: z.literal("retryable"),
  recommendedActionText: z.string().min(1),
};

/** Closed executable rerun plus the minimum exact reservation-subject selector. */
export const DeliveryRecoveryRerunV1Schema = z.union([
  z.strictObject({
    ...DeliveryRecoveryRerunCommonV1Shape,
    transition: z.literal("cleared"),
    action: z.literal("delivery-publish"),
    selector: z.strictObject({
      ...DeliveryRecoverySelectorCommonV1Shape,
      operationKind: z.literal("materialize"),
    }),
  }),
  z.strictObject({
    ...DeliveryRecoveryRerunCommonV1Shape,
    transition: z.literal("preserved"),
    action: z.literal("delivery-publish"),
    selector: z.strictObject({
      ...DeliveryRecoverySelectorCommonV1Shape,
      operationKind: z.literal("publish"),
    }),
  }),
  z.strictObject({
    ...DeliveryRecoveryRerunCommonV1Shape,
    transition: z.literal("cleared"),
    action: z.literal("delivery-rematerialize"),
    selector: z.strictObject({
      ...DeliveryRecoverySelectorCommonV1Shape,
      operationKind: z.literal("rewrite"),
      mode: z.literal("review-fix"),
    }),
  }),
  z.strictObject({
    ...DeliveryRecoveryRerunCommonV1Shape,
    transition: z.literal("cleared"),
    action: z.literal("delivery-review-fix-publish"),
    selector: z.strictObject({
      ...DeliveryRecoverySelectorCommonV1Shape,
      operationKind: z.literal("rewrite"),
      mode: z.literal("selected-change"),
    }),
  }),
  z.strictObject({
    ...DeliveryRecoveryRerunCommonV1Shape,
    transition: z.literal("preserved"),
    action: z.literal("delivery-refresh-adopt"),
    selector: z.strictObject({
      ...DeliveryRecoverySelectorCommonV1Shape,
      operationKind: z.literal("rewrite"),
      mode: z.literal("provider-adoption"),
    }),
  }),
  z.strictObject({
    ...DeliveryRecoveryRerunCommonV1Shape,
    transition: z.literal("preserved"),
    action: z.literal("delivery-refresh-execute"),
    selector: z.strictObject({
      ...DeliveryRecoverySelectorCommonV1Shape,
      operationKind: z.literal("rewrite"),
      mode: z.literal("provider-refresh"),
    }),
  }),
  z.strictObject({
    ...DeliveryRecoveryRerunCommonV1Shape,
    transition: z.literal("cleared"),
    action: z.literal("delivery-land-prepare"),
    selector: z.strictObject({
      ...DeliveryRecoverySelectorCommonV1Shape,
      operationKind: z.literal("land"),
      mode: z.literal("sequential"),
    }),
  }),
  z.strictObject({
    ...DeliveryRecoveryRerunCommonV1Shape,
    transition: z.literal("cleared"),
    action: z.literal("delivery-native-land-select"),
    selector: z.strictObject({
      ...DeliveryRecoverySelectorCommonV1Shape,
      operationKind: z.literal("land"),
      mode: z.literal("native"),
    }),
  }),
  z.strictObject({
    ...DeliveryRecoveryRerunCommonV1Shape,
    transition: z.literal("cleared"),
    action: z.literal("delivery-native-land-select"),
    selector: z.strictObject({
      ...DeliveryRecoverySelectorCommonV1Shape,
      operationKind: z.literal("land"),
      mode: z.literal("sequential"),
    }),
  }),
  z.strictObject({
    ...DeliveryRecoveryRerunCommonV1Shape,
    transition: z.literal("preserved"),
    action: z.literal("delivery-teardown"),
    selector: z.strictObject({
      ...DeliveryRecoverySelectorCommonV1Shape,
      operationKind: z.literal("teardown"),
    }),
  }),
  z.strictObject({
    ...DeliveryRecoveryRerunCommonV1Shape,
    transition: z.literal("cleared"),
    action: z.literal("delivery-top-remedy"),
    selector: z.strictObject({
      ...DeliveryRecoverySelectorCommonV1Shape,
      operationKind: z.literal("top-remedy"),
    }),
  }),
]);
export type DeliveryRecoveryRerunV1 = z.infer<typeof DeliveryRecoveryRerunV1Schema>;

const DeliveryRecoveryStateRecordV1Schema = z.strictObject({
  revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  value: DeliveryStateV1Schema,
});
const DeliveryRecoveryReadyTopV1Schema = z.strictObject({
  status: z.literal("ready"),
  request: z.strictObject({
    binding: DeliveryChangeRequestV1Schema,
    repository: DeliveryOpaqueIdSchema,
    headRef: DeliveryOpaqueIdSchema,
    headSha: DeliveryGitObjectIdSchema,
    baseRef: DeliveryOpaqueIdSchema,
    state: z.enum(["open", "merged", "closed"]),
  }),
});
const DeliveryRecoveryRemedyTopV1Schema = z.strictObject({
  status: z.literal("refused"),
  reason: z.literal("top-target-mismatch"),
  remedy: z.strictObject({
    nextAction: z.enum(["retarget", "reopen-and-retarget"]),
    repository: DeliveryOpaqueIdSchema,
    changeRequestId: DeliveryOpaqueIdSchema,
    protectedBaseRef: DeliveryOpaqueIdSchema,
  }),
});
type DeliveryRecoveryTeardownContinuationV1 =
  | {
      readonly nextAction: "terminal-checkpoint";
      readonly top: z.infer<typeof DeliveryRecoveryReadyTopV1Schema>;
    }
  | {
      readonly nextAction: "retarget" | "reopen-and-retarget";
      readonly top: z.infer<typeof DeliveryRecoveryRemedyTopV1Schema>;
    };
const DeliveryRecoveryBlockedV1Schema = z.union([
  z.strictObject({
    status: z.literal("blocked"),
    reason: z.enum(["contribution-conflicted", "contribution-diverged"]),
    paths: z.array(z.string()).readonly(),
    recommendedActionText: z.string().min(1),
  }),
  z.strictObject({
    status: z.literal("blocked"),
    reason: z.literal("native-effect-partial"),
    affectedDeliverableIds: z.array(DeliveryCanonicalDigestSchema).readonly(),
    recommendedActionText: z.string().min(1),
  }),
  z.strictObject({
    status: z.literal("blocked"),
    reason: z.enum([
      "observation-unavailable",
      "contribution-endpoints-unverified",
      "git-failure",
      "merge-tree-write-tree-unsupported",
      "retry-state-persistence-failed",
      "operation-result-ambiguous",
      "result-persistence-failed",
      "top-observation-unavailable",
      "native-effect-pending",
      "native-effect-ambiguous",
    ]),
    recommendedActionText: z.string().min(1),
  }),
]);

/** Canonical strict result envelope for interrupted delivery-operation recovery. */
export const DeliveryRecoveryResultV1Schema = z.union([
  DeliveryRecoveryRerunV1Schema,
  z.strictObject({
    status: z.literal("applied"),
    state: DeliveryRecoveryStateRecordV1Schema,
    nextAction: z.literal("read-position"),
  }),
  z.strictObject({
    status: z.literal("applied"),
    state: DeliveryRecoveryStateRecordV1Schema,
    nextAction: z.literal("terminal-checkpoint"),
    top: DeliveryRecoveryReadyTopV1Schema,
  }),
  z.strictObject({
    status: z.literal("applied"),
    state: DeliveryRecoveryStateRecordV1Schema,
    nextAction: z.enum(["retarget", "reopen-and-retarget"]),
    top: DeliveryRecoveryRemedyTopV1Schema,
  }),
  DeliveryRecoveryBlockedV1Schema,
]);
export type DeliveryRecoveryResultV1 = z.infer<typeof DeliveryRecoveryResultV1Schema>;

/** Exact transient presentation authorized by the workflow interlock. */
export interface PreparedDeliveryLanding {
  readonly operationId: string;
  readonly planId: string;
  readonly deliverableId: string;
  readonly head: string;
  readonly repository: string;
  readonly changeRequestId: string;
  readonly mergeStrategy: "merge" | "rebase" | "squash";
  readonly settledReviewState: string;
  readonly consequence: string;
  readonly releaseMergeLock: boolean;
}

/** Fresh review admission is an injected authority; delivery stores only its transient presentation. */
export interface DeliveryLandingReadinessPort {
  assess(input: {
    readonly planId: string;
    readonly deliverableId: string;
    readonly workUnitId: string;
    readonly repository: string;
    readonly changeRequestId: string;
    readonly head: string;
  }): Promise<
    | { readonly status: "ready"; readonly settledReviewState: string }
    | { readonly status: "refused" }
  >;
}

/** Merge-lock transition kept separate from unconditional readiness admission. */
export interface DeliveryLandingLockPort {
  release(input: { readonly repository: string; readonly changeRequestId: string }): Promise<
    { readonly status: "released" | "not-configured" } | { readonly status: "refused" }
  >;
}

/** Repository-derived facts acquired at each landing mutation boundary. */
export interface DeliveryLandingObservationPort {
  revalidateMergePolicy(binding: DeliveryMergePolicyBindingV1): Promise<
    { readonly status: "exact" | "refused" }
  >;
  observeSelection(): Promise<
    | {
        readonly status: "observed";
        readonly facts: DeliveryPositionFactsV1;
        readonly snapshot: DeliveryOperationSnapshotV1;
      }
    | { readonly status: "refused" }
  >;
  observeLandedResult(input: {
    readonly mergeCommitSha: string;
    readonly strategy: "merge" | "rebase" | "squash";
    readonly beforeMember: NonNullable<DeliveryOperationSnapshotV1["members"][number]["coordinates"]>;
  }): Promise<{
    readonly predecessor: NonNullable<NonNullable<DeliveryOperationSnapshotV1["target"]>["coordinates"]>;
    readonly member: NonNullable<NonNullable<DeliveryOperationSnapshotV1["target"]>["coordinates"]>;
  } | null>;
  proveLandedContribution(input: DeliveryContributionEndpoints): Promise<DeliveryContributionProofResult>;
}

type DeliveryLandingRefusal =
  | DeliveryContributionRefusal
  | { readonly status: "refused"; readonly reason: "landing-refused" };

function landingRefused(): DeliveryLandingRefusal {
  return { status: "refused", reason: "landing-refused" };
}

/** Fresh operation observation selected from the persisted operation kind. */
export type DeliveryRecoveryObservationRefusal =
  | DeliveryContributionRefusal
  | { readonly status: "refused"; readonly reason: "observation-unavailable" }
  | {
      readonly status: "refused";
      readonly reason: "native-effect-pending" | "native-effect-ambiguous";
    }
  | {
      readonly status: "refused";
      readonly reason: "native-effect-partial";
      readonly affectedDeliverableIds: readonly string[];
    };

export interface DeliveryRecoveryObservationPort {
  observe(): Promise<
    | {
        readonly status: "observed";
        readonly value: unknown;
        readonly continuation?: DeliveryRecoveryTeardownContinuationV1;
      }
    | DeliveryRecoveryObservationRefusal
  >;
}

function memberSnapshot(state: DeliveryStateV1, deliverableId: string): DeliveryOperationSnapshotV1 | null {
  const member = state.members.find((candidate) => candidate.deliverableId === deliverableId);
  return member === undefined ? null : {
    target: state.target,
    members: [{
      deliverableId: member.deliverableId,
      ref: member.ref,
      changeRequest: member.changeRequest,
      coordinates: member.coordinates,
    }],
  };
}

async function exactOpenRequest(input: {
  readonly host: DeliveryHostPort;
  readonly repository: string;
  readonly member: DeliveryStateV1["members"][number];
  readonly baseRef: string;
}): Promise<{ readonly status: "exact"; readonly changeRequestId: string } | { readonly status: "refused" }> {
  if (input.member.changeRequest === null || input.member.ref === null || input.member.coordinates === null) {
    return { status: "refused" };
  }
  const observed = await input.host.readRequest(input.repository, input.member.changeRequest);
  return observed.status === "observed"
    && observed.request.state === "open"
    && observed.request.repository === input.repository
    && observed.request.headRepository === input.repository
    && observed.request.headRef === input.member.ref.replace(/^refs\/heads\//u, "")
    && observed.request.headSha === input.member.coordinates.head
    && observed.request.baseRef === input.baseRef.replace(/^refs\/heads\//u, "")
    ? { status: "exact", changeRequestId: observed.request.binding.changeRequestId }
    : { status: "refused" };
}

/** Prepare one exact non-terminal landing without releasing a lock or merging. */
export async function prepareDeliveryLanding(input: {
  readonly plan: DeliveryPlanV1;
  readonly current: DeliveryRevisionedRecord<DeliveryStateV1>;
  readonly facts: DeliveryPositionFactsV1;
  readonly selectedDeliverableId: string;
  readonly repository: string;
  readonly baseRef: string;
  readonly targetRef: string;
  readonly mergePolicy: DeliveryMergePolicyBindingV1;
  readonly releaseMergeLock: boolean;
  readonly stateStore: Pick<DeliveryStateStore<DeliveryStateV1>, "publish">;
  readonly host: DeliveryHostPort;
  readonly readiness: DeliveryLandingReadinessPort;
}): Promise<{ readonly status: "prepared"; readonly presentation: PreparedDeliveryLanding } | {
  readonly status: "refused";
}> {
  const memberIndex = input.plan.members.findIndex((member) => member.deliverableId === input.selectedDeliverableId);
  if (memberIndex < 0 || memberIndex === input.plan.members.length - 1) return { status: "refused" };
  if (assessDeliveryMemberReadiness(
    input.plan, input.current.value, input.facts, input.selectedDeliverableId,
  ).status !== "ready") return { status: "refused" };
  const member = input.current.value.members[memberIndex];
  if (member === undefined) return { status: "refused" };
  const request = await exactOpenRequest({
    host: input.host,
    repository: input.repository,
    member,
    baseRef: input.baseRef,
  });
  if (request.status !== "exact" || member.coordinates === null || member.changeRequest === null) {
    return { status: "refused" };
  }
  const readiness = await input.readiness.assess({
    planId: input.plan.planId,
    deliverableId: member.deliverableId,
    workUnitId: input.plan.workUnitId,
    repository: input.repository,
    changeRequestId: request.changeRequestId,
    head: member.coordinates.head,
  });
  if (readiness.status !== "ready") return { status: "refused" };
  const before = memberSnapshot(input.current.value, member.deliverableId);
  if (before === null) return { status: "refused" };
  const effect: DeliveryLandEffectV1 = {
    providerId: member.changeRequest.providerId,
    repository: input.repository,
    changeRequestId: request.changeRequestId,
    headSha: member.coordinates.head,
    baseRef: input.baseRef.replace(/^refs\/heads\//u, ""),
    targetRef: input.targetRef,
    strategy: input.mergePolicy.method,
    mergePolicy: input.mergePolicy,
  };
  const operationId = crypto.randomUUID();
  const requested = {
    ...before,
    target: before.target === null ? null : { ...before.target, ref: input.targetRef },
  };
  const reserved = reserveDeliveryOperation(input.current, input.plan, {
    operationId,
    kind: "land",
    mode: "sequential",
    affectedDeliverableIds: [member.deliverableId],
    expectedStateRevision: input.current.revision,
    before,
    requested,
    effect,
  });
  if (reserved.status !== "reserved") return { status: "refused" };
  const persisted = await input.stateStore.publish(input.plan.planId, reserved.state, input.current.revision);
  if (persisted.status !== "ok") return { status: "refused" };
  return {
    status: "prepared",
    presentation: {
      operationId,
      planId: input.plan.planId,
      deliverableId: member.deliverableId,
      head: member.coordinates.head,
      repository: input.repository,
      changeRequestId: request.changeRequestId,
      mergeStrategy: input.mergePolicy.method,
      settledReviewState: readiness.settledReviewState,
      consequence: `Merge delivery member ${member.deliverableId} at exact head ${member.coordinates.head}.`,
      releaseMergeLock: input.releaseMergeLock,
    },
  };
}

/** Apply one previously prepared exact landing after workflow authorization. */
export async function applyDeliveryLanding(input: {
  readonly plan: DeliveryPlanV1;
  readonly current: DeliveryRevisionedRecord<DeliveryStateV1>;
  readonly approved: PreparedDeliveryLanding;
  readonly stateStore: Pick<DeliveryStateStore<DeliveryStateV1>, "publish">;
  readonly host: DeliveryHostPort;
  readonly readiness: DeliveryLandingReadinessPort;
  readonly lock: DeliveryLandingLockPort;
  readonly observation: DeliveryLandingObservationPort;
}): Promise<{ readonly status: "landed"; readonly state: DeliveryRevisionedRecord<DeliveryStateV1> } | {
  readonly status: "refused";
  readonly reason: "landing-refused";
} | DeliveryContributionRefusal | DeliveryRecoveryResultV1> {
  const operation = input.current.value.activeOperation;
  if (operation?.kind !== "land" || operation.mode !== "sequential"
    || operation.operationId !== input.approved.operationId
    || operation.affectedDeliverableIds[0] !== input.approved.deliverableId
    || operation.effect.headSha !== input.approved.head
    || operation.effect.repository !== input.approved.repository
    || operation.effect.changeRequestId !== input.approved.changeRequestId
    || operation.effect.strategy !== input.approved.mergeStrategy) return landingRefused();
  const member = input.current.value.members.find((candidate) => candidate.deliverableId === input.approved.deliverableId);
  if (member === undefined || member.coordinates === null) return landingRefused();
  const memberHead = member.coordinates.head;
  const stateWithoutReservation = { ...input.current.value, activeOperation: null };
  const observeReady = async (): Promise<boolean> => {
    const fresh = await input.observation.observeSelection();
    return fresh.status === "observed"
      && assessDeliveryMemberReadiness(
        input.plan, stateWithoutReservation, fresh.facts, member.deliverableId,
      ).status === "ready"
      && checkDeliveryOperationPrecondition(input.current, fresh.snapshot).status === "ready"
      && (await exactOpenRequest({
        host: input.host,
        repository: input.approved.repository,
        member,
        baseRef: `refs/heads/${operation.effect.baseRef}`,
      })).status === "exact"
      && (await input.readiness.assess({
        planId: input.plan.planId,
        deliverableId: member.deliverableId,
        workUnitId: input.plan.workUnitId,
        repository: input.approved.repository,
        changeRequestId: input.approved.changeRequestId,
        head: memberHead,
      })).status === "ready";
  };
  const proveNotApplied = async (): Promise<boolean> => {
    const fresh = await input.observation.observeSelection();
    return fresh.status === "observed"
      && checkDeliveryOperationPrecondition(input.current, fresh.snapshot).status === "ready"
      && (await exactOpenRequest({
        host: input.host,
        repository: input.approved.repository,
        member,
        baseRef: `refs/heads/${operation.effect.baseRef}`,
      })).status === "exact";
  };
  if (!(await observeReady())) return landingRefused();
  if (input.approved.releaseMergeLock
    && (await input.lock.release({
      repository: input.approved.repository,
      changeRequestId: input.approved.changeRequestId,
    })).status === "refused") return landingRefused();
  if (!(await observeReady())) return landingRefused();
  if ((await input.observation.revalidateMergePolicy(operation.effect.mergePolicy)).status !== "exact") {
    return landingRefused();
  }
  const submitted = await input.host.mergeRequest(operation.effect);
  if (submitted.status !== "submitted") {
    if (submitted.reason !== "native-stack-required") return landingRefused();
    if (!(await proveNotApplied())) {
      return {
        status: "blocked",
        reason: "operation-result-ambiguous",
        recommendedActionText:
          "Retain the sequential reservation; the semantic native refusal could not be proved not applied.",
      };
    }
    const cleared = await input.stateStore.publish(input.plan.planId, {
      ...input.current.value,
      activeOperation: null,
    }, input.current.revision);
    if (cleared.status !== "ok") {
      return {
        status: "blocked",
        reason: "retry-state-persistence-failed",
        recommendedActionText:
          "Retain and reconcile the sequential reservation; native-selection transition persistence failed.",
      };
    }
    return {
      status: "retryable",
      transition: "cleared",
      action: "delivery-native-land-select",
      selector: {
        planId: input.plan.planId,
        operationId: operation.operationId,
        affectedDeliverableIds: operation.affectedDeliverableIds,
        operationKind: "land",
        mode: "sequential",
      },
      recommendedActionText:
        "Rerun `arc delivery native land-select`; it will freshly observe the canonical remaining stack.",
    };
  }
  const merged = member.changeRequest === null
    ? { status: "refused" as const }
    : await input.host.readRequest(input.approved.repository, member.changeRequest);
  if (merged.status !== "observed" || merged.request.state !== "merged"
    || merged.request.repository !== operation.effect.repository
    || merged.request.headRepository !== operation.effect.repository
    || merged.request.binding.changeRequestId !== operation.effect.changeRequestId
    || member.ref === null || merged.request.headRef !== member.ref.replace(/^refs\/heads\//u, "")
    || merged.request.headSha !== operation.effect.headSha
    || merged.request.baseRef !== operation.effect.baseRef) return landingRefused();
  const memberCoordinates = member.coordinates;
  const beforeTarget = operation.before.target?.coordinates;
  const mergeCommitSha = merged.request.mergeCommitSha;
  if (beforeTarget === null || beforeTarget === undefined || mergeCommitSha === null
    || mergeCommitSha === undefined) return landingRefused();
  const landed = await input.observation.observeLandedResult({
    mergeCommitSha,
    strategy: operation.effect.strategy,
    beforeMember: memberCoordinates,
  });
  if (landed === null) return landingRefused();
  const proof = await input.observation.proveLandedContribution({
    before: { predecessor: beforeTarget, member: memberCoordinates },
    after: landed,
  });
  if (proof.status !== "accepted") return proof;
  const observed: DeliveryOperationSnapshotV1 = {
    target: { ref: operation.effect.targetRef, coordinates: landed.member },
    members: operation.before.members,
  };
  const accepted = acceptDeliveryOperationResult(input.current, {
    kind: "land",
    effect: operation.effect,
    outcome: "applied",
    snapshot: observed,
  });
  if (accepted.status !== "applied") return landingRefused();
  const persisted = await input.stateStore.publish(input.plan.planId, accepted.state, input.current.revision);
  return persisted.status === "ok" ? { status: "landed", state: persisted.value } : landingRefused();
}

function recoveryRerun(state: DeliveryStateV1): DeliveryRecoveryRerunV1 | null {
  const operation = state.activeOperation;
  if (operation === null) return null;
  const selector = {
    planId: state.planId,
    operationId: operation.operationId,
    affectedDeliverableIds: operation.affectedDeliverableIds,
  };
  switch (operation.kind) {
    case "materialize":
      return {
        status: "retryable",
        transition: "cleared",
        action: "delivery-publish",
        selector: { ...selector, operationKind: "materialize" },
        recommendedActionText:
          "Rerun `arc delivery publish` for the exact materialization reservation subject.",
      };
    case "publish":
      return {
        status: "retryable",
        transition: "preserved",
        action: "delivery-publish",
        selector: { ...selector, operationKind: "publish" },
        recommendedActionText: "Rerun `arc delivery publish` for the exact publish reservation subject.",
      };
    case "rewrite":
      return operation.mode === "review-fix"
        ? {
            status: "retryable",
            transition: "cleared",
            action: "delivery-rematerialize",
            selector: { ...selector, operationKind: "rewrite", mode: "review-fix" },
            recommendedActionText:
              "Rerun `arc delivery rematerialize` for the exact review-fix reservation subject.",
          }
        : operation.mode === "selected-change"
          ? {
              status: "retryable",
              transition: "cleared",
              action: "delivery-review-fix-publish",
              selector: { ...selector, operationKind: "rewrite", mode: "selected-change" },
              recommendedActionText:
                "Rerun `arc delivery review-fix publish` for the exact selected-member reservation subject.",
            }
          : operation.mode === "provider-adoption"
            ? {
                status: "retryable",
                transition: "preserved",
                action: "delivery-refresh-adopt",
                selector: { ...selector, operationKind: "rewrite", mode: "provider-adoption" },
                recommendedActionText:
                  "Rerun `arc delivery refresh adopt` for the exact provider-adoption reservation subject.",
              }
            : {
                status: "retryable",
                transition: "preserved",
                action: "delivery-refresh-execute",
                selector: { ...selector, operationKind: "rewrite", mode: "provider-refresh" },
                recommendedActionText:
                  "Rerun `arc delivery refresh execute` for the exact provider-refresh reservation subject.",
              };
    case "teardown":
      return {
        status: "retryable",
        transition: "preserved",
        action: "delivery-teardown",
        selector: { ...selector, operationKind: "teardown" },
        recommendedActionText: "Rerun `arc delivery teardown` for the exact teardown reservation subject.",
      };
    case "land":
      return operation.mode === "sequential"
        ? {
            status: "retryable",
            transition: "cleared",
            action: "delivery-land-prepare",
            selector: { ...selector, operationKind: "land", mode: "sequential" },
            recommendedActionText:
              "Rerun `arc delivery land prepare` for the exact sequential landing reservation subject.",
          }
        : {
            status: "retryable",
            transition: "cleared",
            action: "delivery-native-land-select",
            selector: { ...selector, operationKind: "land", mode: "native" },
            recommendedActionText:
              "Rerun `arc delivery native land-select` for the exact native landing reservation subject.",
          };
    case "top-remedy":
      return {
        status: "retryable",
        transition: "cleared",
        action: "delivery-top-remedy",
        selector: { ...selector, operationKind: "top-remedy" },
        recommendedActionText: "Rerun `arc delivery top-remedy` for the exact top-remedy reservation subject.",
      };
  }
}

/** Reconcile one interrupted operation; an attended land retry always routes back to prepare. */
export async function reconcileDeliveryExecution(input: {
  readonly planId: string;
  readonly current: DeliveryRevisionedRecord<DeliveryStateV1>;
  readonly observation: DeliveryRecoveryObservationPort;
  readonly stateStore: Pick<DeliveryStateStore<DeliveryStateV1>, "publish">;
}): Promise<DeliveryRecoveryResultV1> {
  const observed = await input.observation.observe();
  if (observed.status !== "observed") {
    return {
      ...observed,
      status: "blocked",
      recommendedActionText: "The reserved operation result is unavailable; retain the reservation.",
    };
  }
  const operation = input.current.value.activeOperation;
  const highestTeardown = operation?.kind === "teardown"
    && operation.affectedDeliverableIds.length === 1
    && operation.affectedDeliverableIds[0] === input.current.value.members.at(-2)?.deliverableId;
  const reconciled = reconcileDeliveryOperation(input.current, observed.value);
  if (reconciled.status === "retry") {
    if (observed.continuation !== undefined) {
      return {
        status: "blocked",
        reason: "operation-result-ambiguous",
        recommendedActionText: "The reserved operation result is ambiguous; inspect it explicitly.",
      };
    }
    if (operation?.kind === "land" && operation.mode === "native" && operation.effectIdentity === null) {
      return {
        status: "blocked",
        reason: "native-effect-ambiguous",
        recommendedActionText:
          "The native effect has no persisted identity; retain the reservation and do not resubmit.",
      };
    }
    const rerun = recoveryRerun(input.current.value);
    if (rerun === null) {
      return {
        status: "blocked",
        reason: "operation-result-ambiguous",
        recommendedActionText: "The reserved operation result is ambiguous; inspect it explicitly.",
      };
    }
    if (rerun.transition === "preserved") return rerun;
    const cleared = await input.stateStore.publish(input.planId, {
      ...input.current.value,
      activeOperation: null,
    }, input.current.revision);
    if (cleared.status !== "ok") {
      return {
        status: "blocked",
        reason: "retry-state-persistence-failed",
        recommendedActionText: "Retry-state persistence failed; retain and reconcile the reservation.",
      };
    }
    return rerun;
  }
  if (reconciled.status !== "adopt") {
    return {
      status: "blocked",
      reason: "operation-result-ambiguous",
      recommendedActionText: "The reserved operation result is ambiguous; inspect it explicitly.",
    };
  }
  if (highestTeardown && observed.continuation === undefined) {
    return {
      status: "blocked",
      reason: "top-observation-unavailable",
      recommendedActionText: "Top observation is unavailable; retain the highest teardown reservation.",
    };
  }
  if (!highestTeardown && observed.continuation !== undefined) {
    return {
      status: "blocked",
      reason: "operation-result-ambiguous",
      recommendedActionText: "The reserved operation result is ambiguous; inspect it explicitly.",
    };
  }
  const persisted = await input.stateStore.publish(input.planId, reconciled.state, input.current.revision);
  return persisted.status === "ok"
    ? observed.continuation === undefined
      ? { status: "applied", state: persisted.value, nextAction: "read-position" }
      : { status: "applied", state: persisted.value, ...observed.continuation }
    : {
        status: "blocked",
        reason: "result-persistence-failed",
        recommendedActionText: "Result persistence failed; retain and reconcile the reservation.",
      };
}
