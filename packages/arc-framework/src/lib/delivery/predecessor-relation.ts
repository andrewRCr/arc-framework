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
  | { readonly kind: "unchanged"; readonly observedTip: string; readonly chainBase: string }
  | { readonly kind: "advanced"; readonly observedTip: string; readonly chainBase: string }
  | {
      readonly kind: "rewound";
      readonly observedTip: string;
      readonly chainBase: string;
      readonly mergeBase: string;
      readonly overlap: AvailableOverlap["overlap"];
    }
  | {
      readonly kind: "diverged";
      readonly observedTip: string;
      readonly chainBase: string;
      readonly mergeBase: string;
      readonly overlap: AvailableOverlap["overlap"];
    };

export type PredecessorRelationRead =
  | { readonly status: "resolved"; readonly relation: DeliveryPredecessorRelation }
  | {
      readonly status: "ambiguous";
      readonly memberHead: string;
      readonly observedTip: string;
      readonly detail: string;
      /** Merging the observed tip in leaves one merge base where there were two, which is what clears this. */
      readonly remedy: {
        readonly kind: "delivery-base-merge-required";
        readonly automatedCommand: readonly string[];
      };
    }
  | { readonly status: "unrelated"; readonly observedTip: string; readonly detail: string }
  | { readonly status: "unavailable"; readonly detail: string };

export interface PredecessorRelationDependencies {
  readAncestry(ancestor: string, descendant: string): Promise<AncestryAnswer>;
  readOverlap(leftRevision: string, rightRevision: string): Promise<RevisionOverlapResult>;
}

/**
 * Relate one delivery member to an independently observed protected-base tip.
 *
 * The tip is the bound element of the pair and the member head is the observed one, which is the inverse of what
 * the names suggest: the question is whether the member still sits on top of the tip it was built against, so a
 * member ahead of the tip is the append-only advance and a member behind it is the rewind.
 *
 * Both ancestry directions are read, because the classification needs both: one answer places a pair only when
 * it is positive, and a pair where neither revision contains the other is what a single read cannot tell from a
 * read that failed. Only a pair whose relation names a merge base is read for one.
 *
 * @param input - Exact member and observed-tip revisions.
 * @param deps - Exact ancestry and overlap readers.
 * @returns The established predecessor relation, or the arm naming why there is none to establish.
 */
export async function predecessorRelation(
  input: { readonly memberHead: string; readonly observedTip: string },
  deps: PredecessorRelationDependencies,
): Promise<PredecessorRelationRead> {
  const [tipInMember, memberInTip] = await Promise.all([
    deps.readAncestry(input.observedTip, input.memberHead),
    deps.readAncestry(input.memberHead, input.observedTip),
  ]);
  const variant = classifyPredecessorRelation({
    boundHead: input.observedTip,
    observedHead: input.memberHead,
    boundIsAncestorOfObserved: tipInMember,
    observedIsAncestorOfBound: memberInTip,
    // An overlap resolves from exactly one base, since a pair leaving more than one leaves by the ambiguous arm
    // below before any relation is built. One is therefore the count every pair reaching a relation is read at.
    mergeBaseCount: 1,
  });
  if (variant.kind === "unknown") {
    return { status: "unavailable", detail: "The observed tip ancestry could not be established." };
  }
  if (variant.kind === "unchanged" || variant.kind === "advanced") {
    return {
      status: "resolved",
      relation: { kind: variant.kind, observedTip: input.observedTip, chainBase: input.observedTip },
    };
  }

  const overlap = await deps.readOverlap(input.memberHead, input.observedTip);
  if (overlap.status === "ambiguous") {
    return {
      status: "ambiguous",
      memberHead: input.memberHead,
      observedTip: input.observedTip,
      detail: overlap.detail,
      remedy: {
        kind: "delivery-base-merge-required",
        automatedCommand: ["git", "merge", input.observedTip],
      },
    };
  }
  if (overlap.status === "unavailable") {
    return { status: "unavailable", detail: overlap.detail };
  }
  if (overlap.status === "unrelated") {
    return { status: "unrelated", observedTip: input.observedTip, detail: overlap.detail };
  }
  if (variant.kind === "rewound") {
    return {
      status: "resolved",
      relation: {
        kind: "rewound",
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
      kind: "diverged",
      observedTip: input.observedTip,
      // Both directions name the same revision here: the best common ancestor is the last coordinate the two
      // still agree on, so it is equally the base the chain sits on and the base the pair was measured from.
      chainBase: overlap.mergeBase,
      mergeBase: overlap.mergeBase,
      overlap: overlap.overlap,
    },
  };
}
