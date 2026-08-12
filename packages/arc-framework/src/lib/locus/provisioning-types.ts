/** Ports, receipts, and rollback evidence for marker-owned transient provisioning. */

import type {
  LinkedWorktreeCreationOptions,
  LinkedWorktreeCreationReceipt,
  LinkedWorktreeCreationResult,
} from "../git/linked-worktree.js";
import type { WorktreeMarker } from "../git/worktree-marker.js";
import type { RegisteredWorktreeScanResult } from "../git/worktree-roster.js";
import type { LocusAllocationPlan } from "./allocator.js";
import type { ProvisioningAuthority } from "./provisioning-authority.js";
import type { LocusIdentityV1 } from "./schema/identity.js";

export type ProvisioningProposal = Extract<LocusAllocationPlan, { kind: "proposal" }>;

export type ProvisioningMarkerReadResult =
  | { readonly kind: "absent" }
  | { readonly kind: "present"; readonly marker: WorktreeMarker; readonly bytes: Buffer }
  | { readonly kind: "malformed"; readonly message: string };

export interface PrimaryCheckoutReceipt {
  readonly kind: "applied" | "idempotent";
  readonly branchCreated: boolean;
  readonly branch: string;
  readonly previousBranch: string;
  readonly head: string;
}

/** A primary checkout mutation whose local compensation also failed. */
export class PrimaryCheckoutResidueError extends Error {
  readonly checkoutPath: string;

  constructor(checkoutPath: string, cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(`Primary checkout at ${checkoutPath} could not be reconciled after mutation: ${detail}`, { cause });
    this.name = "PrimaryCheckoutResidueError";
    this.checkoutPath = checkoutPath;
  }
}

export interface ProvisionTransientLocusDependencies {
  createLinkedWorktree(options: LinkedWorktreeCreationOptions): Promise<LinkedWorktreeCreationResult>;
  scanWorktrees(): Promise<RegisteredWorktreeScanResult>;
  readMarker(worktreePath: string): Promise<ProvisioningMarkerReadResult>;
  createMarker(worktreePath: string, marker: WorktreeMarker): Promise<
    { kind: "created"; bytes: Buffer } | { kind: "exists" }
  >;
  replaceMarker(worktreePath: string, expectedBytes: Buffer, marker: WorktreeMarker): Promise<
    { kind: "replaced"; bytes: Buffer } | { kind: "generation-mismatch" }
  >;
  removeMarker(worktreePath: string, expectedBytes: Buffer): Promise<
    { kind: "removed" } | { kind: "generation-mismatch" }
  >;
  setupWorktree(worktreePath: string, primaryPath: string): Promise<void>;
  withOperationLock<Value>(cwd: string, operation: () => Promise<Value>): Promise<Value>;
  revalidateTarget(options: {
    proposal: ProvisioningProposal;
    checkoutPath: string;
  }): Promise<{ kind: "ready" } | { kind: "refused"; reason: ProvisioningRefusalReason }>;
  checkoutPrimary(
    checkoutPath: string,
    branch: string | null,
    expectedBranchHead: string | null,
  ): Promise<PrimaryCheckoutReceipt>;
  rollbackPrimary(checkoutPath: string, receipt: PrimaryCheckoutReceipt): Promise<
    { kind: "rolled-back" } | { kind: "generation-mismatch" }
  >;
  rollbackSpawned(
    receipt: LinkedWorktreeCreationReceipt,
    rosterHead: string,
    primaryWorktreePath: string,
  ): Promise<{ kind: "rolled-back" } | { kind: "generation-mismatch" }>;
}

export type ProvisioningRefusalReason =
  | "identity-conflict"
  | "full-protection-required"
  | "primary-dirty"
  | "primary-off-base"
  | "path-collision"
  | "topology-unknown"
  | "marker-conflict"
  | "role-conflict";

export type ProvisioningEvidence =
  | { readonly kind: "identity-only" }
  | { readonly kind: "pending-marker"; readonly checkoutPath: string; readonly markerBytes: Buffer }
  | { readonly kind: "marker-residue"; readonly checkoutPath: string; readonly markerBytes: Buffer | null };

export interface TransientProvisioningReceipt {
  readonly disposition: "applied" | "idempotent";
  readonly allocation: "primary" | "spawned";
  readonly checkoutPath: string;
  readonly branch: {
    readonly name: string | null;
    readonly created: boolean;
    readonly head: string;
    readonly base: string | null;
  };
  readonly worktree: { readonly path: string; readonly created: boolean; readonly head: string };
  readonly marker: { readonly state: "ready"; readonly bytes: Buffer };
}

export type ProvisionTransientLocusResult =
  | { readonly kind: "provisioned"; readonly receipt: TransientProvisioningReceipt }
  | { readonly kind: "refused"; readonly reason: ProvisioningRefusalReason; readonly evidence: ProvisioningEvidence }
  | { readonly kind: "error"; readonly error: Error; readonly evidence: ProvisioningEvidence };

export interface ProvisionTransientLocusOptions {
  proposal: ProvisioningProposal;
  protection: "full" | "partial";
  identity: LocusIdentityV1 | null;
  authority?: ProvisioningAuthority;
  branch: string | null;
  expectedBranchHead: string | null;
  base: string;
  locationTemplate: string;
  repo: string;
  spawningIdentity: string;
  parentCheckoutPath: string | null;
  establishedAt: string;
  dependencies: ProvisionTransientLocusDependencies;
}
