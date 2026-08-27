/** Provider-neutral routing and selected-member publication for delivery review fixes. */

import type { DeliveryRevisionedRecord, DeliveryStateStore } from "./ports.js";
import type { DeliveryEligibilityCoordinates } from "./eligibility.js";
import type { DeliveryNativeStackObservation } from "./native-stack.js";
import { deriveDeliveryPosition, type DeliveryPositionFactsV1 } from "./position.js";
import type { DeliveryPlanV1, DeliveryStateV1 } from "./schema.js";
import { deriveDeliveryProviderRefreshSubject } from "./provider-refresh-observation.js";
import { executeDeliverySuffixRewrite } from "./suffix-reconciliation.js";
import { validateDeliveryStateAgainstPlan } from "./state.js";

type StateWriter = Pick<DeliveryStateStore<DeliveryStateV1>, "publish">;

export type DeliveryReviewFixRouteResult =
  | {
      readonly status: "planned";
      readonly route: "provider-refresh" | "rematerialize" | "terminal-authoring";
      readonly selectedDeliverableId: string;
      readonly affectedDeliverableIds: readonly string[];
      readonly nextAction: "publish-selected-member" | "rematerialize" | "author-terminal";
      readonly recommendedActionText: string;
    }
  | {
      readonly status: "refused";
      readonly reason: string;
      readonly recommendedActionText: string;
    };

/** Select linked single-member publication or complete unlinked rematerialization from fresh presentation. */
export function planDeliveryReviewFixRoute(input: {
  readonly plan: DeliveryPlanV1;
  readonly state: DeliveryStateV1;
  readonly facts: DeliveryPositionFactsV1;
  readonly selectedDeliverableId: string;
  readonly observation: DeliveryNativeStackObservation | null;
}): DeliveryReviewFixRouteResult {
  if (input.state.activeOperation !== null
    || validateDeliveryStateAgainstPlan(input.state, input.plan).status === "refused") {
    return {
      status: "refused",
      reason: input.state.activeOperation === null ? "position-mismatch" : "operation-active",
      recommendedActionText: "Restore one exact idle delivery state before routing the review fix.",
    };
  }
  const terminalDeliverableId = input.plan.members.at(-1)?.deliverableId;
  if (input.selectedDeliverableId === terminalDeliverableId) {
    const position = deriveDeliveryPosition(input.plan, input.state, input.facts);
    if (position.status !== "derived"
      || !position.position.boundSuffix.some(
        (deliverableId) => deliverableId === input.selectedDeliverableId,
      )) {
      return {
        status: "refused",
        reason: "position-mismatch",
        recommendedActionText: "Restore one exact bound terminal member before routing its correction.",
      };
    }
    return {
      status: "planned",
      route: "terminal-authoring",
      selectedDeliverableId: input.selectedDeliverableId,
      affectedDeliverableIds: [input.selectedDeliverableId],
      nextAction: "author-terminal",
      recommendedActionText:
        "Author the approved correction on the exact terminal work-unit branch; no delivery member rewrite is "
        + "required.",
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
  if (input.observation === null) {
    return {
      status: "refused",
      reason: "presentation-unavailable",
      recommendedActionText: "Restore one exact provider presentation before routing the review fix.",
    };
  }
  const affectedDeliverableIds = subject.subject.affectedDeliverableIds.slice(selectedIndex);
  if (input.observation.status === "registered") {
    return {
      status: "planned",
      route: "provider-refresh",
      selectedDeliverableId: input.selectedDeliverableId,
      affectedDeliverableIds,
      nextAction: "publish-selected-member",
      recommendedActionText:
        "Publish only the selected member, then let ARC execute and settle the exact provider-native dependent "
        + "suffix refresh.",
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
  if (input.candidateRef !== input.expectedCandidateRef) {
    return { status: "refused", reason: "candidate-ref-mismatch" };
  }
  const member = input.current.value.members.find(
    (candidate) => candidate.deliverableId === input.selectedDeliverableId,
  );
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
  if (candidate.head === member.coordinates.head) return { status: "refused", reason: "candidate-unchanged" };
  const ancestry = await deps.readAncestry(member.coordinates.head, candidate.head);
  if (ancestry !== "ancestor") {
    return {
      status: "refused",
      reason: ancestry === "not-ancestor" ? "candidate-not-descendant" : "candidate-unavailable",
    };
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
  const reobserved = await deps.reobserveAuthority();
  if (reobserved.status === "refused") return { status: "refused", reason: "route-moved" };
  const reobservedRoute = planDeliveryReviewFixRoute({
    plan: input.plan,
    state: input.current.value,
    facts: reobserved.facts,
    selectedDeliverableId: input.selectedDeliverableId,
    observation: reobserved.observation,
  });
  if (reobservedRoute.status === "refused" || reobservedRoute.route !== "provider-refresh") {
    return { status: "refused", reason: "route-moved" };
  }
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
  return {
    status: "published",
    state: applied.state,
    selectedDeliverableId: member.deliverableId,
    affectedDeliverableIds: route.affectedDeliverableIds,
    nextAction: "execute-provider-refresh",
    verification: { memberDeliverableIds: [member.deliverableId], tier1Required: true },
    recommendedActionText:
      "Run provider-native refresh execution for the selected member; ARC will publish any dependent rewrites "
      + "and absorb the resulting highest member into the top.",
  };
}
