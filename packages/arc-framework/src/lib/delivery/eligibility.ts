/** Mechanical validation for an operator-authored delivery candidate chain. */

import { validateDeliveryPlanRecord } from "./plan.js";
import type { DeliveryPlanV1 } from "./schema.js";
import { classifyPathTreatment } from "../evidence-applicability/index.js";
import type { RevisionOverlapResult } from "../git/base-overlap.js";
import {
  predecessorRelation,
  type DeliveryPredecessorRelation,
  type PredecessorRelationRead,
} from "./predecessor-relation.js";

/** The merge that collapses a pair's several best bases to one, which is what clears an ambiguous read. */
type DeliveryBaseMergeRemedy = Extract<PredecessorRelationRead, { readonly status: "ambiguous" }>["remedy"];

/** What both readers tell an operator whose member and observed tip changed the same content. */
const OVERLAPPING_MOVEMENT_DETAIL = "The observed protected-base movement overlaps this delivery member. "
  + "Rebuild the delivery chain against the observed tip; no safe automated rebuild command is available.";

/** What both readers append for a pair that shares no lineage at all, which no retry can change. */
const UNRELATED_LINEAGE_REMEDY_DETAIL = " Rebuild the delivery chain from a common lineage; no safe automated "
  + "rebuild command is available.";

/** Exact ref coordinates pinned during one eligibility observation window. */
export interface DeliveryEligibilityCoordinates {
  readonly head: string;
  readonly tree: string;
}

/** One operator-selected candidate after exact identity has been observed. */
export interface DeliveryEligibilityMember extends DeliveryEligibilityCoordinates {
  readonly deliverableId: string;
  readonly ref: string;
}

/** Caller-reported Tier 2 outcome for one exact disposable member candidate. */
export interface DeliveryCandidateGateResult extends DeliveryEligibilityCoordinates {
  readonly deliverableId: string;
  readonly status: "passed" | "failed";
}

/** Ephemeral mechanical snapshot; never a persisted authorization token. */
export interface DeliveryEligibilitySnapshot {
  readonly planId: string;
  readonly workUnitId: string;
  readonly planRevision: number;
  readonly planDigest: string;
  readonly protectedBase: DeliveryEligibilityCoordinates & { readonly ref: string };
  readonly chainBase: DeliveryEligibilityCoordinates;
  readonly predecessorRelation: DeliveryPredecessorRelation;
  readonly top: DeliveryEligibilityCoordinates & { readonly ref: string };
  readonly members: readonly DeliveryEligibilityMember[];
  readonly lifecyclePaths: readonly string[];
  readonly regenerablePaths: readonly string[];
}

/** Reconstruct the lifecycle treatment derived from one freshly observed path set. */
export function deriveDeliveryRegenerablePaths(
  lifecyclePaths: readonly string[],
  workUnitId: string,
): readonly string[] {
  return [...new Set(lifecyclePaths)].sort(byteSort).filter((path) => (
    classifyPathTreatment(path, { workUnit: workUnitId }) === "regenerable"
  ));
}

/** Bind rewrite-time lifecycle validation to one member of a closed eligibility snapshot. */
export function deriveDeliveryMemberLifecycleRevalidation(input: {
  readonly snapshot: DeliveryEligibilitySnapshot;
  readonly deliverableId: string;
}): {
  readonly protectedBaseRef: string;
  readonly chainBaseRef: string;
  readonly candidateRef: string;
  readonly paths: readonly string[];
  readonly regenerablePaths: readonly string[];
} | null {
  const index = input.snapshot.members.findIndex((member) => member.deliverableId === input.deliverableId);
  const member = input.snapshot.members[index];
  const predecessor = index === 0 ? input.snapshot.chainBase : input.snapshot.members[index - 1];
  if (index < 0 || member === undefined || predecessor === undefined) return null;
  return {
    protectedBaseRef: input.snapshot.protectedBase.ref,
    chainBaseRef: predecessor.head,
    candidateRef: member.ref,
    paths: input.snapshot.lifecyclePaths,
    regenerablePaths: input.snapshot.regenerablePaths,
  };
}

/** Bind a standalone rewrite to the predecessor already present in its requested operation snapshot. */
export function deriveDeliveryRewriteLifecycleRevalidation(input: {
  readonly protectedBaseRef: string;
  readonly requestedPredecessorHead: string;
  readonly candidateRef: string;
  readonly lifecyclePaths: readonly string[];
  readonly workUnitId: string;
}): {
  readonly protectedBaseRef: string;
  readonly chainBaseRef: string;
  readonly candidateRef: string;
  readonly paths: readonly string[];
  readonly regenerablePaths: readonly string[];
} {
  const paths = [...new Set(input.lifecyclePaths)].sort(byteSort);
  return {
    protectedBaseRef: input.protectedBaseRef,
    chainBaseRef: input.requestedPredecessorHead,
    candidateRef: input.candidateRef,
    paths,
    regenerablePaths: deriveDeliveryRegenerablePaths(paths, input.workUnitId),
  };
}

/** Read-only dependencies used by eligibility preparation, gate bracketing, and close. */
export interface DeliveryEligibilityDependencies {
  observeRef(ref: string): Promise<DeliveryEligibilityCoordinates | null>;
  readAncestry(ancestor: string, descendant: string): Promise<"ancestor" | "not-ancestor" | "unresolvable">;
  readOverlap(input: {
    readonly leftRevision: string;
    readonly rightRevision: string;
    readonly workUnitId: string;
  }): Promise<RevisionOverlapResult>;
  revalidateLifecycleContribution(input: {
    readonly protectedBaseRef: string;
    readonly chainBaseRef: string;
    readonly candidateRef: string;
    readonly paths: readonly string[];
    readonly regenerablePaths: readonly string[];
  }): Promise<{ readonly status: "ok" } | { readonly status: "refused"; readonly paths: readonly string[] }>;
  compareNormalizedCompleteness(input: {
    readonly protectedBase: DeliveryEligibilityCoordinates & { readonly ref: string };
    readonly chainBase: DeliveryEligibilityCoordinates;
    readonly top: DeliveryEligibilityCoordinates & { readonly ref: string };
    readonly finalCandidate: DeliveryEligibilityMember;
    readonly lifecyclePaths: readonly string[];
    readonly regenerablePaths: readonly string[];
  }): Promise<
    | { readonly status: "match" }
    | { readonly status: "refused"; readonly reason: "dropped" | "invented" | "mismatched" | "unavailable" }
  >;
  readCurrentPlan(planId: string): Promise<DeliveryPlanV1 | null>;
  resolveMember(head: string): Promise<{
    readonly status: "ok";
    readonly value: null | { readonly planId: string; readonly workUnitId: string; readonly deliverableId: string };
  } | { readonly status: "refused" }>;
  inspectCheckout(path: string): Promise<
    (DeliveryEligibilityCoordinates & { readonly trackedDirty: boolean }) | null
  >;
}

/** Additional repository authority required by the public publication-close operation. */
export interface DeliveryEligibilityCloseDependencies extends DeliveryEligibilityDependencies {
  resolveLifecyclePaths(input: {
    readonly plan: DeliveryPlanV1;
    readonly snapshot: DeliveryEligibilitySnapshot;
  }): Promise<readonly string[] | null>;
}

/** Closed refusal from any mechanical eligibility stage. */
export interface DeliveryEligibilityRefusal {
  readonly status: "refused";
  readonly reason:
    | "invalid-stack-plan"
    | "missing-candidate"
    | "extra-candidate"
    | "duplicate-candidate"
    | "reordered-candidate"
    | "direct-delivery-ref"
    | "candidate-unavailable"
    | "wrong-predecessor"
    | "unrelated-predecessor"
    | "ambiguous-predecessor-base"
    | "empty-candidate"
    | "lifecycle-contribution"
    | "checkout-dirty"
    | "checkout-moved"
    | "missing-gate-result"
    | "duplicate-gate-result"
    | "reordered-gate-result"
    | "gate-result-failed"
    | "gate-result-stale"
    | "lifecycle-paths-moved"
    | "completeness-dropped"
    | "completeness-invented"
    | "completeness-mismatched"
    | "evidence-unavailable"
    | "source-moved"
    | "plan-moved"
    | "top-ref-mismatch"
    | "head-already-bound";
  readonly deliverableId?: string;
  /** Every mismatching lifecycle-contribution path; present only for `lifecycle-contribution` refusals. */
  readonly paths?: readonly string[];
  readonly relation?: DeliveryPredecessorRelation;
  /** The independently observed protected-base tip, for the arms that carry no relation to report it on. */
  readonly observedTip?: string;
  readonly detail?: string;
  readonly source?: {
    readonly ref: string;
    readonly expected: DeliveryEligibilityCoordinates;
    readonly observed: DeliveryEligibilityCoordinates | null;
  };
  readonly nextAction?: {
    readonly kind: "reprepare-delivery-eligibility";
    readonly planId: string;
    readonly protectedBaseRef: string;
    readonly topRef: string;
    readonly candidates: readonly { readonly deliverableId: string; readonly ref: string }[];
    readonly lifecyclePaths: readonly string[];
  };
  readonly remedy?:
    | { readonly kind: "delivery-authoring-rebuild-required"; readonly automatedCommand: null }
    | DeliveryBaseMergeRemedy;
}

/** Dependencies that keep plan and lifecycle discovery inside one mutation observation window. */
export interface FreshDeliveryEligibilityMutationDependencies<Prepared, Result, PreparationRefusal>
extends DeliveryEligibilityDependencies {
  resolveOriginatingTopRef(plan: DeliveryPlanV1): Promise<string | null>;
  resolveLifecyclePaths(plan: DeliveryPlanV1): Promise<readonly string[] | null>;
  prepareMutation(input: {
    readonly plan: DeliveryPlanV1;
    readonly snapshot: DeliveryEligibilitySnapshot;
  }): Promise<{ readonly status: "prepared"; readonly value: Prepared } | PreparationRefusal>;
  mutate(input: {
    readonly plan: DeliveryPlanV1;
    readonly snapshot: DeliveryEligibilitySnapshot;
    readonly prepared: Prepared;
  }): Promise<Result>;
}

/**
 * Consume fresh eligibility in-process without exposing it as mutation authority to the caller.
 *
 * @param input - Plan identity, exact refs, and disposable checkout locators
 * @param deps - Current plan/lifecycle readers, mechanical observers, and the guarded mutation
 * @returns The mutation result, or the first refusal before mutation begins
 */
export async function executeWithFreshDeliveryEligibility<
  Prepared,
  Result,
  PreparationRefusal extends { readonly status: "refused" },
>(input: {
  readonly planId: string;
  readonly protectedBaseRef: string;
  readonly topRef: string;
  readonly memberOffset?: number;
  readonly candidates: readonly {
    readonly deliverableId: string;
    readonly ref: string;
    readonly checkoutPath: string;
  }[];
  readonly gateResults?: readonly DeliveryCandidateGateResult[];
}, deps: FreshDeliveryEligibilityMutationDependencies<Prepared, Result, PreparationRefusal>): Promise<
  Result | PreparationRefusal | DeliveryEligibilityRefusal
> {
  const plan = await deps.readCurrentPlan(input.planId);
  if (plan === null) return { status: "refused", reason: "plan-moved" };
  const originatingTopRef = await deps.resolveOriginatingTopRef(plan);
  if (originatingTopRef === null) return { status: "refused", reason: "evidence-unavailable" };
  if (originatingTopRef !== input.topRef) return { status: "refused", reason: "top-ref-mismatch" };
  const lifecyclePaths = await deps.resolveLifecyclePaths(plan);
  if (lifecyclePaths === null) return { status: "refused", reason: "evidence-unavailable" };
  const eligible = await revalidateDeliveryEligibilityForMutation({
    ...input,
    plan,
    lifecyclePaths,
    gateResults: input.gateResults,
  }, deps);
  if (eligible.status !== "eligible") return eligible;
  const prepared = await deps.prepareMutation({ plan, snapshot: eligible.snapshot });
  if (prepared.status === "refused") return prepared;
  const currentLifecyclePaths = await deps.resolveLifecyclePaths(plan);
  if (currentLifecyclePaths === null) return { status: "refused", reason: "evidence-unavailable" };
  const normalizedCurrentPaths = [...new Set(currentLifecyclePaths)].sort(byteSort);
  if (normalizedCurrentPaths.length !== eligible.snapshot.lifecyclePaths.length
    || normalizedCurrentPaths.some((path, index) => path !== eligible.snapshot.lifecyclePaths[index])) {
    return { status: "refused", reason: "lifecycle-paths-moved" };
  }
  if (await deps.resolveOriginatingTopRef(plan) !== input.topRef) {
    return { status: "refused", reason: "top-ref-mismatch" };
  }
  return deps.mutate({ plan, snapshot: eligible.snapshot, prepared: prepared.value });
}

async function revalidateDeliveryEligibilityForMutation(input: {
  readonly plan: DeliveryPlanV1;
  readonly protectedBaseRef: string;
  readonly topRef: string;
  readonly memberOffset?: number;
  readonly candidates: readonly {
    readonly deliverableId: string;
    readonly ref: string;
    readonly checkoutPath: string;
  }[];
  readonly lifecyclePaths: readonly string[];
  readonly gateResults?: readonly DeliveryCandidateGateResult[];
}, deps: DeliveryEligibilityDependencies): Promise<
  | { readonly status: "eligible"; readonly snapshot: DeliveryEligibilitySnapshot }
  | DeliveryEligibilityRefusal
> {
  const prepared = await prepareDeliveryEligibility({
    ...input,
    candidates: input.candidates.map(({ deliverableId, ref }) => ({ deliverableId, ref })),
  }, deps);
  if (prepared.status !== "prepared") return prepared;
  for (const [index, candidate] of input.candidates.entries()) {
    const checkout = await verifyDeliveryCandidateCheckout(
      prepared.snapshot,
      index,
      candidate.checkoutPath,
      deps,
    );
    if (checkout.status !== "exact") return checkout;
  }
  if (input.gateResults !== undefined) {
    const gateRefusal = validateDeliveryCandidateGateResults(prepared.snapshot, input.gateResults);
    if (gateRefusal !== null) return gateRefusal;
  }
  return closeDeliveryEligibility(prepared.snapshot, deps);
}

/** Validate and pin one complete authored candidate chain before workflow-owned gates run. */
export async function prepareDeliveryEligibility(input: {
  readonly plan: DeliveryPlanV1;
  readonly protectedBaseRef: string;
  readonly topRef: string;
  readonly memberOffset?: number;
  readonly candidates: readonly { readonly deliverableId: string; readonly ref: string }[];
  readonly lifecyclePaths: readonly string[];
}, deps: DeliveryEligibilityDependencies): Promise<
  | { readonly status: "prepared"; readonly snapshot: DeliveryEligibilitySnapshot }
  | DeliveryEligibilityRefusal
> {
  const validation = validateDeliveryPlanRecord(input.plan);
  if (validation.status !== "valid" || input.plan.projection.kind !== "stack-to-main") {
    return { status: "refused", reason: "invalid-stack-plan" };
  }
  const memberOffset = input.memberOffset ?? 0;
  if (!Number.isSafeInteger(memberOffset) || memberOffset < 0 || memberOffset >= input.plan.members.length) {
    return { status: "refused", reason: "missing-candidate" };
  }
  const expectedMembers = input.plan.members.slice(memberOffset);
  if (input.candidates.length < expectedMembers.length) return { status: "refused", reason: "missing-candidate" };
  if (input.candidates.length > expectedMembers.length) return { status: "refused", reason: "extra-candidate" };
  if (new Set(input.candidates.map((candidate) => candidate.deliverableId)).size !== input.candidates.length
    || new Set(input.candidates.map((candidate) => candidate.ref)).size !== input.candidates.length) {
    return { status: "refused", reason: "duplicate-candidate" };
  }
  if (input.candidates.some((candidate, index) => candidate.deliverableId !== expectedMembers[index]?.deliverableId)) {
    return { status: "refused", reason: "reordered-candidate" };
  }
  const directDeliveryCandidate = input.candidates.find((candidate) => (
    candidate.ref.startsWith("refs/heads/delivery/")
  ));
  if (directDeliveryCandidate !== undefined) {
    return {
      status: "refused",
      reason: "direct-delivery-ref",
      deliverableId: directDeliveryCandidate.deliverableId,
    };
  }

  const observed = await Promise.all([
    deps.observeRef(input.protectedBaseRef),
    deps.observeRef(input.topRef),
    ...input.candidates.map((candidate) => deps.observeRef(candidate.ref)),
  ]);
  const protectedBase = observed[0];
  const top = observed[1];
  if (protectedBase === null || top === null) return { status: "refused", reason: "evidence-unavailable" };
  const firstCoordinates = observed[2];
  const firstCandidate = input.candidates[0];
  if (firstCoordinates === null || firstCoordinates === undefined || firstCandidate === undefined) {
    return { status: "refused", reason: "candidate-unavailable", deliverableId: firstCandidate?.deliverableId };
  }
  const predecessorRead = await predecessorRelation({
    memberHead: firstCoordinates.head,
    observedTip: protectedBase.head,
  }, {
    readAncestry: (ancestor, descendant) => deps.readAncestry(ancestor, descendant),
    readOverlap: (leftRevision, rightRevision) => deps.readOverlap({
      leftRevision,
      rightRevision,
      workUnitId: input.plan.workUnitId,
    }),
  });
  if (predecessorRead.status === "unavailable") {
    return { status: "refused", reason: "evidence-unavailable", deliverableId: firstCandidate.deliverableId };
  }
  // A recoverable condition, and the merge the read already composed is what recovers it — so it takes neither
  // the unreadable-evidence reason, which invites a retry that cannot clear it, nor the accept path, which an
  // absent overlap would otherwise hand it: the multi-base branch returns before an overlap is ever computed.
  if (predecessorRead.status === "ambiguous") {
    return {
      status: "refused",
      reason: "ambiguous-predecessor-base",
      deliverableId: firstCandidate.deliverableId,
      observedTip: predecessorRead.observedTip,
      detail: predecessorRead.detail,
      remedy: predecessorRead.remedy,
    };
  }
  // Terminal: no rebuild against the observed tip helps a pair that shares no lineage with it, so it refuses
  // apart from the pair that merely diverged rather than under that pair's recoverable reason. It relates by
  // nothing, so there is no relation to report the condition on and the tip rides the refusal itself.
  if (predecessorRead.status === "unrelated") {
    return {
      status: "refused",
      reason: "unrelated-predecessor",
      deliverableId: firstCandidate.deliverableId,
      observedTip: predecessorRead.observedTip,
      detail: predecessorRead.detail + UNRELATED_LINEAGE_REMEDY_DETAIL,
      remedy: { kind: "delivery-authoring-rebuild-required", automatedCommand: null },
    };
  }
  const observedRelation = predecessorRead.relation;
  // One variant now carries both the accepted and the refused case, so the decision reads the content the pair
  // was found to share rather than the name the pair was given.
  if (observedRelation.kind === "diverged" && observedRelation.overlap.substantivePaths.length > 0) {
    return {
      status: "refused",
      reason: "wrong-predecessor",
      deliverableId: firstCandidate.deliverableId,
      relation: observedRelation,
      paths: observedRelation.overlap.substantivePaths,
      detail: OVERLAPPING_MOVEMENT_DETAIL,
      remedy: { kind: "delivery-authoring-rebuild-required", automatedCommand: null },
    };
  }
  const observedChainBase = observedRelation.chainBase;
  const chainBase = observedRelation.kind === "unchanged" || observedRelation.kind === "advanced"
    ? { head: protectedBase.head, tree: protectedBase.tree }
    : await deps.observeRef(observedChainBase);
  if (chainBase === null || chainBase.head !== observedChainBase) {
    return { status: "refused", reason: "evidence-unavailable", deliverableId: firstCandidate.deliverableId };
  }
  const lifecyclePaths = [...new Set(input.lifecyclePaths)].sort(byteSort);
  const regenerablePaths = deriveDeliveryRegenerablePaths(lifecyclePaths, input.plan.workUnitId);
  const members: DeliveryEligibilityMember[] = [];
  for (const [index, candidate] of input.candidates.entries()) {
    const coordinates = observed[index + 2];
    if (coordinates === null || coordinates === undefined) {
      return { status: "refused", reason: "candidate-unavailable", deliverableId: candidate.deliverableId };
    }
    const predecessor = index === 0 ? chainBase : members[index - 1];
    if (predecessor === undefined) return { status: "refused", reason: "evidence-unavailable" };
    const ancestry = index === 0 ? "ancestor" : await deps.readAncestry(predecessor.head, coordinates.head);
    if (ancestry !== "ancestor") {
      return {
        status: "refused",
        reason: ancestry === "not-ancestor" ? "wrong-predecessor" : "evidence-unavailable",
        deliverableId: candidate.deliverableId,
      };
    }
    if (index < input.candidates.length - 1
      && (coordinates.head === predecessor.head || coordinates.tree === predecessor.tree)) {
      return { status: "refused", reason: "empty-candidate", deliverableId: candidate.deliverableId };
    }
    const lifecycle = await deps.revalidateLifecycleContribution({
      protectedBaseRef: input.protectedBaseRef,
      chainBaseRef: predecessor.head,
      candidateRef: candidate.ref,
      paths: lifecyclePaths,
      regenerablePaths,
    });
    if (lifecycle.status !== "ok") {
      return {
        status: "refused",
        reason: "lifecycle-contribution",
        deliverableId: candidate.deliverableId,
        paths: lifecycle.paths,
      };
    }
    members.push({ ...candidate, ...coordinates });
  }
  return {
    status: "prepared",
    snapshot: {
      planId: input.plan.planId,
      workUnitId: input.plan.workUnitId,
      planRevision: input.plan.planRevision,
      planDigest: input.plan.planDigest,
      protectedBase: { ref: input.protectedBaseRef, ...protectedBase },
      chainBase,
      predecessorRelation: observedRelation,
      top: { ref: input.topRef, ...top },
      members,
      lifecyclePaths,
      regenerablePaths,
    },
  };
}

/** Verify one disposable checkout immediately before or after workflow-owned gate execution. */
export async function verifyDeliveryCandidateCheckout(
  snapshot: DeliveryEligibilitySnapshot,
  memberIndex: number,
  checkoutPath: string,
  deps: DeliveryEligibilityDependencies,
): Promise<{ readonly status: "exact" } | DeliveryEligibilityRefusal> {
  const member = snapshot.members[memberIndex];
  if (member === undefined) return { status: "refused", reason: "candidate-unavailable" };
  const [checkout, currentRef] = await Promise.all([
    deps.inspectCheckout(checkoutPath),
    deps.observeRef(member.ref),
  ]);
  if (checkout === null) {
    return { status: "refused", reason: "evidence-unavailable", deliverableId: member.deliverableId };
  }
  if (checkout.trackedDirty) {
    return { status: "refused", reason: "checkout-dirty", deliverableId: member.deliverableId };
  }
  if (currentRef === null || checkout.head !== member.head || checkout.tree !== member.tree
    || currentRef.head !== member.head || currentRef.tree !== member.tree) {
    return { status: "refused", reason: "checkout-moved", deliverableId: member.deliverableId };
  }
  return { status: "exact" };
}

/**
 * Close a mechanically exact eligibility window without granting publication authority.
 *
 * @param snapshot - Prepared candidate coordinates to reobserve
 * @param deps - Exact Git, plan, and member-binding readers
 * @returns The eligible snapshot or the first mechanical refusal
 */
export async function closeDeliveryEligibility(
  snapshot: DeliveryEligibilitySnapshot,
  deps: DeliveryEligibilityDependencies,
): Promise<{ readonly status: "eligible"; readonly snapshot: DeliveryEligibilitySnapshot } | DeliveryEligibilityRefusal> {
  return closeMechanicalDeliveryEligibility(snapshot, deps);
}

/**
 * Close the publication eligibility window after consuming workflow-owned gate results.
 *
 * @param input - Prepared candidate coordinates and their ordered exact gate results
 * @param deps - Exact Git, plan, and member-binding readers
 * @returns The eligible snapshot or the first gate or mechanical refusal
 */
export async function closeDeliveryEligibilityForPublication(
  input: {
    readonly snapshot: DeliveryEligibilitySnapshot;
    readonly gateResults: readonly DeliveryCandidateGateResult[];
  },
  deps: DeliveryEligibilityCloseDependencies,
): Promise<{ readonly status: "eligible"; readonly snapshot: DeliveryEligibilitySnapshot } | DeliveryEligibilityRefusal> {
  const { snapshot } = input;
  const gateRefusal = validateDeliveryCandidateGateResults(snapshot, input.gateResults);
  if (gateRefusal !== null) return gateRefusal;
  const currentPlan = await deps.readCurrentPlan(snapshot.planId);
  if (currentPlan === null || currentPlan.planId !== snapshot.planId
    || currentPlan.workUnitId !== snapshot.workUnitId
    || currentPlan.planRevision !== snapshot.planRevision
    || currentPlan.planDigest !== snapshot.planDigest) {
    return { status: "refused", reason: "plan-moved" };
  }
  const currentLifecyclePaths = await deps.resolveLifecyclePaths({ plan: currentPlan, snapshot });
  if (currentLifecyclePaths === null) return { status: "refused", reason: "evidence-unavailable" };
  const lifecyclePaths = [...new Set(currentLifecyclePaths)].sort(byteSort);
  const regenerablePaths = deriveDeliveryRegenerablePaths(lifecyclePaths, currentPlan.workUnitId);
  if (!samePaths(lifecyclePaths, snapshot.lifecyclePaths)
    || !samePaths(regenerablePaths, snapshot.regenerablePaths)) {
    return { status: "refused", reason: "lifecycle-paths-moved" };
  }
  for (const member of snapshot.members) {
    const lifecycleInput = deriveDeliveryMemberLifecycleRevalidation({
      snapshot,
      deliverableId: member.deliverableId,
    });
    if (lifecycleInput === null) return { status: "refused", reason: "evidence-unavailable" };
    const lifecycle = await deps.revalidateLifecycleContribution({
      ...lifecycleInput,
      paths: lifecyclePaths,
      regenerablePaths,
    });
    if (lifecycle.status !== "ok") {
      return {
        status: "refused",
        reason: "lifecycle-contribution",
        deliverableId: member.deliverableId,
        paths: lifecycle.paths,
      };
    }
  }
  return closeMechanicalDeliveryEligibility(snapshot, deps);
}

async function closeMechanicalDeliveryEligibility(
  snapshot: DeliveryEligibilitySnapshot,
  deps: DeliveryEligibilityDependencies,
): Promise<{ readonly status: "eligible"; readonly snapshot: DeliveryEligibilitySnapshot } | DeliveryEligibilityRefusal> {
  const firstMember = snapshot.members[0];
  const finalCandidate = snapshot.members.at(-1);
  if (firstMember === undefined || finalCandidate === undefined) {
    return { status: "refused", reason: "candidate-unavailable" };
  }
  const currentRelation = await predecessorRelation({
    memberHead: firstMember.head,
    observedTip: snapshot.protectedBase.head,
  }, {
    readAncestry: (ancestor, descendant) => deps.readAncestry(ancestor, descendant),
    readOverlap: (leftRevision, rightRevision) => deps.readOverlap({
      leftRevision,
      rightRevision,
      workUnitId: snapshot.workUnitId,
    }),
  });
  if (currentRelation.status === "unavailable") return { status: "refused", reason: "evidence-unavailable" };
  // Both non-resolved arms take the same dispositions here as at the prepare-time reader: each states its own,
  // rather than one widened "not resolved" guard parking a terminal and a recoverable cause under one reason.
  if (currentRelation.status === "ambiguous") {
    return {
      status: "refused",
      reason: "ambiguous-predecessor-base",
      deliverableId: firstMember.deliverableId,
      observedTip: currentRelation.observedTip,
      detail: currentRelation.detail,
      remedy: currentRelation.remedy,
    };
  }
  if (currentRelation.status === "unrelated") {
    return {
      status: "refused",
      reason: "unrelated-predecessor",
      deliverableId: firstMember.deliverableId,
      observedTip: currentRelation.observedTip,
      detail: currentRelation.detail + UNRELATED_LINEAGE_REMEDY_DETAIL,
      remedy: { kind: "delivery-authoring-rebuild-required", automatedCommand: null },
    };
  }
  // Read from the fresh observation rather than from the relation the snapshot carries, and decided before the
  // comparison below rather than after it: a snapshot holding content it may not proceed over reobserves
  // identically and compares equal, so consistency with it establishes nothing about whether it may close.
  if (currentRelation.relation.kind === "diverged"
    && currentRelation.relation.overlap.substantivePaths.length > 0) {
    return {
      status: "refused",
      reason: "wrong-predecessor",
      deliverableId: firstMember.deliverableId,
      relation: currentRelation.relation,
      paths: currentRelation.relation.overlap.substantivePaths,
      detail: OVERLAPPING_MOVEMENT_DETAIL,
      remedy: { kind: "delivery-authoring-rebuild-required", automatedCommand: null },
    };
  }
  if (!samePredecessorRelation(currentRelation.relation, snapshot.predecessorRelation)) {
    return {
      status: "refused",
      reason: "wrong-predecessor",
      deliverableId: firstMember.deliverableId,
      relation: currentRelation.relation,
      detail: "The reobserved predecessor relation does not match the prepared snapshot.",
    };
  }
  // Past the guard above every variant accepts, each on its own grounds rather than by omission: a member
  // behind the tip diffs empty against the merge base, so `rewound` has no overlap that could refuse, and
  // `unchanged` and `advanced` return before one is read at all. `diverged` is the only variant whose content
  // decides, which is why it is the only one guarded. What remains is a coordinate check, not an admissibility
  // one — that the chain base the snapshot pinned is the one the fresh read reaches.
  const relationChainBaseHead = currentRelation.relation.chainBase;
  if (snapshot.chainBase.head !== relationChainBaseHead) {
    return {
      status: "refused",
      reason: "wrong-predecessor",
      deliverableId: firstMember.deliverableId,
      relation: currentRelation.relation,
      detail: "The snapshot chain base does not match the freshly reobserved predecessor relation.",
    };
  }
  const currentChainBase = relationChainBaseHead === snapshot.protectedBase.head
    ? snapshot.protectedBase
    : await deps.observeRef(relationChainBaseHead);
  if (currentChainBase === null || currentChainBase.head !== relationChainBaseHead
    || currentChainBase.tree !== snapshot.chainBase.tree) {
    return { status: "refused", reason: "evidence-unavailable" };
  }
  const expectedRegenerablePaths = deriveDeliveryRegenerablePaths(snapshot.lifecyclePaths, snapshot.workUnitId);
  if (!samePaths(expectedRegenerablePaths, snapshot.regenerablePaths)) {
    return { status: "refused", reason: "lifecycle-paths-moved" };
  }
  const completeness = await deps.compareNormalizedCompleteness({
    protectedBase: snapshot.protectedBase,
    chainBase: snapshot.chainBase,
    top: snapshot.top,
    finalCandidate,
    lifecyclePaths: snapshot.lifecyclePaths,
    regenerablePaths: snapshot.regenerablePaths,
  });
  if (completeness.status !== "match") {
    return {
      status: "refused",
      reason: completeness.reason === "unavailable"
        ? "evidence-unavailable"
        : `completeness-${completeness.reason}`,
    };
  }
  const currentPlan = await deps.readCurrentPlan(snapshot.planId);
  if (currentPlan === null || currentPlan.planRevision !== snapshot.planRevision
    || currentPlan.planDigest !== snapshot.planDigest) {
    return { status: "refused", reason: "plan-moved" };
  }
  for (const member of snapshot.members) {
    const binding = await deps.resolveMember(member.head);
    if (binding.status === "refused") return { status: "refused", reason: "evidence-unavailable" };
    if (binding.value !== null && (binding.value.planId !== snapshot.planId
      || binding.value.workUnitId !== snapshot.workUnitId
      || binding.value.deliverableId !== member.deliverableId)) {
      return { status: "refused", reason: "head-already-bound", deliverableId: member.deliverableId };
    }
  }
  const refs = [snapshot.protectedBase, snapshot.top, ...snapshot.members];
  const currentRefs = await Promise.all(refs.map((entry) => deps.observeRef(entry.ref)));
  for (const [index, entry] of currentRefs.entries()) {
    const expected = refs[index];
    if (expected === undefined) return { status: "refused", reason: "evidence-unavailable" };
    if (entry === null || entry.head !== expected.head || entry.tree !== expected.tree) {
      return {
        status: "refused",
        reason: "source-moved",
        source: {
          ref: expected.ref,
          expected: { head: expected.head, tree: expected.tree },
          observed: entry ?? null,
        },
        nextAction: {
          kind: "reprepare-delivery-eligibility",
          planId: snapshot.planId,
          protectedBaseRef: snapshot.protectedBase.ref,
          topRef: snapshot.top.ref,
          candidates: snapshot.members.map(({ deliverableId, ref }) => ({ deliverableId, ref })),
          lifecyclePaths: snapshot.lifecyclePaths,
        },
      };
    }
  }
  return { status: "eligible", snapshot };
}

function samePredecessorRelation(
  left: DeliveryPredecessorRelation,
  right: DeliveryPredecessorRelation,
): boolean {
  // The coordinates every variant carries are compared once, ahead of the kind, so each arm below states
  // only what its own variant adds to them.
  if (left.observedTip !== right.observedTip || left.chainBase !== right.chainBase) return false;
  switch (left.kind) {
    case "unchanged":
      return right.kind === "unchanged";
    case "advanced":
      return right.kind === "advanced";
    case "rewound":
      return right.kind === "rewound" && sameMergeBasedRelation(left, right);
    case "diverged":
      return right.kind === "diverged" && sameMergeBasedRelation(left, right)
        && left.mergeBaseCount === right.mergeBaseCount;
  }
}

/** The merge base and overlap shared by the two variants that name one. */
function sameMergeBasedRelation(
  left: Extract<DeliveryPredecessorRelation, { readonly mergeBase: string }>,
  right: Extract<DeliveryPredecessorRelation, { readonly mergeBase: string }>,
): boolean {
  return left.mergeBase === right.mergeBase && sameOverlap(left.overlap, right.overlap);
}

function sameOverlap(
  left: Extract<RevisionOverlapResult, { readonly status: "available" }>["overlap"],
  right: Extract<RevisionOverlapResult, { readonly status: "available" }>["overlap"],
): boolean {
  return left.substantivePaths.length === right.substantivePaths.length
    && left.substantivePaths.every((path, index) => path === right.substantivePaths[index])
    && left.regenerablePaths.length === right.regenerablePaths.length
    && left.regenerablePaths.every((path, index) => path === right.regenerablePaths[index]);
}

function samePaths(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((path, index) => path === right[index]);
}

function validateDeliveryCandidateGateResults(
  snapshot: DeliveryEligibilitySnapshot,
  results: readonly DeliveryCandidateGateResult[],
): DeliveryEligibilityRefusal | null {
  if (new Set(results.map((result) => result.deliverableId)).size !== results.length) {
    return { status: "refused", reason: "duplicate-gate-result" };
  }
  if (results.length < snapshot.members.length) return { status: "refused", reason: "missing-gate-result" };
  for (const [index, result] of results.entries()) {
    const member = snapshot.members[index];
    if (member === undefined || result.deliverableId !== member.deliverableId) {
      return { status: "refused", reason: "reordered-gate-result" };
    }
    if (result.head !== member.head || result.tree !== member.tree) {
      return { status: "refused", reason: "gate-result-stale", deliverableId: member.deliverableId };
    }
    if (result.status !== "passed") {
      return { status: "refused", reason: "gate-result-failed", deliverableId: member.deliverableId };
    }
  }
  return null;
}

function byteSort(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left), Buffer.from(right));
}
