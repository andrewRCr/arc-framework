/** Typed transition authority projected into receipt-blind project composition. */

import type { CanonicalDigest } from "../canonical/canonical-json.js";

const prospectiveAuthority: unique symbol = Symbol("prospective-transition-authority");
const validatedAuthority: unique symbol = Symbol("validated-transition-authority");

/** Minimal suppression facts consumed by shared project-record composition. */
export interface TransitionOverlayCompositionInput {
  origin: string;
  sourceBranch: string;
}

/** Plan-bound candidate-only suppression; never durable transition authority. */
export interface ProspectiveTransitionOverlay extends TransitionOverlayCompositionInput {
  kind: "prospective";
  planId: CanonicalDigest;
  readonly [prospectiveAuthority]: true;
}

/** Finalized-validator suppression authority for durable consumers. */
export interface ValidatedTransitionOverlay extends TransitionOverlayCompositionInput {
  kind: "validated";
  readonly [validatedAuthority]: true;
}

/**
 * Create one opaque plan-bound transition overlay.
 *
 * @param input - Exact suppression facts and immutable plan identity
 * @returns Candidate-only transition authority
 */
export function createProspectiveTransitionOverlay(
  input: TransitionOverlayCompositionInput & { planId: CanonicalDigest },
): ProspectiveTransitionOverlay {
  return {
    kind: "prospective",
    origin: input.origin,
    sourceBranch: input.sourceBranch,
    planId: input.planId,
  } as ProspectiveTransitionOverlay;
}

/**
 * Create finalized transition authority.
 *
 * This constructor is owned by the canonical finalized validator. Other
 * consumers receive its result instead of reconstructing authority.
 *
 * @param input - Canonically validated suppression facts
 * @returns Durable transition authority
 */
export function createValidatedTransitionOverlay(
  input: TransitionOverlayCompositionInput,
): ValidatedTransitionOverlay {
  return {
    kind: "validated",
    origin: input.origin,
    sourceBranch: input.sourceBranch,
  } as ValidatedTransitionOverlay;
}

/**
 * Strip authority identity before entering shared project-record composition.
 *
 * @param overlay - Plan-bound or finalized transition authority
 * @returns Minimal receipt-blind suppression facts
 */
export function transitionOverlayCompositionInput(
  overlay: ProspectiveTransitionOverlay | ValidatedTransitionOverlay,
): TransitionOverlayCompositionInput {
  return {
    origin: overlay.origin,
    sourceBranch: overlay.sourceBranch,
  };
}
