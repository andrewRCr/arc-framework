/** Exact delivery review target selection from state-backed coordinates. */

import type { ChangeRequestTargetRef } from "./change-request.js";

export function deliveryHeadRef(ref: string | null): string | null {
  if (ref === null) return null;
  return ref.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : ref;
}


function selectedHeadMatches(
  input: Parameters<typeof selectDeliveryReviewStatusTarget>[0],
  selected: NonNullable<Parameters<typeof selectDeliveryReviewStatusTarget>[0]["firstOutstanding"]>,
  stateHead: string,
): boolean {
  return stateHead === selected.target.headSha
    || (selected.vehicle.deliverableId === input.terminalDeliverableId
      && input.terminalAdvance?.stateHead === stateHead
      && input.terminalAdvance.currentHead === selected.target.headSha);
}

/**
 * Select the exact current member target, carrying only a previously validated terminal advance.
 *
 * @param input - Durable state, routed conjunction, and optional validated terminal movement.
 * @returns The exact selected target plus its state-backed member lookup head, or null when unjustified.
 */
export function selectDeliveryReviewStatusTarget(input: {
  readonly anchor: ChangeRequestTargetRef;
  readonly terminalPullRequest: number;
  readonly terminalDeliverableId: string;
  readonly stateMembers: readonly {
    readonly deliverableId: string;
    readonly ref: string | null;
    readonly coordinates: { readonly head: string } | null;
  }[];
  readonly outstanding: boolean;
  readonly firstOutstanding?: {
    readonly vehicle: { readonly deliverableId: string };
    readonly target: { readonly repository: string; readonly pullRequest: number; readonly headSha: string };
  };
  readonly terminalAdvance?: { readonly stateHead: string; readonly currentHead: string };
}): {
  readonly target: ChangeRequestTargetRef;
  readonly pullRequest: number;
  readonly deliveryLookupHeadSha: string;
} | null {
  if (!input.outstanding) {
    const headSha = input.terminalAdvance?.stateHead === input.anchor.headSha
      ? input.terminalAdvance.currentHead
      : input.anchor.headSha;
    return {
      target: { ...input.anchor, headSha },
      pullRequest: input.terminalPullRequest,
      deliveryLookupHeadSha: input.anchor.headSha,
    };
  }
  const selected = input.firstOutstanding;
  const selectedState = selected === undefined
    ? undefined
    : input.stateMembers.find(({ deliverableId }) => deliverableId === selected.vehicle.deliverableId);
  const selectedHeadRef = deliveryHeadRef(selectedState?.ref ?? null);
  if (selected === undefined || selectedState?.coordinates === null
    || selectedState?.coordinates === undefined || selectedHeadRef === null) return null;
  if (!selectedHeadMatches(input, selected, selectedState.coordinates.head)) return null;
  return {
    target: {
      repository: selected.target.repository,
      headRef: selectedHeadRef,
      headSha: selected.target.headSha,
    },
    pullRequest: selected.target.pullRequest,
    deliveryLookupHeadSha: selectedState.coordinates.head,
  };
}
