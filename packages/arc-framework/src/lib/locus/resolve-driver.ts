/** Subject-owned dispatch for resolving one exact dead transient locus generation. */

import { createLocusMutationResult } from "./mutation.js";
import type { LocusMutationResultV1, LocusRowV1 } from "./schema/index.js";

export type LocusResolveSubject = "errand" | "housekeep" | "groom";
export type LocusResolveAction = "resume" | "abandon";

export interface LocusResolveDriverDependencies {
  run(subject: LocusResolveSubject, action: LocusResolveAction, key: string): Promise<LocusMutationResultV1>;
}

/** Revalidate safety facts, derive the subject from trusted state, and invoke its lifecycle driver. */
export async function resolveLocusGeneration(options: {
  readonly row: LocusRowV1;
  readonly action: LocusResolveAction;
  readonly checkoutClean: boolean;
  readonly generationProven: boolean;
  readonly dependencies: LocusResolveDriverDependencies;
}): Promise<LocusMutationResultV1> {
  const row = options.row;
  if (row.kind === "duplicate-locus") return refusal("duplicate-locus", "Duplicate session locus authority cannot be resolved automatically.");
  if (row.checkoutPath === null) return refusal("checkout-missing", "The selected transient checkout is missing.");
  if (row.role === null || row.recordId === null) return refusal("record-malformed", "The selected transient role is incomplete.");
  if (row.lease === null) return refusal("record-malformed", "The selected transient role has no dead lease generation.");
  if (row.lease.state === "live") return refusal("lease-live", "The selected transient lease is live.");
  if (row.lease.state === "unknown") return refusal("lease-unknown", "The selected transient lease has unknown liveness.");
  if (!options.checkoutClean || !options.generationProven) {
    return refusal("preservation-unproven", "The selected checkout is dirty or its generation cannot be proven.");
  }
  const subject = deriveSubject(row);
  if (subject === null) return refusal("role-conflict", "The selected role is not a resolvable transient subject.");
  const result = await options.dependencies.run(subject, options.action, row.role.subject.key);
  return createLocusMutationResult({ ...result, operation: "locus-resolve" });
}

function deriveSubject(row: LocusRowV1): LocusResolveSubject | null {
  if (row.role?.kind === "groom" && row.role.subject.kind === "groom") return "groom";
  if (row.role?.kind === "housekeep"
    && (row.role.subject.kind === "housekeep" || row.role.subject.kind === "errand")) return "housekeep";
  if (row.role?.kind === "errand"
    && (row.role.subject.kind === "errand" || row.role.subject.kind === "partial-errand")) return "errand";
  return null;
}

function refusal(
  reason: Extract<LocusMutationResultV1, { outcome: "refused" }>["reason"],
  text: string,
): LocusMutationResultV1 {
  return createLocusMutationResult({ outcome: "refused", operation: "locus-resolve", reason, recommendedPromptText: text });
}
