/** Subject-owned dispatch for resolving one exact transient residue generation. */

import { createLocusMutationResult } from "./mutation.js";
import type { SelectedLocusGeneration } from "./selected-generation.js";
import { locusRowAuthorityReasons, projectTrustedLocusRow, untrustedRefusalReason } from "./trusted-row.js";
import type { LocusMutationResultV1, LocusRowV1, LocusStopReason } from "./schema/index.js";

export type LocusResolveSubject = "errand" | "partial-errand" | "housekeep" | "groom";
export type LocusResolveAction = "resume" | "abandon";

/** One subject dispatch carrying the generation this driver validated, not just its reusable key. */
export interface LocusResolveDispatch {
  readonly subject: LocusResolveSubject;
  readonly action: LocusResolveAction;
  readonly key: string;
  readonly selected: SelectedLocusGeneration;
  /** Exact operator attestation already bounded by this driver's lease gate. */
  readonly confirmedNoLiveSession: boolean;
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
function blockingReasons(
  row: LocusRowV1,
  action: LocusResolveAction,
  confirmedNoLiveSession: boolean,
): readonly LocusStopReason[] {
  const projected = projectTrustedLocusRow(row);
  if (projected.kind === "trusted") return [];
  const tolerated = new Set<LocusStopReason>();
  if (action === "abandon") for (const reason of ABANDON_TOLERATED_REASONS) tolerated.add(reason);
  // The attestation clears the exact reason it attests to and nothing else. `lease-unknown` says
  // liveness could not be established; an operator who has looked at their own machine supplies
  // precisely that. `lock-unknown` is deliberately not tolerated — an unverifiable lock holder may
  // be a process mid-mutation, which is a different claim than no live session.
  if (confirmedNoLiveSession) tolerated.add("lease-unknown");
  return projected.reasons.filter((reason) => !tolerated.has(reason));
}

/** Revalidate safety facts, derive the subject from trusted state, and invoke its lifecycle driver. */
export async function resolveLocusGeneration(options: {
  readonly row: LocusRowV1;
  readonly action: LocusResolveAction;
  readonly checkoutClean: boolean;
  /**
   * The operator attests that no live session holds the selected lease.
   *
   * Admissible only where the code cannot establish the contrary: a verifiably foreign live lease
   * refuses regardless, so this can never become a general force.
   */
  readonly confirmedNoLiveSession: boolean;
  readonly dependencies: LocusResolveDriverDependencies;
}): Promise<LocusMutationResultV1> {
  const row = options.row;
  if (row.kind === "duplicate-locus") return refusal("duplicate-locus", "Duplicate session locus authority cannot be resolved automatically.");
  if (row.checkoutPath === null) return refusal("checkout-missing", "The selected transient checkout is missing.");
  if (row.role === null || row.recordId === null) return refusal("record-malformed", "The selected transient role is incomplete.");
  if (row.lease === null) return refusal("record-malformed", "The selected transient role has no lease generation.");
  // Deadness is one proof of authority over a lease, not the only one. An unknown lease may resume
  // only after the operator attests that no live session holds it; exact generation, trust, residue,
  // and cleanliness guards still apply. A verifiably foreign live lease has no such path: the reader
  // holds positive evidence of another session that no attestation contradicts.
  if (row.lease.state === "live" && !row.lease.selfHeld) {
    return refusal("lease-live", "The selected transient lease is held by another live session.");
  }
  if (row.lease.state === "unknown" && !options.confirmedNoLiveSession) {
    return refusal(
      "lease-unknown",
      "The selected transient lease has unknown liveness; confirm no live session holds it.",
    );
  }
  if (row.lease.state === "live") {
    const scoped = options.action === "abandon"
      || locusRowAuthorityReasons(row).includes("subject-unresolved");
    if (!options.confirmedNoLiveSession || !scoped) {
      return refusal(
        "lease-live",
        row.lease.selfHeld
          ? "This lease is yours; exit this process to release it, or confirm no live session holds it."
          : "The selected transient lease is held by another live session.",
      );
    }
  }
  if (!options.checkoutClean) {
    return refusal("preservation-unproven", "The selected checkout is dirty.");
  }
  if (row.frame !== "residue") return refusal("role-conflict", "The selected generation is not residue.");
  const blocked = blockingReasons(row, options.action, options.confirmedNoLiveSession);
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
    confirmedNoLiveSession: options.confirmedNoLiveSession,
  });
  return createLocusMutationResult({ ...result, operation: "locus-resolve" });
}

function deriveSubject(row: LocusRowV1): LocusResolveSubject | null {
  if (row.role?.kind === "groom" && row.role.subject.kind === "groom") return "groom";
  if (row.role?.kind === "housekeep"
    && (row.role.subject.kind === "housekeep" || row.role.subject.kind === "errand")) return "housekeep";
  if (row.role?.kind === "errand" && row.role.subject.kind === "errand") return "errand";
  if (row.role?.kind === "errand" && row.role.subject.kind === "partial-errand") return "partial-errand";
  return null;
}

function refusal(
  reason: Extract<LocusMutationResultV1, { outcome: "refused" }>["reason"],
  text: string,
): LocusMutationResultV1 {
  return createLocusMutationResult({ outcome: "refused", operation: "locus-resolve", reason, recommendedPromptText: text });
}
