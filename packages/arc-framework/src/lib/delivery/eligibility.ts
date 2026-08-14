/** Mechanical validation for an operator-authored delivery candidate chain. */

import { validateDeliveryPlanRecord } from "./plan.js";
import type { DeliveryPlanV1 } from "./schema.js";

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

/** Ephemeral mechanical snapshot; never a persisted authorization token. */
export interface DeliveryEligibilitySnapshot {
  readonly planId: string;
  readonly workUnitId: string;
  readonly planRevision: number;
  readonly planDigest: string;
  readonly protectedBase: DeliveryEligibilityCoordinates & { readonly ref: string };
  readonly control: DeliveryEligibilityCoordinates & { readonly ref: string };
  readonly members: readonly DeliveryEligibilityMember[];
  readonly lifecyclePaths: readonly string[];
}

/** Read-only dependencies used by eligibility preparation, gate bracketing, and close. */
export interface DeliveryEligibilityDependencies {
  observeRef(ref: string): Promise<DeliveryEligibilityCoordinates | null>;
  readAncestry(ancestor: string, descendant: string): Promise<"ancestor" | "not-ancestor" | "unresolvable">;
  revalidateLifecycleContribution(input: {
    readonly protectedBaseRef: string;
    readonly candidateRef: string;
    readonly paths: readonly string[];
  }): Promise<{ readonly status: "ok" } | { readonly status: "refused"; readonly paths: readonly string[] }>;
  compareNormalizedCompleteness(input: {
    readonly protectedBase: DeliveryEligibilityCoordinates & { readonly ref: string };
    readonly control: DeliveryEligibilityCoordinates & { readonly ref: string };
    readonly finalCandidate: DeliveryEligibilityMember;
    readonly lifecyclePaths: readonly string[];
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

/** Closed refusal from any mechanical eligibility stage. */
export interface DeliveryEligibilityRefusal {
  readonly status: "refused";
  readonly reason:
    | "invalid-stack-plan"
    | "missing-candidate"
    | "extra-candidate"
    | "duplicate-candidate"
    | "reordered-candidate"
    | "candidate-unavailable"
    | "wrong-predecessor"
    | "empty-candidate"
    | "lifecycle-contribution"
    | "checkout-dirty"
    | "checkout-moved"
    | "lifecycle-paths-moved"
    | "completeness-dropped"
    | "completeness-invented"
    | "completeness-mismatched"
    | "evidence-unavailable"
    | "source-moved"
    | "plan-moved"
    | "head-already-bound";
  readonly deliverableId?: string;
  /** Every mismatching lifecycle-contribution path; present only for `lifecycle-contribution` refusals. */
  readonly paths?: readonly string[];
}

/** Dependencies that keep plan and lifecycle discovery inside one mutation observation window. */
export interface FreshDeliveryEligibilityMutationDependencies<Result>
extends DeliveryEligibilityDependencies {
  resolveLifecyclePaths(plan: DeliveryPlanV1): Promise<readonly string[] | null>;
  mutate(input: {
    readonly plan: DeliveryPlanV1;
    readonly snapshot: DeliveryEligibilitySnapshot;
  }): Promise<Result>;
}

/**
 * Consume fresh eligibility in-process without exposing it as mutation authority to the caller.
 *
 * @param input - Plan identity, exact refs, and disposable checkout locators
 * @param deps - Current plan/lifecycle readers, mechanical observers, and the guarded mutation
 * @returns The mutation result, or the first refusal before mutation begins
 */
export async function executeWithFreshDeliveryEligibility<Result>(input: {
  readonly planId: string;
  readonly protectedBaseRef: string;
  readonly controlRef: string;
  readonly memberOffset?: number;
  readonly candidates: readonly {
    readonly deliverableId: string;
    readonly ref: string;
    readonly checkoutPath: string;
  }[];
}, deps: FreshDeliveryEligibilityMutationDependencies<Result>): Promise<Result | DeliveryEligibilityRefusal> {
  const plan = await deps.readCurrentPlan(input.planId);
  if (plan === null) return { status: "refused", reason: "plan-moved" };
  const lifecyclePaths = await deps.resolveLifecyclePaths(plan);
  if (lifecyclePaths === null) return { status: "refused", reason: "evidence-unavailable" };
  const eligible = await revalidateDeliveryEligibilityForMutation({
    ...input,
    plan,
    lifecyclePaths,
  }, deps);
  if (eligible.status !== "eligible") return eligible;
  const currentLifecyclePaths = await deps.resolveLifecyclePaths(plan);
  if (currentLifecyclePaths === null) return { status: "refused", reason: "evidence-unavailable" };
  const normalizedCurrentPaths = [...new Set(currentLifecyclePaths)].sort(byteSort);
  if (normalizedCurrentPaths.length !== eligible.snapshot.lifecyclePaths.length
    || normalizedCurrentPaths.some((path, index) => path !== eligible.snapshot.lifecyclePaths[index])) {
    return { status: "refused", reason: "lifecycle-paths-moved" };
  }
  return deps.mutate({ plan, snapshot: eligible.snapshot });
}

async function revalidateDeliveryEligibilityForMutation(input: {
  readonly plan: DeliveryPlanV1;
  readonly protectedBaseRef: string;
  readonly controlRef: string;
  readonly candidates: readonly {
    readonly deliverableId: string;
    readonly ref: string;
    readonly checkoutPath: string;
  }[];
  readonly lifecyclePaths: readonly string[];
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
  return closeDeliveryEligibility(prepared.snapshot, deps);
}

/** Validate and pin one complete authored candidate chain before workflow-owned gates run. */
export async function prepareDeliveryEligibility(input: {
  readonly plan: DeliveryPlanV1;
  readonly protectedBaseRef: string;
  readonly controlRef: string;
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

  const observed = await Promise.all([
    deps.observeRef(input.protectedBaseRef),
    deps.observeRef(input.controlRef),
    ...input.candidates.map((candidate) => deps.observeRef(candidate.ref)),
  ]);
  const protectedBase = observed[0];
  const control = observed[1];
  if (protectedBase === null || control === null) return { status: "refused", reason: "evidence-unavailable" };
  const members: DeliveryEligibilityMember[] = [];
  for (const [index, candidate] of input.candidates.entries()) {
    const coordinates = observed[index + 2];
    if (coordinates === null || coordinates === undefined) {
      return { status: "refused", reason: "candidate-unavailable", deliverableId: candidate.deliverableId };
    }
    const predecessor = index === 0 ? protectedBase : members[index - 1];
    if (predecessor === undefined) return { status: "refused", reason: "evidence-unavailable" };
    const ancestry = await deps.readAncestry(predecessor.head, coordinates.head);
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
      candidateRef: candidate.ref,
      paths: input.lifecyclePaths,
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
      control: { ref: input.controlRef, ...control },
      members,
      lifecyclePaths: [...new Set(input.lifecyclePaths)].sort(byteSort),
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

/** Close the observation window after workflow-owned gates without writing plan or state. */
export async function closeDeliveryEligibility(
  snapshot: DeliveryEligibilitySnapshot,
  deps: DeliveryEligibilityDependencies,
): Promise<{ readonly status: "eligible"; readonly snapshot: DeliveryEligibilitySnapshot } | DeliveryEligibilityRefusal> {
  const finalCandidate = snapshot.members.at(-1);
  if (finalCandidate === undefined) return { status: "refused", reason: "candidate-unavailable" };
  const completeness = await deps.compareNormalizedCompleteness({
    protectedBase: snapshot.protectedBase,
    control: snapshot.control,
    finalCandidate,
    lifecyclePaths: snapshot.lifecyclePaths,
  });
  if (completeness.status !== "match") {
    return {
      status: "refused",
      reason: completeness.reason === "unavailable"
        ? "evidence-unavailable"
        : `completeness-${completeness.reason}`,
    };
  }
  const refs = [snapshot.protectedBase, snapshot.control, ...snapshot.members];
  const currentRefs = await Promise.all(refs.map((entry) => deps.observeRef(entry.ref)));
  for (const [index, entry] of currentRefs.entries()) {
    const expected = refs[index];
    if (entry === null || expected === undefined
      || entry.head !== expected.head || entry.tree !== expected.tree) {
      return { status: "refused", reason: "source-moved" };
    }
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
  return { status: "eligible", snapshot };
}

function byteSort(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left), Buffer.from(right));
}
