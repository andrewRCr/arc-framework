/** Total tier classification over the locus refusal vocabulary. */

import { type LocusStopReason } from "./schema/index.js";

/**
 * What a refusal costs to be wrong about, and therefore who may act past it.
 *
 * The vocabulary is one flat set whose members differ enormously in consequence, so treating every
 * member as equally fatal makes a healthy state unreachable while treating none as fatal opens a
 * concurrency hole. The tier is the budget: exactness on the paths that destroy work, judgment on
 * the paths that do not.
 *
 * - `hard` — proceeding destroys or strands work, or the evidence needed to act is absent rather
 *   than merely unverified. No override exists at any layer.
 * - `authority` — the target is established but its disposition needs evidence the caller cannot
 *   supply and the operator can. Releasable by operator confirmation, never by agent assertion.
 * - `advisory` — the code cannot verify a condition that session context may settle, and proceeding
 *   destroys nothing.
 */
export type LocusStopTier = "hard" | "authority" | "advisory";

/**
 * Every published stop reason, classified into exactly one tier.
 *
 * The exhaustive `Record` is the mechanism rather than the documentation: a member added to
 * `LocusStopReasonSchema` fails to compile here until it is classified, so the vocabulary cannot
 * grow a reason whose tier nobody decided.
 */
const STOP_TIERS: Readonly<Record<LocusStopReason, LocusStopTier>> = {
  // Allocation preconditions on non-destructive paths. Nothing is lost by proceeding, and the
  // session often holds the context that settles them.
  "primary-dirty": "advisory",
  "primary-off-base": "advisory",

  // Positive evidence of another session. There is no confirmation to give: the operator's context
  // does not contradict a live foreign process, so releasing here would open a concurrency hole.
  "lease-live": "hard",
  "lock-live": "hard",

  // The target itself is unestablished — unparseable, unreadable by this version, ambiguous between
  // two records, owned by another identity, or structurally not the role it claims. Acting would be
  // acting on something unidentified.
  "record-malformed": "hard",
  "unsupported-version": "hard",
  "duplicate-locus": "hard",
  "cross-identity": "hard",
  "identity-malformed": "hard",
  "role-conflict": "hard",

  // The target is established; what became of it is what cannot be proven locally. An operator can
  // attest to a checkout they created, moved, or removed where no inspector can.
  "lease-unknown": "authority",
  "lock-unknown": "authority",
  "path-unavailable": "authority",
  "marker-missing": "authority",
  "subject-unresolved": "authority",
};

/**
 * Classify one refusal.
 *
 * @param reason - a published stop reason
 * @returns the tier deciding who, if anyone, may act past it
 */
export function locusStopTier(reason: LocusStopReason): LocusStopTier {
  return STOP_TIERS[reason];
}

