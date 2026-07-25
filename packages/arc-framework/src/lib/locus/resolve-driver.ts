/** Subject-owned dispatch for resolving one exact dead transient locus generation. */

import { createLocusMutationResult } from "./mutation.js";
import type { SelectedLocusGeneration } from "./selected-generation.js";
import { projectTrustedLocusRow, untrustedRefusalReason } from "./trusted-row.js";
import type { LocusMutationResultV1, LocusRowV1, LocusStopReason } from "./schema/index.js";

export type LocusResolveSubject = "errand" | "housekeep" | "groom";
export type LocusResolveAction = "resume" | "abandon";

/** One subject dispatch carrying the generation this driver validated, not just its reusable key. */
export interface LocusResolveDispatch {
  readonly subject: LocusResolveSubject;
  readonly action: LocusResolveAction;
  readonly key: string;
  readonly selected: SelectedLocusGeneration;
}

export interface LocusResolveDriverDependencies {
  run(dispatch: LocusResolveDispatch): Promise<LocusMutationResultV1>;
}

/**
 * Authority failures an `abandon` may carry and still resolve.
 *
 * An unresolvable subject is the defining condition of the residue abandon exists to clear — a role
 * whose subject retired out from under it — so treating it as disqualifying makes the exit
 * unreachable exactly where it is needed. `resume` gets no such allowance: it reattaches through the
 * subject's own operation driver, which leaves it nothing to reattach to.
 *
 * Every other authority failure stays fatal to both actions, so provenance, identity, version, and
 * path evidence must still hold before anything destructive dispatches.
 */
const ABANDON_TOLERATED_REASONS: ReadonlySet<LocusStopReason> = new Set<LocusStopReason>(["subject-unresolved"]);

/**
 * Reasons that block resolving one row, after the action's own tolerance is applied.
 *
 * Authority is projected through the shared predicate rather than a resolve-local rule, so a code
 * added to either published enum reaches this gate with no second list to update.
 */
function blockingReasons(row: LocusRowV1, action: LocusResolveAction): readonly LocusStopReason[] {
  const projected = projectTrustedLocusRow(row);
  if (projected.kind === "trusted") return [];
  if (action !== "abandon") return projected.reasons;
  return projected.reasons.filter((reason) => !ABANDON_TOLERATED_REASONS.has(reason));
}

/** Revalidate safety facts, derive the subject from trusted state, and invoke its lifecycle driver. */
export async function resolveLocusGeneration(options: {
  readonly row: LocusRowV1;
  readonly action: LocusResolveAction;
  readonly checkoutClean: boolean;
  readonly dependencies: LocusResolveDriverDependencies;
}): Promise<LocusMutationResultV1> {
  const row = options.row;
  if (row.kind === "duplicate-locus") return refusal("duplicate-locus", "Duplicate session locus authority cannot be resolved automatically.");
  if (row.checkoutPath === null) return refusal("checkout-missing", "The selected transient checkout is missing.");
  if (row.role === null || row.recordId === null) return refusal("record-malformed", "The selected transient role is incomplete.");
  if (row.lease === null) return refusal("record-malformed", "The selected transient role has no dead lease generation.");
  if (row.lease.state === "live") return refusal("lease-live", "The selected transient lease is live.");
  if (row.lease.state === "unknown") return refusal("lease-unknown", "The selected transient lease has unknown liveness.");
  if (!options.checkoutClean) {
    return refusal("preservation-unproven", "The selected checkout is dirty.");
  }
  if (row.frame !== "residue") return refusal("role-conflict", "The selected generation is not residue.");
  const blocked = blockingReasons(row, options.action);
  if (blocked.length > 0) {
    return refusal(untrustedRefusalReason(blocked), `The selected generation is untrusted: ${blocked.join(", ")}.`);
  }
  const subject = deriveSubject(row);
  if (subject === null) return refusal("role-conflict", "The selected role is not a resolvable transient subject.");
  const result = await options.dependencies.run({
    subject,
    action: options.action,
    key: row.role.subject.key,
    selected: { recordId: row.recordId, leaseId: row.lease.leaseId },
  });
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
