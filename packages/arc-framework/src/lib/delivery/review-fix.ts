/** Provider-neutral routing and selected-member publication for delivery review fixes. */

import { canonicalDigest, canonicalize } from "../kernel/index.js";
import type { DeliveryRevisionedRecord, DeliveryStateStore } from "./ports.js";
import type { DeliveryEligibilityCoordinates } from "./eligibility.js";
import type { DeliveryNativeStackObservation } from "./native-stack.js";
import type { DeliveryPositionFactsV1 } from "./position.js";
import {
  DeliveryCanonicalDigestSchema,
  DeliveryStateV1Schema,
  type DeliveryPlanV1,
  type DeliveryStateV1,
} from "./schema.js";
import { deriveDeliveryProviderRefreshSubject } from "./provider-refresh-observation.js";
import { executeDeliverySuffixRewrite } from "./suffix-reconciliation.js";
import { validateDeliveryStateAgainstPlan } from "./state.js";

type StateWriter = Pick<DeliveryStateStore<DeliveryStateV1>, "publish">;

/** Exact command input carried until one review-fix verification continuation is consumed. */
export interface DeliveryReviewFixVerificationAcknowledgementInput {
  readonly planId: string;
  readonly selectedDeliverableId: string;
  readonly memberDeliverableIds: readonly string[];
  readonly expectedStateRevision: number;
  readonly continuationDigest: string;
}

/** Provider-neutral verification work projected after a dependent review-fix refresh settles. */
export interface DeliveryReviewFixVerificationContinuation {
  readonly selectedDeliverableId: string;
  readonly nextAction: "verify-review-fix";
  readonly verification: {
    readonly memberDeliverableIds: readonly string[];
    readonly tier1Required: true;
  };
  readonly acknowledgementInput: DeliveryReviewFixVerificationAcknowledgementInput;
}

export type DeliveryReviewFixRouteResult =
  | {
      readonly status: "planned";
      readonly route: "provider-refresh";
      readonly selectedDeliverableId: string;
      readonly affectedDeliverableIds: readonly string[];
      readonly nextAction: "publish-selected-member";
      readonly candidateRequirements: {
        readonly requiredAncestorHeads: readonly string[];
      };
      readonly recommendedActionText: string;
    }
  | {
      readonly status: "planned";
      readonly route: "rematerialize";
      readonly selectedDeliverableId: string;
      readonly affectedDeliverableIds: readonly string[];
      readonly nextAction: "rematerialize";
      readonly recommendedActionText: string;
    }
  | {
      readonly status: "refused";
      readonly reason: string;
      readonly recommendedActionText: string;
    };

type DeliveryReviewFixRouteInput = {
  readonly plan: DeliveryPlanV1;
  readonly state: DeliveryStateV1;
  readonly facts: DeliveryPositionFactsV1;
  readonly selectedDeliverableId: string;
  readonly observation: DeliveryNativeStackObservation;
};

/** Select linked single-member publication or complete unlinked rematerialization from fresh presentation. */
export function planDeliveryReviewFixRoute(
  input: DeliveryReviewFixRouteInput,
): DeliveryReviewFixRouteResult {
  if (input.state.activeOperation !== null
    || validateDeliveryStateAgainstPlan(input.state, input.plan).status === "refused") {
    return {
      status: "refused",
      reason: input.state.activeOperation === null ? "position-mismatch" : "operation-active",
      recommendedActionText: "Restore one exact idle delivery state before routing the review fix.",
    };
  }
  const subject = deriveDeliveryProviderRefreshSubject({
    plan: input.plan,
    state: input.state,
    facts: input.facts,
  });
  if (subject.status === "refused") {
    return {
      status: "refused",
      reason: subject.reason,
      recommendedActionText: "Restore one exact bound non-terminal remainder before routing the review fix.",
    };
  }
  const selectedIndex = subject.subject.affectedDeliverableIds.indexOf(input.selectedDeliverableId);
  if (selectedIndex < 0) {
    return {
      status: "refused",
      reason: "selected-member-invalid",
      recommendedActionText: "Select one currently bound non-terminal delivery member.",
    };
  }
  const affectedDeliverableIds = subject.subject.affectedDeliverableIds.slice(selectedIndex);
  if (input.observation.status === "registered") {
    const selectedStateIndex = input.state.members.findIndex(
      ({ deliverableId }) => deliverableId === input.selectedDeliverableId,
    );
    const selected = input.state.members[selectedStateIndex];
    const predecessor = selectedStateIndex > 0 ? input.state.members[selectedStateIndex - 1] : undefined;
    if (selected?.coordinates === null || selected?.coordinates === undefined
      || predecessor?.coordinates === null) {
      return {
        status: "refused",
        reason: "position-mismatch",
        recommendedActionText: "Restore one exact selected member and predecessor before authoring its correction.",
      };
    }
    return {
      status: "planned",
      route: "provider-refresh",
      selectedDeliverableId: input.selectedDeliverableId,
      affectedDeliverableIds,
      nextAction: "publish-selected-member",
      candidateRequirements: {
        requiredAncestorHeads: [
          selected.coordinates.head,
          ...(predecessor === undefined ? [] : [predecessor.coordinates.head]),
        ],
      },
      recommendedActionText:
        "Author the selected candidate from every returned required ancestor, publish only that member, then let "
        + "ARC execute and settle the exact provider-native dependent suffix refresh.",
    };
  }
  if (input.observation.status === "unregistered") {
    return {
      status: "planned",
      route: "rematerialize",
      selectedDeliverableId: input.selectedDeliverableId,
      affectedDeliverableIds,
      nextAction: "rematerialize",
      recommendedActionText:
        "Apply the approved fix to the top authoring locus, cut the complete suffix, then run delivery "
        + "rematerialization.",
    };
  }
  return {
    status: "refused",
    reason: `presentation-${input.observation.status}`,
    recommendedActionText:
      "Restore one exact registered or unregistered native-stack observation before choosing a mutation route.",
  };
}

export interface DeliveryReviewFixPublicationDependencies {
  inspectCandidate(): Promise<(DeliveryEligibilityCoordinates & { readonly trackedDirty: boolean }) | null>;
  observeCandidateRef(): Promise<DeliveryEligibilityCoordinates | null>;
  readAncestry(ancestor: string, descendant: string): Promise<"ancestor" | "not-ancestor" | "unresolvable">;
  revalidateLifecycle(): Promise<{ readonly status: "ok" | "refused" }>;
  reobserveAuthority(): Promise<
    | {
        readonly status: "observed";
        readonly facts: DeliveryPositionFactsV1;
        readonly observation: DeliveryNativeStackObservation;
      }
    | { readonly status: "refused" }
  >;
  rewriteRef(input: {
    readonly ref: string;
    readonly beforeHead: string;
    readonly requestedHead: string;
  }): Promise<{ readonly status: "rewritten" | "adopted" | "refused" }>;
  observePublishedMember(input: { readonly ref: string; readonly head: string }): Promise<boolean>;
  stateStore: StateWriter;
}

export type DeliveryReviewFixVerificationAcknowledgementResult =
  | {
      readonly status: "acknowledged" | "already-acknowledged";
      readonly state: DeliveryRevisionedRecord<DeliveryStateV1>;
      readonly nextAction: "continue-work-unit";
    }
  | { readonly status: "refused"; readonly reason: string };

/** Clear one exact pending review-fix verification continuation after its workflow consumes it. */
export async function acknowledgeDeliveryReviewFixVerification(input: {
  readonly plan: DeliveryPlanV1;
  readonly current: DeliveryRevisionedRecord<DeliveryStateV1>;
  readonly selectedDeliverableId: string;
  readonly memberDeliverableIds: readonly string[];
  readonly expectedStateRevision: number;
  readonly continuationDigest: string;
  readonly stateStore: StateWriter;
}): Promise<DeliveryReviewFixVerificationAcknowledgementResult> {
  const state = DeliveryStateV1Schema.safeParse(input.current.value);
  const selected = DeliveryCanonicalDigestSchema.safeParse(input.selectedDeliverableId);
  const members = DeliveryCanonicalDigestSchema.array().min(1).safeParse(input.memberDeliverableIds);
  const digest = DeliveryCanonicalDigestSchema.safeParse(input.continuationDigest);
  if (!state.success || !selected.success || !members.success || !digest.success
    || !Number.isSafeInteger(input.current.revision) || input.current.revision <= 0
    || !Number.isSafeInteger(input.expectedStateRevision) || input.expectedStateRevision <= 0
    || validateDeliveryStateAgainstPlan(input.current.value, input.plan).status === "refused") {
    return { status: "refused", reason: "acknowledgement-invalid" };
  }

  if (input.current.revision === input.expectedStateRevision) {
    if (state.data.pendingReviewFixVerification === null) {
      return { status: "refused", reason: "verification-not-pending" };
    }
    if (state.data.pendingReviewFixVerification.selectedDeliverableId !== selected.data) {
      return { status: "refused", reason: "selected-deliverable-mismatch" };
    }
    if (canonicalize(state.data.pendingReviewFixVerification.memberDeliverableIds)
      !== canonicalize(members.data)) {
      return { status: "refused", reason: "verification-members-mismatch" };
    }
    if (canonicalDigest(state.data) !== digest.data) {
      return { status: "refused", reason: "continuation-mismatch" };
    }
    const cleared = DeliveryStateV1Schema.safeParse({
      ...state.data,
      pendingReviewFixVerification: null,
    });
    if (!cleared.success) return { status: "refused", reason: "acknowledgement-invalid" };
    const persisted = await input.stateStore.publish(
      input.plan.planId,
      cleared.data,
      input.current.revision,
    );
    return persisted.status === "ok"
      ? { status: "acknowledged", state: persisted.value, nextAction: "continue-work-unit" }
      : { status: "refused", reason: "state-conflict" };
  }

  if (input.expectedStateRevision < Number.MAX_SAFE_INTEGER
    && input.current.revision === input.expectedStateRevision + 1
    && state.data.pendingReviewFixVerification === null) {
    const predecessor = DeliveryStateV1Schema.safeParse({
      ...state.data,
      pendingReviewFixVerification: {
        selectedDeliverableId: selected.data,
        memberDeliverableIds: members.data,
      },
    });
    if (predecessor.success && canonicalDigest(predecessor.data) === digest.data) {
      return {
        status: "already-acknowledged",
        state: input.current,
        nextAction: "continue-work-unit",
      };
    }
  }
  return { status: "refused", reason: "stale-state" };
}

function hasExactPendingSelectedRefresh(state: DeliveryStateV1, selectedDeliverableId: string): boolean {
  const selectedIndex = state.members.findIndex(({ deliverableId }) => deliverableId === selectedDeliverableId);
  if (selectedIndex < 0 || selectedIndex >= state.members.length - 1) return false;
  for (let index = selectedIndex + 1; index < state.members.length; index += 1) {
    const predecessor = state.members[index - 1]?.coordinates;
    const member = state.members[index]?.coordinates;
    if (predecessor === null || predecessor === undefined || member === null || member === undefined) return false;
    const chainIsCurrent = member.base === predecessor.head;
    if (index === selectedIndex + 1 ? chainIsCurrent : !chainIsCurrent) return false;
  }
  return true;
}

export type DeliveryReviewFixPublicationResult =
  | {
      readonly status: "published";
      readonly state: DeliveryRevisionedRecord<DeliveryStateV1>;
      readonly selectedDeliverableId: string;
      readonly affectedDeliverableIds: readonly string[];
      readonly nextAction: "execute-provider-refresh";
      readonly verification: {
        readonly memberDeliverableIds: readonly string[];
        readonly tier1Required: true;
      };
      readonly recommendedActionText: string;
    }
  | { readonly status: "refused"; readonly reason: string };

/** Validate and publish only the selected member before provider-native suffix refresh execution. */
export async function publishSelectedDeliveryReviewFix(input: {
  readonly plan: DeliveryPlanV1;
  readonly current: DeliveryRevisionedRecord<DeliveryStateV1>;
  readonly facts: DeliveryPositionFactsV1;
  readonly selectedDeliverableId: string;
  readonly candidateRef: string;
  readonly expectedCandidateRef: string;
  readonly observation: DeliveryNativeStackObservation;
}, deps: DeliveryReviewFixPublicationDependencies): Promise<DeliveryReviewFixPublicationResult> {
  const route = planDeliveryReviewFixRoute({
    plan: input.plan,
    state: input.current.value,
    facts: input.facts,
    selectedDeliverableId: input.selectedDeliverableId,
    observation: input.observation,
  });
  if (route.status === "refused") return route;
  if (route.route !== "provider-refresh") return { status: "refused", reason: "route-moved" };
  const reobserveRoute = async () => {
    const reobserved = await deps.reobserveAuthority();
    if (reobserved.status === "refused") return null;
    const reobservedRoute = planDeliveryReviewFixRoute({
      plan: input.plan,
      state: input.current.value,
      facts: reobserved.facts,
      selectedDeliverableId: input.selectedDeliverableId,
      observation: reobserved.observation,
    });
    return reobservedRoute.status === "planned" && reobservedRoute.route === "provider-refresh"
      ? reobservedRoute
      : null;
  };
  const publishedContinuation = (
    state: DeliveryRevisionedRecord<DeliveryStateV1>,
    affectedDeliverableIds: readonly string[],
  ): DeliveryReviewFixPublicationResult => ({
    status: "published",
    state,
    selectedDeliverableId: input.selectedDeliverableId,
    affectedDeliverableIds,
    nextAction: "execute-provider-refresh",
    verification: { memberDeliverableIds: [input.selectedDeliverableId], tier1Required: true },
    recommendedActionText:
      "Run provider-native refresh execution for the selected member; ARC will publish any dependent rewrites "
      + "and absorb the resulting highest member into the top.",
  });
  if (input.candidateRef !== input.expectedCandidateRef) {
    return { status: "refused", reason: "candidate-ref-mismatch" };
  }
  const memberIndex = input.current.value.members.findIndex(
    (candidate) => candidate.deliverableId === input.selectedDeliverableId,
  );
  const member = input.current.value.members[memberIndex];
  if (member?.ref === null || member?.ref === undefined || member.coordinates === null
    || member.changeRequest === null) {
    return { status: "refused", reason: "selected-member-invalid" };
  }
  const memberRef = member.ref;
  const [candidate, checkout] = await Promise.all([
    deps.observeCandidateRef(),
    deps.inspectCandidate(),
  ]);
  if (candidate === null || checkout === null) return { status: "refused", reason: "candidate-unavailable" };
  if (candidate.head !== checkout.head || candidate.tree !== checkout.tree) {
    return { status: "refused", reason: "candidate-moved" };
  }
  if (checkout.trackedDirty) return { status: "refused", reason: "candidate-dirty" };
  if (candidate.head === member.coordinates.head) {
    if (!hasExactPendingSelectedRefresh(input.current.value, member.deliverableId)) {
      return { status: "refused", reason: "candidate-unchanged" };
    }
    const reobservedRoute = await reobserveRoute();
    return reobservedRoute === null
      ? { status: "refused", reason: "route-moved" }
      : publishedContinuation(input.current, reobservedRoute.affectedDeliverableIds);
  }
  const ancestry = await deps.readAncestry(member.coordinates.head, candidate.head);
  if (ancestry !== "ancestor") {
    return {
      status: "refused",
      reason: ancestry === "not-ancestor" ? "candidate-not-descendant" : "candidate-unavailable",
    };
  }
  const predecessor = memberIndex > 0 ? input.current.value.members[memberIndex - 1] : undefined;
  if (predecessor !== undefined) {
    if (predecessor.coordinates === null) {
      return { status: "refused", reason: "candidate-predecessor-unavailable" };
    }
    const predecessorAncestry = await deps.readAncestry(predecessor.coordinates.head, candidate.head);
    if (predecessorAncestry !== "ancestor") {
      return {
        status: "refused",
        reason: predecessorAncestry === "not-ancestor"
          ? "candidate-predecessor-mismatch"
          : "candidate-unavailable",
      };
    }
  }
  const requested = {
    target: input.current.value.target,
    members: [{
      deliverableId: member.deliverableId,
      ref: memberRef,
      changeRequest: member.changeRequest,
      coordinates: {
        base: member.coordinates.base,
        head: candidate.head,
        tree: candidate.tree,
      },
    }],
  };
  const reobservedRoute = await reobserveRoute();
  if (reobservedRoute === null) return { status: "refused", reason: "route-moved" };
  const applied = await executeDeliverySuffixRewrite({
    plan: input.plan,
    current: input.current,
    deliverableId: member.deliverableId,
    requested,
    operationMode: "selected-change",
    contributionMode: "selected-change",
    revalidateLifecycle: () => deps.revalidateLifecycle(),
    rewriteRef: (rewrite) => deps.rewriteRef(rewrite),
    observeResult: async () => await deps.observePublishedMember({ ref: memberRef, head: candidate.head })
      ? requested
      : { target: null, members: [] },
    proveContribution: () => Promise.resolve({ status: "accepted" as const, proof: "tree-equality" as const }),
    stateStore: deps.stateStore,
  });
  if (applied.status !== "applied") return applied;
  return publishedContinuation(applied.state, reobservedRoute.affectedDeliverableIds);
}
