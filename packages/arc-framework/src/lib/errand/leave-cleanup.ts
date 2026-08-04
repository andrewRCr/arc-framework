/** Exact occupancy-closing composition for full-protection ordinary-Errand leave. */

import type { LeaveCleanupResult } from "./leave.js";
import type { LockedLocusGenerationAcquisition } from "./locked-generation.js";

type LeaveCleanupRefusal = Extract<LeaveCleanupResult, { kind: "refused" }>;

/** The exact generation leave selected from the roster, carried into the lock rather than re-derived. */
export interface LeaveOccupancyTarget {
  readonly checkoutPath: string;
  readonly recordId: string;
  readonly leaseId: string;
  readonly allocation: "primary" | "spawned";
}

export interface CloseLeaveOccupancyDependencies {
  acquireLock(target: LeaveOccupancyTarget): Promise<LockedLocusGenerationAcquisition>;
  /** Null once the checkout no longer holds the Errand; else why it could not be preserved. */
  preserveCheckout(target: LeaveOccupancyTarget): Promise<LeaveCleanupRefusal | null>;
}

export interface CloseLeaveOccupancyOptions {
  readonly target: LeaveOccupancyTarget;
  readonly restoredParent: { recordId: string; checkoutPath: string } | null;
  readonly dependencies: CloseLeaveOccupancyDependencies;
}

/** Prove the locked generation, preserve its checkout, then pop the exact role. */
export async function closeLeaveOccupancy(
  options: CloseLeaveOccupancyOptions,
): Promise<LeaveCleanupResult> {
  const { target, dependencies } = options;
  const acquired = await dependencies.acquireLock(target);
  if (acquired.kind !== "acquired") {
    return {
      kind: "refused",
      reason: acquired.reason === "live" ? "lease-live" : "lease-unknown",
      message: "The Errand session locus lock is not available.",
    };
  }
  try {
    // Ownership is proven under the lock before the checkout is touched: the roster read that
    // selected this target ran before the lock, and the checkout lives outside the record, so a
    // later generation refusal could not undo a branch switch or a removed worktree.
    const owned = await acquired.generation.validate();
    if (owned.kind === "refused") {
      return { kind: "refused", reason: owned.reason, message: "Errand occupancy is not this session's generation." };
    }
    if (owned.kind === "absent") {
      return { kind: "idempotent", allocation: null, recordId: null, restoredParent: options.restoredParent };
    }

    const preserved = await dependencies.preserveCheckout(target);
    if (preserved !== null) return preserved;

    const popped = await acquired.generation.pop();
    if (popped.outcome === "refused") {
      return { kind: "refused", reason: popped.reason, message: popped.recommendedPromptText };
    }
    if (popped.outcome === "error") {
      return { kind: "error", code: popped.error.code, message: popped.error.message };
    }
    return {
      kind: popped.outcome,
      allocation: { kind: target.allocation, checkoutPath: target.checkoutPath },
      recordId: target.recordId,
      restoredParent: options.restoredParent,
    };
  } finally {
    await acquired.release();
  }
}

