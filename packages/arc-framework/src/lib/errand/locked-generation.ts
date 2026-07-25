/** One record-lock generation, shared by the transient operations that mutate outside the record. */

import type { LocusMutationResultV1, LocusRefusalReason } from "../locus/schema/index.js";

/**
 * The locked record, addressable both as evidence and as the authoritative pop.
 *
 * `validate` proves the locked record is the caller's own exact generation without mutating it, so
 * ownership is established before anything outside the record is touched. `pop` performs the
 * authoritative read-validate-remove; it revalidates on its own terms rather than trusting `validate`.
 */
export interface LockedLocusGeneration {
  validate(): Promise<{ kind: "owned" | "absent" } | { kind: "refused"; reason: LocusRefusalReason }>;
  pop(): Promise<LocusMutationResultV1>;
}

export type LockedLocusGenerationAcquisition =
  | { kind: "acquired"; generation: LockedLocusGeneration; release(): Promise<void> }
  | { kind: "refused"; reason: "live" | "unknown" | "timeout" };
