/** Provider-neutral predecessor relation classification for delivery eligibility. */

import type { RevisionOverlapResult } from "../git/base-overlap.js";

type AvailableOverlap = Extract<RevisionOverlapResult, { readonly status: "available" }>;

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
  readAncestry(ancestor: string, descendant: string): Promise<"ancestor" | "not-ancestor" | "unresolvable">;
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
