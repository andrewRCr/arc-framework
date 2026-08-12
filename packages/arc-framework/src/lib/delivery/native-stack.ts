/** Provider-neutral native-stack observation and presentation-only linking. */

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

export type DeliveryNativeStackReadResult = DeliveryNativeStackObservation
  | { readonly status: "refused"; readonly reason: "foreign-repository" | "non-chain" | "invalid-input" };

function validateInput(input: DeliveryNativeStackInput): DeliveryNativeStackReadResult | null {
  if (input.repository === "" || input.members.length < 2) return { status: "refused", reason: "invalid-input" };
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
  | { readonly status: "linked"; readonly stackNumber: number; readonly recommendedActionText: string }
  | { readonly status: "unlinked"; readonly recommendedActionText: string }
  | { readonly status: "downgrade-required"; readonly reason: string; readonly recommendedActionText: string }
  | { readonly status: "refused"; readonly reason: string; readonly recommendedActionText: string };

/** Optionally register an already-materialized chain, then trust only a fresh exact observation. */
export async function linkDeliveryNativeStack(
  input: DeliveryNativeStackInput & { readonly optIn: boolean },
  port: DeliveryNativeStackPort,
): Promise<DeliveryNativeStackLinkResult> {
  if (!input.optIn) {
    return { status: "unlinked", recommendedActionText: "Continue through the complete unlinked executor." };
  }
  const initial = await observeDeliveryNativeStack(input, port);
  if (initial.status === "refused") {
    return { status: "refused", reason: initial.reason, recommendedActionText: "Correct the exact chain before linking." };
  }
  if (initial.status === "registered") {
    return { status: "linked", stackNumber: initial.stackNumber, recommendedActionText: "Continue with fresh native-stack observation before each landing." };
  }
  if (initial.status !== "unregistered") {
    return { status: "downgrade-required", reason: initial.status, recommendedActionText: "Use the explicit unlink or downgrade path before landing." };
  }
  const submitted = await port.link(input);
  if (submitted.status === "refused") {
    return { status: "downgrade-required", reason: submitted.reason, recommendedActionText: "Linking was unavailable; explicitly confirm unlinked delivery before landing." };
  }
  const observed = await observeDeliveryNativeStack(input, port);
  return observed.status === "registered"
    ? { status: "linked", stackNumber: observed.stackNumber, recommendedActionText: "Continue with fresh native-stack observation before each landing." }
    : { status: "downgrade-required", reason: observed.status, recommendedActionText: "Linking was not authoritatively confirmed; unlink or continue only after a fresh unregistered observation." };
}
