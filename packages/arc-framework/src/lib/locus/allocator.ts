/** Protection-aware allocation proposals and owned-lock primary linearization. */

import {
  createLinkedWorktree,
  type LinkedWorktreeCreationContext,
  type LinkedWorktreeCreationResult,
} from "../git/linked-worktree.js";
import type { PrimarySafetyResult } from "./primary-safety.js";
import type { LocusStateV1, LocusStopReason } from "./schema/index.js";

export interface LocusAllocationSubject {
  readonly kind: "errand" | "groom" | "housekeep";
  readonly key: string;
  readonly claimId: string | null;
}

export type LocusAllocationRefusalReason =
  | "primary-occupied"
  | "primary-dirty"
  | "primary-off-base"
  | "lease-live"
  | "lease-unknown"
  | "topology-unknown"
  | "record-malformed"
  | "duplicate-locus"
  | "role-conflict"
  | "identity-conflict"
  | "full-protection-required";

export type LocusAllocationPlan =
  | {
      readonly kind: "proposal";
      readonly allocation:
        | { readonly kind: "primary"; readonly checkoutPath: string }
        | { readonly kind: "spawn"; readonly primaryPath: string };
      readonly subject: LocusAllocationSubject;
    }
  | { readonly kind: "refused"; readonly reason: LocusAllocationRefusalReason };

/** Reduce one fresh locus state to a non-authoritative placement proposal. */
export function planLocusAllocation(options: {
  state: LocusStateV1;
  protection: "full" | "partial";
  isolation: "prefer-primary" | "require-isolation" | "parallelize";
  subject: LocusAllocationSubject;
}): LocusAllocationPlan {
  if (!subjectClaimMatchesProtection(options.subject, options.protection)) {
    return { kind: "refused", reason: "identity-conflict" };
  }
  const globalStop = stateStopReason(options.state);
  if (globalStop !== null) return { kind: "refused", reason: globalStop };
  const availability = options.state.primaryAvailability;
  const isolationRequested = options.isolation !== "prefer-primary";
  if (isolationRequested) {
    return options.protection === "full"
      ? spawnProposal(options.state, options.subject)
      : { kind: "refused", reason: "full-protection-required" };
  }
  if (availability.kind === "free") {
    return {
      kind: "proposal",
      allocation: { kind: "primary", checkoutPath: availability.checkoutPath },
      subject: options.subject,
    };
  }
  if (availability.kind === "occupied") {
    if (options.protection === "full") return spawnProposal(options.state, options.subject);
    if (availability.leaseState === "live") return { kind: "refused", reason: "lease-live" };
    if (availability.leaseState === "unknown") return { kind: "refused", reason: "lease-unknown" };
    return { kind: "refused", reason: "primary-occupied" };
  }
  const reason = unsafeReason(availability.reasons);
  return { kind: "refused", reason };
}

function subjectClaimMatchesProtection(
  subject: LocusAllocationSubject,
  protection: "full" | "partial",
): boolean {
  if (protection === "full") return subject.claimId !== null;
  return subject.kind === "groom" ? subject.claimId !== null : subject.claimId === null;
}

function spawnProposal(state: LocusStateV1, subject: LocusAllocationSubject): LocusAllocationPlan {
  return {
    kind: "proposal",
    allocation: { kind: "spawn", primaryPath: state.roster.primaryPath },
    subject,
  };
}

export type SpawnedLocusWorktreeResult =
  | LinkedWorktreeCreationResult
  | {
      readonly kind: "refused";
      readonly reason: "full-protection-required" | "spawn-not-proposed" | "identity-conflict";
    };

/**
 * Bind one full-protection spawn proposal to the target-agnostic linked-worktree primitive.
 *
 * @param context - Git and path-existence boundary for linked-worktree creation.
 * @param options - Allocation proposal, protection mode, configured placement, and stable branch inputs.
 * @returns The generic creation result, or a refusal before any creation boundary is touched.
 */
export async function createSpawnedLocusWorktree(
  context: LinkedWorktreeCreationContext,
  options: {
    proposal: Extract<LocusAllocationPlan, { kind: "proposal" }>;
    protection: "full" | "partial";
    locationTemplate: string;
    repo: string;
    branch: string;
    base: string;
    createBranch?: boolean;
  },
): Promise<SpawnedLocusWorktreeResult> {
  if (options.protection !== "full") {
    return { kind: "refused", reason: "full-protection-required" };
  }
  if (options.proposal.allocation.kind !== "spawn") {
    return { kind: "refused", reason: "spawn-not-proposed" };
  }
  const { subject } = options.proposal;
  if (subject.claimId === null) {
    return { kind: "refused", reason: "identity-conflict" };
  }
  return createLinkedWorktree(context, {
    locationTemplate: options.locationTemplate,
    primaryWorktreePath: options.proposal.allocation.primaryPath,
    repo: options.repo,
    placementName: `locus-${subject.kind}-${subject.key}-${subject.claimId}`,
    branch: options.branch,
    createBranch: options.createBranch ?? true,
    base: options.base,
  });
}

function stateStopReason(state: LocusStateV1): LocusAllocationRefusalReason | null {
  if (state.current.kind === "ambiguous") return "role-conflict";
  if (state.recovery.kind === "stop") return unsafeReason(state.recovery.reasons);
  if (state.reconciliation.kind === "stop") return unsafeReason(state.reconciliation.reasons);
  return null;
}

function unsafeReason(reasons: readonly LocusStopReason[]): LocusAllocationRefusalReason {
  for (const reason of reasons) {
    switch (reason) {
      case "primary-dirty":
      case "primary-off-base":
      case "lease-live":
      case "lease-unknown":
      case "role-conflict":
      case "record-malformed":
      case "duplicate-locus":
        return reason;
      case "lock-live":
      case "lock-unknown":
      case "unsupported-version":
      case "identity-malformed":
      case "path-unavailable":
      case "cross-identity":
      case "marker-missing":
      case "subject-unresolved":
        return "topology-unknown";
    }
  }
  return "topology-unknown";
}

export interface LocusAllocationLock {
  release(): Promise<void>;
}

export interface PrimaryAllocationDependencies<Remote, Value> {
  prepareRemote(): Promise<Remote>;
  rollbackRemote(prepared: Remote): Promise<void>;
  acquireLock(checkoutPath: string): Promise<LocusAllocationLock>;
  readState(): Promise<LocusStateV1>;
  readGitSafety(checkoutPath: string): Promise<PrimarySafetyResult>;
  applyLocal(options: {
    proposal: Extract<LocusAllocationPlan, { kind: "proposal" }>;
    prepared: Remote;
    lock: LocusAllocationLock;
  }): Promise<Value>;
}

export type PrimaryAllocationResult<Value> =
  | { readonly kind: "allocated"; readonly value: Value }
  | { readonly kind: "refused"; readonly reason: LocusAllocationRefusalReason }
  | { readonly kind: "error"; readonly error: Error };

/** Linearize one primary proposal after remote preparation and under its exact record lock. */
export async function linearizePrimaryAllocation<Remote, Value>(options: {
  proposal: Extract<LocusAllocationPlan, { kind: "proposal" }>;
  protection: "full" | "partial";
  isolation: "prefer-primary";
  dependencies: PrimaryAllocationDependencies<Remote, Value>;
}): Promise<PrimaryAllocationResult<Value>> {
  if (options.proposal.allocation.kind !== "primary") {
    return { kind: "refused", reason: "full-protection-required" };
  }
  let prepared: Remote;
  try {
    prepared = await options.dependencies.prepareRemote();
  } catch (error) {
    return { kind: "error", error: toError(error) };
  }
  let lock: LocusAllocationLock | null = null;
  let committed = false;
  let result: PrimaryAllocationResult<Value>;
  try {
    lock = await options.dependencies.acquireLock(options.proposal.allocation.checkoutPath);
    const [state, safety] = await Promise.all([
      options.dependencies.readState(),
      options.dependencies.readGitSafety(options.proposal.allocation.checkoutPath),
    ]);
    const fresh = planLocusAllocation({
      state,
      protection: options.protection,
      isolation: options.isolation,
      subject: options.proposal.subject,
    });
    if (fresh.kind !== "proposal"
      || fresh.allocation.kind !== "primary"
      || fresh.allocation.checkoutPath !== options.proposal.allocation.checkoutPath) {
      result = fresh.kind === "refused"
        ? fresh
        : { kind: "refused", reason: primaryRevalidationReason(state.primaryAvailability) };
    } else if (safety.kind === "error") {
      result = { kind: "refused", reason: "topology-unknown" };
    } else if (!safety.clean) {
      result = { kind: "refused", reason: "primary-dirty" };
    } else if (!safety.onBase) {
      result = { kind: "refused", reason: "primary-off-base" };
    } else {
      const value = await options.dependencies.applyLocal({
        proposal: options.proposal,
        prepared,
        lock,
      });
      committed = true;
      result = { kind: "allocated", value };
    }
  } catch (error) {
    result = { kind: "error", error: toError(error) };
  } finally {
    if (lock !== null) {
      try {
        await lock.release();
      } catch (error) {
        result = { kind: "error", error: toError(error) };
      }
    }
  }
  if (!committed) {
    try {
      await options.dependencies.rollbackRemote(prepared);
    } catch (error) {
      return { kind: "error", error: toError(error) };
    }
  }
  return result;
}

function primaryRevalidationReason(
  availability: LocusStateV1["primaryAvailability"],
): LocusAllocationRefusalReason {
  if (availability.kind === "occupied") {
    if (availability.leaseState === "live") return "lease-live";
    if (availability.leaseState === "unknown") return "lease-unknown";
    return "primary-occupied";
  }
  return availability.kind === "unsafe" ? unsafeReason(availability.reasons) : "topology-unknown";
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
