/** Protection-aware allocation proposals and owned-lock primary linearization. */

import {
  createLinkedWorktree,
  type LinkedWorktreeCreationContext,
  type LinkedWorktreeCreationResult,
} from "../git/linked-worktree.js";
import { isSlugSafe } from "../kernel/index.js";
import type { DerivedLocusFrame, DerivedPrimaryAvailability } from "./derived-reader.js";

export interface LocusAllocationSubject {
  readonly kind: "errand" | "groom" | "housekeep";
  readonly key: string;
  readonly claimId: string | null;
}

export type LocusAllocationRefusalReason =
  | "primary-occupied"
  | "primary-dirty"
  | "primary-off-base"
  | "topology-unknown"
  | "role-conflict"
  | "identity-conflict"
  | "primary-not-proposed"
  | "full-protection-required";

export type LocusAllocationPlanningRefusalReason = Exclude<
  LocusAllocationRefusalReason,
  "primary-not-proposed"
>;

export type LocusAllocationPlan =
  | {
      readonly kind: "proposal";
      readonly allocation:
        | { readonly kind: "primary"; readonly checkoutPath: string }
        | { readonly kind: "spawn"; readonly primaryPath: string };
      readonly subject: LocusAllocationSubject;
    }
  | { readonly kind: "refused"; readonly reason: LocusAllocationPlanningRefusalReason };

/** Reduce one fresh locus state to a non-authoritative placement proposal. */
export function planLocusAllocation(options: {
  frame: DerivedLocusFrame;
  protection: "full" | "partial";
  isolation: "prefer-primary" | "require-isolation" | "parallelize";
  subject: LocusAllocationSubject;
}): LocusAllocationPlan {
  if (!isSlugSafe(options.subject.key)) {
    return { kind: "refused", reason: "identity-conflict" };
  }
  if (!subjectClaimMatchesProtection(options.subject, options.protection)) {
    return { kind: "refused", reason: "identity-conflict" };
  }
  const globalStop = frameStopReason(options.frame);
  if (globalStop !== null) return { kind: "refused", reason: globalStop };
  const availability = options.frame.primaryAvailability;
  const isolationRequested = options.isolation !== "prefer-primary";
  if (isolationRequested) {
    return options.protection === "full"
      ? spawnProposal(availability, options.subject)
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
    if (options.protection === "full") return spawnProposal(availability, options.subject);
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

function spawnProposal(
  availability: DerivedPrimaryAvailability,
  subject: LocusAllocationSubject,
): LocusAllocationPlan {
  if (availability.checkoutPath === null) return { kind: "refused", reason: "topology-unknown" };
  return {
    kind: "proposal",
    allocation: { kind: "spawn", primaryPath: availability.checkoutPath },
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
  if (subject.claimId === null || !isSlugSafe(subject.key)) {
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

function frameStopReason(frame: DerivedLocusFrame): LocusAllocationPlanningRefusalReason | null {
  return frame.entering.kind === "unresolved" ? "role-conflict" : null;
}

function unsafeReason(reasons: readonly string[]): LocusAllocationPlanningRefusalReason {
  for (const reason of reasons) {
    switch (reason) {
      case "primary-dirty":
      case "primary-off-base":
        return reason;
    }
  }
  return "topology-unknown";
}
