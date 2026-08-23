/** Provider-neutral native-stack observation and presentation-only linking. */

import type { DeliveryPlanV1, DeliveryStateV1 } from "./schema.js";
import { validateDeliveryStateAgainstPlan } from "./state.js";

export interface DeliveryNativeStackMember {
  readonly deliverableId: string;
  readonly changeRequestId: string;
  readonly headRef: string;
  readonly headSha: string;
  readonly baseRef: string;
  readonly headRepository?: string;
}

export interface DeliveryNativeStackInput {
  readonly repository: string;
  readonly members: readonly DeliveryNativeStackMember[];
}

export type DeriveDeliveryNativeRegistrationInputResult =
  | { readonly status: "derived"; readonly input: DeliveryNativeStackInput }
  | { readonly status: "refused"; readonly reason: "invalid-input" | "state-mismatch" | "member-unbound" };

/**
 * Derive the provider registration subject from the exact planned non-terminal member set.
 *
 * @param input - Exact plan, bound state, repository, and protected base ref.
 * @returns A plan-ordered registration input, or a closed refusal when it cannot be derived.
 */
export function deriveDeliveryNativeRegistrationInput(input: {
  readonly plan: DeliveryPlanV1;
  readonly state: DeliveryStateV1;
  readonly repository: string;
  readonly baseRef: string;
}): DeriveDeliveryNativeRegistrationInputResult {
  if (input.repository === "" || !input.baseRef.startsWith("refs/heads/")) {
    return { status: "refused", reason: "invalid-input" };
  }
  const coherence = validateDeliveryStateAgainstPlan(input.state, input.plan);
  if (coherence.status !== "valid" || input.plan.projection.kind !== "stack-to-main") {
    return { status: "refused", reason: "state-mismatch" };
  }

  const registeredStateMembers = coherence.state.members.slice(0, -1);
  const members: DeliveryNativeStackMember[] = [];
  for (const [index, member] of registeredStateMembers.entries()) {
    if (member.ref === null || !member.ref.startsWith("refs/heads/")
      || member.changeRequest === null || member.coordinates === null) {
      return { status: "refused", reason: "member-unbound" };
    }
    const predecessor = registeredStateMembers[index - 1];
    const baseRef = index === 0 ? input.baseRef : predecessor?.ref;
    if (baseRef === undefined || baseRef === null || !baseRef.startsWith("refs/heads/")) {
      return { status: "refused", reason: "member-unbound" };
    }
    members.push({
      deliverableId: member.deliverableId,
      changeRequestId: member.changeRequest.changeRequestId,
      headRef: member.ref.slice("refs/heads/".length),
      headSha: member.coordinates.head,
      baseRef: baseRef.slice("refs/heads/".length),
      headRepository: input.repository,
    });
  }
  return { status: "derived", input: { repository: input.repository, members } };
}

export type DeliveryNativeStackObservation =
  | { readonly status: "registered"; readonly stackNumber: number }
  | { readonly status: "unregistered" }
  | { readonly status: "partial" | "incoherent"; readonly affectedDeliverableIds: readonly string[] }
  | { readonly status: "unsupported" | "unavailable" | "malformed" | "ambiguous" };

export interface DeliveryNativeStackPort {
  observe(input: DeliveryNativeStackInput): Promise<DeliveryNativeStackObservation>;
  link(input: DeliveryNativeStackInput): Promise<
    { readonly status: "submitted" } | { readonly status: "refused"; readonly reason: "unsupported" | "unavailable" | "malformed" }
  >;
}

export interface DeliveryNativeStackUnlinkPort {
  observe(input: DeliveryNativeStackInput): Promise<DeliveryNativeStackObservation>;
  unlink(input: DeliveryNativeStackInput & { readonly stackNumber: number }): Promise<
    { readonly status: "submitted" | "already-unlinked" }
    | { readonly status: "refused"; readonly reason: "unsupported" | "unavailable" | "malformed" }
  >;
}

export type DeliveryNativeStackReadResult = DeliveryNativeStackObservation
  | { readonly status: "refused"; readonly reason: "foreign-repository" | "non-chain" | "invalid-input" };

type DeliveryNativeStackInputRefusal = Extract<DeliveryNativeStackReadResult, { readonly status: "refused" }>;

function validateInput(input: DeliveryNativeStackInput): DeliveryNativeStackInputRefusal | null {
  if (input.repository === "" || input.members.length === 0) return { status: "refused", reason: "invalid-input" };
  const ids = new Set<string>();
  for (const [index, member] of input.members.entries()) {
    if (member.deliverableId === "" || member.changeRequestId === "" || member.headRef === ""
      || member.headSha === "" || member.baseRef === "" || ids.has(member.deliverableId)) {
      return { status: "refused", reason: "invalid-input" };
    }
    ids.add(member.deliverableId);
    if (member.headRepository !== undefined && member.headRepository !== input.repository) {
      return { status: "refused", reason: "foreign-repository" };
    }
    if (index > 0 && member.baseRef !== input.members[index - 1]?.headRef) {
      return { status: "refused", reason: "non-chain" };
    }
  }
  return null;
}

/** Observe an exact authored chain; provider order is accepted only after exact validation. */
export async function observeDeliveryNativeStack(
  input: DeliveryNativeStackInput,
  port: Pick<DeliveryNativeStackPort, "observe">,
): Promise<DeliveryNativeStackReadResult> {
  const invalid = validateInput(input);
  if (invalid !== null) return invalid;
  try {
    return await port.observe(input);
  } catch {
    return { status: "unavailable" };
  }
}

export type DeliveryNativeStackLinkResult =
  | {
      readonly status: "decision-required";
      readonly recommendedOptInText: string;
      readonly recommendedOptOutText: string;
      readonly recommendedActionText: string;
    }
  | { readonly status: "linked"; readonly stackNumber: number; readonly recommendedActionText: string }
  | { readonly status: "unlinked"; readonly recommendedActionText: string }
  | { readonly status: "downgrade-required"; readonly reason: string; readonly recommendedActionText: string }
  | { readonly status: "refused"; readonly reason: string; readonly recommendedActionText: string };

/**
 * Compose the operator-facing native registration choice before any provider read or mutation.
 *
 * @returns The precomposed costs, benefits, and exact continuation for the opt-in field.
 */
export function composeDeliveryNativeStackLinkDecision(): Extract<
  DeliveryNativeStackLinkResult,
  { readonly status: "decision-required" }
> {
  return {
    status: "decision-required",
    recommendedOptInText:
      "Opt in for one attended atomic landing decision over the complete remaining non-terminal set and "
      + "reviewer-facing stack UI for that set. Provider refreshes may rewrite registered heads, so review "
      + "applicability must be re-evaluated before exact-head review can carry; the top remains outside that "
      + "UI and native retarget machinery.",
    recommendedOptOutText:
      "Decline for zero native-registration host calls and the complete sequential unlinked executor. This "
      + "avoids provider-initiated rewrites, but strict up-to-date protection may still require head-rewriting "
      + "refreshes on either route.",
    recommendedActionText:
      "Choose native registration or unlinked delivery, then resubmit this exact request with optIn true or false.",
  };
}

function matchesRegistrationSubject(
  requested: DeliveryNativeStackInput,
  derived: DeliveryNativeStackInput,
): boolean {
  return requested.repository === derived.repository
    && requested.members.length === derived.members.length
    && requested.members.every((member, index) => {
      const expected = derived.members[index];
      return expected !== undefined
        && member.deliverableId === expected.deliverableId
        && member.changeRequestId === expected.changeRequestId
        && member.headRef === expected.headRef
        && member.headSha === expected.headSha
        && member.baseRef === expected.baseRef
        && (member.headRepository ?? requested.repository) === expected.headRepository;
    });
}

/**
 * Register only the exact non-terminal subject derived from one coherent plan and state.
 *
 * @param input - Exact plan/state authority plus the claimed registration request and opt-in.
 * @param port - Native-stack provider boundary.
 * @returns The closed link result without submitting a mismatched registration subject.
 */
export async function linkPlannedDeliveryNativeStack(input: {
  readonly plan: DeliveryPlanV1;
  readonly state: DeliveryStateV1;
  readonly repository: string;
  readonly baseRef: string;
  readonly members: readonly DeliveryNativeStackMember[];
  readonly optIn: boolean;
}, port: DeliveryNativeStackPort): Promise<DeliveryNativeStackLinkResult> {
  const derived = deriveDeliveryNativeRegistrationInput(input);
  if (derived.status !== "derived") {
    return {
      status: "refused",
      reason: derived.reason,
      recommendedActionText: "Restore exact bound delivery state before native registration.",
    };
  }
  if (!matchesRegistrationSubject(input, derived.input)) {
    return {
      status: "refused",
      reason: "registration-scope-mismatch",
      recommendedActionText: "Register exactly the current planned non-terminal member set.",
    };
  }
  return linkDeliveryNativeStack({ ...derived.input, optIn: input.optIn }, port);
}

/** Optionally register an already-materialized chain, then trust only a fresh exact observation. */
export async function linkDeliveryNativeStack(
  input: DeliveryNativeStackInput & { readonly optIn: boolean },
  port: DeliveryNativeStackPort,
): Promise<DeliveryNativeStackLinkResult> {
  const invalid = validateInput(input);
  if (invalid !== null) {
    return {
      status: "refused",
      reason: invalid.reason,
      recommendedActionText: "Correct the exact chain before linking.",
    };
  }
  if (!input.optIn) {
    return { status: "unlinked", recommendedActionText: "Continue through the complete unlinked executor." };
  }
  if (input.members.length < 2) {
    return {
      status: "unlinked",
      recommendedActionText: "Native registration needs at least two members; continue through the unlinked executor.",
    };
  }
  const subject: DeliveryNativeStackInput = { repository: input.repository, members: input.members };
  const initial = await observeDeliveryNativeStack(subject, port);
  if (initial.status === "refused") {
    return { status: "refused", reason: initial.reason, recommendedActionText: "Correct the exact chain before linking." };
  }
  if (initial.status === "registered") {
    return { status: "linked", stackNumber: initial.stackNumber, recommendedActionText: "Continue with fresh native-stack observation before each landing." };
  }
  if (initial.status !== "unregistered") {
    return { status: "downgrade-required", reason: initial.status, recommendedActionText: "Use the explicit unlink or downgrade path before landing." };
  }
  const submitted = await port.link(subject);
  if (submitted.status === "refused") {
    return { status: "downgrade-required", reason: submitted.reason, recommendedActionText: "Linking was unavailable; explicitly confirm unlinked delivery before landing." };
  }
  const observed = await observeDeliveryNativeStack(subject, port);
  return observed.status === "registered"
    ? { status: "linked", stackNumber: observed.stackNumber, recommendedActionText: "Continue with fresh native-stack observation before each landing." }
    : { status: "downgrade-required", reason: observed.status, recommendedActionText: "Linking was not authoritatively confirmed; unlink or continue only after a fresh unregistered observation." };
}

export type DeliveryNativeStackDegradationResult =
  | { readonly status: "unlinked"; readonly recommendedActionText: string }
  | { readonly status: "blocked"; readonly reason: string; readonly recommendedActionText: string };

/** Remove presentation linkage and admit sequential execution only after a fresh unregistered read. */
export async function degradeNativeDeliveryStack(
  input: DeliveryNativeStackInput,
  port: DeliveryNativeStackUnlinkPort,
): Promise<DeliveryNativeStackDegradationResult> {
  const initial = await observeDeliveryNativeStack(input, port);
  if (initial.status === "refused") {
    return {
      status: "blocked", reason: initial.reason,
      recommendedActionText: "Correct the exact chain before attempting native-stack degradation.",
    };
  }
  if (initial.status === "unregistered") {
    return { status: "unlinked", recommendedActionText: "Native presentation is absent; continue through the complete sequential unlinked executor." };
  }
  if (initial.status !== "registered") {
    return {
      status: "blocked", reason: initial.status,
      recommendedActionText: "Restore authoritative native-stack observation before any landing mutation.",
    };
  }
  const mutation = await port.unlink({ ...input, stackNumber: initial.stackNumber });
  const observed = await observeDeliveryNativeStack(input, port);
  if (observed.status === "unregistered") {
    return { status: "unlinked", recommendedActionText: "Native presentation is removed; continue through the complete sequential unlinked executor." };
  }
  if (mutation.status === "refused") {
    return {
      status: "blocked", reason: `unlink-${mutation.reason}`,
      recommendedActionText: "Retry unlink when the host is available; do not land while native linkage remains authoritative.",
    };
  }
  return {
    status: "blocked", reason: observed.status,
    recommendedActionText: "Native unlink was not authoritatively confirmed; stop before any landing mutation.",
  };
}
