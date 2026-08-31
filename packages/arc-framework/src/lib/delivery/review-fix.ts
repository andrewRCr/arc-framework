/** Provider-neutral routing and selected-member publication for delivery review fixes. */

import { canonicalDigest, canonicalize } from "../kernel/index.js";
import type { DeliveryRevisionedRecord, DeliveryStateStore } from "./ports.js";
import type { DeliveryEligibilityCoordinates } from "./eligibility.js";
import type { DeliveryNativeStackObservation } from "./native-stack.js";
import { deriveDeliveryPosition, type DeliveryPositionFactsV1 } from "./position.js";
import {
  DeliveryCanonicalDigestSchema,
  DeliveryStateV1Schema,
  type DeliveryPlanV1,
  type DeliveryStateV1,
} from "./schema.js";
import { deriveDeliveryProviderRefreshSubject } from "./provider-refresh-observation.js";
import {
  executeDeliverySuffixRewrite,
  hasExactPendingSelectedRefresh,
} from "./suffix-reconciliation.js";
import type {
  DeliveryReviewFixVerificationAcknowledgementInput,
} from "./review-fix-verification.js";
import { validateDeliveryStateAgainstPlan } from "./state.js";
import {
  CandidateLineageTargetSchema,
  CandidateManagedRecordV1Schema,
  createCandidateVerificationResponseEvidence,
  projectCandidateCurrentness,
  reduceCandidateDurableBaseline,
  type CandidateLineageTarget,
  type CandidateManagedRecordV1,
  type CandidateVerificationApplicability,
  type CandidateVerificationResponseEvidenceV1,
} from "../work-unit/candidate-attestation.js";

type StateWriter = Pick<DeliveryStateStore<DeliveryStateV1>, "publish">;

export type {
  DeliveryReviewFixVerificationAcknowledgementInput,
  DeliveryReviewFixVerificationContinuation,
} from "./review-fix-verification.js";

type DeliveryReviewFixRouteCommon = {
  readonly selectedDeliverableId: string;
  readonly affectedDeliverableIds: readonly string[];
  readonly recommendedActionText: string;
};

export type DeliveryReviewFixRouteResult =
  | {
      readonly status: "planned";
      readonly route: "provider-refresh";
      readonly nextAction: "publish-selected-member";
      readonly candidateRequirements: {
        readonly requiredAncestorHeads: readonly string[];
      };
    } & DeliveryReviewFixRouteCommon
  | {
      readonly status: "planned";
      readonly route: "rematerialize";
      readonly nextAction: "rematerialize";
    } & DeliveryReviewFixRouteCommon
  | {
      readonly status: "planned";
      readonly route: "terminal-authoring";
      readonly nextAction: "author-terminal";
    } & DeliveryReviewFixRouteCommon
  | {
      readonly status: "planned";
      readonly route: "terminal-rebind";
      readonly nextAction: "reconcile-terminal-publication";
      readonly reconcileInput: {
        readonly planId: string;
        readonly repository: string;
        readonly remote: string;
        readonly continuation: "read-position";
        readonly reviewFixSelectedDeliverableId: string;
      };
    } & DeliveryReviewFixRouteCommon
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
  readonly observation: DeliveryNativeStackObservation | null;
} & (
  | { readonly entryMode: "execution" }
  | {
      readonly entryMode: "integrating";
      readonly repository: string;
      readonly remote: string;
    }
);

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
    if (input.entryMode === "integrating" && input.facts.terminalAuthoringMovement !== undefined) {
      if (input.facts.terminalAuthoringMovement.deliverableId !== input.selectedDeliverableId) {
        return {
          status: "refused",
          reason: "position-mismatch",
          recommendedActionText: "Restore one exact published terminal movement before rebinding its correction.",
        };
      }
      return {
        status: "planned",
        route: "terminal-rebind",
        selectedDeliverableId: input.selectedDeliverableId,
        affectedDeliverableIds: [input.selectedDeliverableId],
        nextAction: "reconcile-terminal-publication",
        reconcileInput: {
          planId: input.plan.planId,
          repository: input.repository,
          remote: input.remote,
          continuation: "read-position",
          reviewFixSelectedDeliverableId: input.selectedDeliverableId,
        },
        recommendedActionText:
          "Rebind the exact published terminal Candidate, then resume delivery position.",
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

export type DeliveryReviewFixCandidateVerificationResult =
  | {
      readonly status: "recorded" | "already-recorded";
      readonly record: CandidateManagedRecordV1;
      readonly transition: CandidateVerificationResponseEvidenceV1;
      readonly nextAction: "renew-public-continuation";
    }
  | { readonly status: "refused"; readonly reason: string };

/** Advance the existing Candidate through one exact acknowledged delivery-correction verification. */
export function recordDeliveryReviewFixCandidateVerification(input: {
  readonly plan: DeliveryPlanV1;
  readonly state: DeliveryRevisionedRecord<DeliveryStateV1>;
  readonly acknowledgement: Omit<DeliveryReviewFixVerificationAcknowledgementInput, "planId">;
  readonly record: CandidateManagedRecordV1;
  readonly currentTarget: unknown;
  readonly verifiedBy: string;
  readonly verifiedAt: string;
  readonly applicability: CandidateVerificationApplicability;
  readonly verificationEvidenceRefs: readonly string[];
}): DeliveryReviewFixCandidateVerificationResult {
  const state = DeliveryStateV1Schema.safeParse(input.state.value);
  const record = CandidateManagedRecordV1Schema.safeParse(input.record);
  const currentTarget = CandidateLineageTargetSchema.safeParse(input.currentTarget);
  if (!state.success || !record.success || !currentTarget.success
    || !Number.isSafeInteger(input.state.revision)
    || validateDeliveryStateAgainstPlan(input.state.value, input.plan).status === "refused"
    || record.data.attestation.workUnit !== input.plan.workUnitId) {
    return { status: "refused", reason: "candidate-verification-invalid" };
  }
  const pendingMatches = input.state.revision === input.acknowledgement.expectedStateRevision
    && state.data.pendingReviewFixVerification?.selectedDeliverableId
      === input.acknowledgement.selectedDeliverableId
    && canonicalize(state.data.pendingReviewFixVerification.memberDeliverableIds)
      === canonicalize(input.acknowledgement.memberDeliverableIds)
    && canonicalDigest(state.data) === input.acknowledgement.continuationDigest;
  const replayPredecessor = input.state.revision === input.acknowledgement.expectedStateRevision + 1
    && state.data.pendingReviewFixVerification === null
    ? DeliveryStateV1Schema.safeParse({
        ...state.data,
        pendingReviewFixVerification: {
          selectedDeliverableId: input.acknowledgement.selectedDeliverableId,
          memberDeliverableIds: input.acknowledgement.memberDeliverableIds,
        },
      })
    : null;
  const acknowledgedReplay = replayPredecessor?.success === true
    && canonicalDigest(replayPredecessor.data) === input.acknowledgement.continuationDigest;
  if (!pendingMatches && !acknowledgedReplay) {
    return { status: "refused", reason: "candidate-verification-continuation-mismatch" };
  }
  const terminalHead = state.data.members.at(-1)?.coordinates?.head;
  if (terminalHead === undefined || terminalHead !== currentTarget.data.revision) {
    return { status: "refused", reason: "candidate-verification-target-mismatch" };
  }
  const existing = record.data.transitions.flatMap((transition, index) =>
    transition.transitionKind === "verification-response"
      && transition.authorityRef === input.acknowledgement.continuationDigest
      ? [{ transition, index }]
      : []);
  if (existing.length > 1) {
    return { status: "refused", reason: "candidate-verification-duplicated" };
  }
  const retained = existing[0];
  if (retained !== undefined) {
    const priorRecord = CandidateManagedRecordV1Schema.safeParse({
      ...record.data,
      transitions: record.data.transitions.slice(0, retained.index),
      lineageAttestations: record.data.lineageAttestations.filter(({ target }) =>
        record.data.subject.subjectDigest === target.subject.subjectDigest
        || record.data.transitions.slice(0, retained.index).some((transition) =>
          "newTarget" in transition
          && transition.newTarget.subject.subjectDigest === target.subject.subjectDigest)),
    });
    if (!priorRecord.success) return { status: "refused", reason: "candidate-verification-invalid" };
    const prior = reduceCandidateDurableBaseline(priorRecord.data);
    if (!sameCandidateTargetIdentity(retained.transition.oldTarget, prior.target)
      || !sameCandidateTargetIdentity(retained.transition.newTarget, currentTarget.data)
      || retained.transition.verifiedBy !== input.verifiedBy
      || retained.transition.applicability !== input.applicability
      || canonicalize(retained.transition.verificationEvidenceRefs)
        !== canonicalize(input.verificationEvidenceRefs)) {
      return { status: "refused", reason: "candidate-verification-replay-mismatch" };
    }
    return {
      status: "already-recorded",
      record: record.data,
      transition: retained.transition,
      nextAction: "renew-public-continuation",
    };
  }
  const baseline = reduceCandidateDurableBaseline(record.data);
  const baselineCurrentness = projectCandidateCurrentness({
    record: record.data,
    current: baseline.target,
  });
  if (baselineCurrentness.status !== "current"
    || baselineCurrentness.convergenceVerification !== "satisfied") {
    return { status: "refused", reason: "candidate-baseline-unverified" };
  }
  let transition: CandidateVerificationResponseEvidenceV1;
  try {
    transition = createCandidateVerificationResponseEvidence({
      candidateId: record.data.attestation.candidateId,
      oldTarget: baseline.target,
      newTarget: currentTarget.data,
      authorityRef: input.acknowledgement.continuationDigest,
      verifiedBy: input.verifiedBy,
      verifiedAt: input.verifiedAt,
      applicability: input.applicability,
      verificationEvidenceRefs: input.verificationEvidenceRefs,
      implementationChanged:
        baseline.target.subject.subjectDigest !== currentTarget.data.subject.subjectDigest,
    });
  } catch {
    return { status: "refused", reason: "candidate-verification-invalid" };
  }
  const next = CandidateManagedRecordV1Schema.safeParse({
    ...record.data,
    transitions: [...record.data.transitions, transition],
  });
  if (!next.success) return { status: "refused", reason: "candidate-verification-invalid" };
  return {
    status: "recorded",
    record: next.data,
    transition,
    nextAction: "renew-public-continuation",
  };
}

function sameCandidateTargetIdentity(
  left: CandidateLineageTarget,
  right: CandidateLineageTarget,
): boolean {
  return left.revision === right.revision
    && left.subject.subjectDigest === right.subject.subjectDigest;
}

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
    entryMode: "execution",
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
      entryMode: "execution",
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
