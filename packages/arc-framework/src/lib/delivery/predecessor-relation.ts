/** Provider-neutral predecessor relation classification for delivery eligibility. */

import type { RevisionOverlapResult } from "../git/base-overlap.js";

type AvailableOverlap = Extract<RevisionOverlapResult, { readonly status: "available" }>;

/** How one ordered pair of revisions relates, established by topology alone. */
export type PredecessorRelationVariant =
  | { readonly kind: "unchanged" }
  | { readonly kind: "advanced" }
  | { readonly kind: "rewound" }
  | { readonly kind: "diverged"; readonly mergeBaseCount: number }
  | { readonly kind: "absent" }
  | { readonly kind: "unknown" };

/** What one ancestry read establishes about an ordered pair, including that it established nothing. */
export type AncestryAnswer = "ancestor" | "not-ancestor" | "unresolvable";

/**
 * Name how one ordered pair of revisions relates, from topology alone.
 *
 * Equality is settled by the revisions themselves, before either ancestry answer is consulted: two names for one
 * revision relate as unmoved whatever a read of them reports. Past that, one positive answer is enough to place
 * the pair, since only one direction can hold; divergence needs both answers to say so, so a read that
 * established nothing reports itself rather than arriving as the verdict that neither side contains the other.
 *
 * `absent` is not among the answers here, and does not become one by letting a revision go missing. It says no
 * record binds the subject at all — a prior fact about whether there is a subject to compare, which a pair of
 * revisions consults nothing to establish. Each reader reports it from the binding it already holds, which is
 * also the only place that can tell an absent binding from one naming a revision that no longer resolves.
 *
 * @param input - The bound and observed revisions, the ancestry answers relating them in both directions, and
 *   how many best common ancestors they have — read only where neither contains the other, since containment
 *   leaves exactly one.
 * @returns The relation the topology establishes, or that it established none.
 */
export function classifyPredecessorRelation(input: {
  readonly boundHead: string;
  readonly observedHead: string;
  readonly boundIsAncestorOfObserved: AncestryAnswer;
  readonly observedIsAncestorOfBound: AncestryAnswer;
  readonly mergeBaseCount: number;
}): Exclude<PredecessorRelationVariant, { readonly kind: "absent" }> {
  if (input.boundHead === input.observedHead) {
    return { kind: "unchanged" };
  }
  if (input.boundIsAncestorOfObserved === "ancestor") {
    return { kind: "advanced" };
  }
  if (input.observedIsAncestorOfBound === "ancestor") {
    return { kind: "rewound" };
  }
  if (input.boundIsAncestorOfObserved === "not-ancestor" && input.observedIsAncestorOfBound === "not-ancestor") {
    return { kind: "diverged", mergeBaseCount: input.mergeBaseCount };
  }
  return { kind: "unknown" };
}

export type DeliveryPredecessorRelation =
  | { readonly kind: "exact"; readonly observedTip: string; readonly chainBase: string }
  | {
      readonly kind: "disjoint-ahead";
      readonly observedTip: string;
      readonly chainBase: string;
      readonly mergeBase: string;
      readonly overlap: AvailableOverlap["overlap"];
    }
  | {
      readonly kind: "overlapping-ahead";
      readonly observedTip: string;
      readonly mergeBase: string;
      readonly overlap: AvailableOverlap["overlap"];
    }
  | { readonly kind: "unrelated"; readonly observedTip: string; readonly detail: string };

export type PredecessorRelationRead =
  | { readonly status: "resolved"; readonly relation: DeliveryPredecessorRelation }
  | { readonly status: "unavailable"; readonly detail: string };

export interface PredecessorRelationDependencies {
  readAncestry(ancestor: string, descendant: string): Promise<AncestryAnswer>;
  readOverlap(leftRevision: string, rightRevision: string): Promise<RevisionOverlapResult>;
}

/**
 * Classify one delivery member against an independently observed protected-base tip.
 *
 * @param input - Exact member and observed-tip revisions.
 * @param deps - Exact ancestry and overlap readers.
 * @returns The established predecessor relation, or precise unavailable evidence.
 */
export async function predecessorRelation(
  input: { readonly memberHead: string; readonly observedTip: string },
  deps: PredecessorRelationDependencies,
): Promise<PredecessorRelationRead> {
  const ancestry = await deps.readAncestry(input.observedTip, input.memberHead);
  if (ancestry === "unresolvable") {
    return { status: "unavailable", detail: "The observed tip ancestry could not be established." };
  }
  if (ancestry === "ancestor") {
    return {
      status: "resolved",
      relation: { kind: "exact", observedTip: input.observedTip, chainBase: input.observedTip },
    };
  }

  const overlap = await deps.readOverlap(input.memberHead, input.observedTip);
  // Interim: a history leaving more than one base arrives here as unavailable. That is fail-closed but says
  // less than the read knows, and the four-arm read wrapper is what gives it somewhere of its own to land
  // and undoes this fold.
  if (overlap.status === "unavailable" || overlap.status === "ambiguous") {
    return { status: "unavailable", detail: overlap.detail };
  }
  if (overlap.status === "unrelated") {
    return {
      status: "resolved",
      relation: { kind: "unrelated", observedTip: input.observedTip, detail: overlap.detail },
    };
  }
  if (overlap.overlap.substantivePaths.length === 0) {
    return {
      status: "resolved",
      relation: {
        kind: "disjoint-ahead",
        observedTip: input.observedTip,
        chainBase: overlap.mergeBase,
        mergeBase: overlap.mergeBase,
        overlap: overlap.overlap,
      },
    };
  }
  return {
    status: "resolved",
    relation: {
      kind: "overlapping-ahead",
      observedTip: input.observedTip,
      mergeBase: overlap.mergeBase,
      overlap: overlap.overlap,
    },
  };
}
