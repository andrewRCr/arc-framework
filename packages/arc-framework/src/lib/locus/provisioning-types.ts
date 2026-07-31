/** Ports, receipts, and reconciliation evidence for transient locus provisioning. */

import type {
  LinkedWorktreeCreationOptions,
  LinkedWorktreeCreationReceipt,
  LinkedWorktreeCreationResult,
} from "../git/linked-worktree.js";
import type { WorktreeMarker } from "../git/worktree-marker.js";
import type { RegisteredWorktreeScanResult } from "../git/worktree-roster.js";
import type { LocusAllocationPlan } from "./allocator.js";
import type { LocusRoleAuthority } from "./mutation.js";
import type { LocusRecordReadResult } from "./record-store.js";
import type { LocusAnchor, LocusIdentityV1, LocusRecordV1 } from "./schema/index.js";

export type ProvisioningProposal = Extract<LocusAllocationPlan, { kind: "proposal" }>;

export interface ProvisioningRecordLock {
  readonly recordId: string;
  readonly recordPath: string;
  readonly token: string;
}

export type ProvisioningMarkerReadResult =
  | { readonly kind: "absent" }
  | { readonly kind: "present"; readonly marker: WorktreeMarker; readonly bytes: Buffer }
  | { readonly kind: "malformed"; readonly message: string };

export interface PrimaryCheckoutReceipt {
  readonly kind: "applied" | "idempotent";
  readonly branchCreated: boolean;
  /** The branch this checkout left on HEAD — the only branch its rollback may restore or delete. */
  readonly branch: string;
  readonly previousBranch: string;
  readonly head: string;
}

/**
 * A primary checkout that mutated Git and could not undo the mutation itself.
 *
 * The mutation lands before the head probe that would build its receipt, so a failure there leaves
 * the caller holding no receipt to roll back with. The adapter compensates instead; when that
 * compensation also fails, the checkout stays switched and any branch the attempt created stays
 * present — this error is how that residue reaches the caller's evidence.
 */
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
  acquireRecordLock(checkoutPath: string): Promise<
    { kind: "acquired"; handle: ProvisioningRecordLock }
    | { kind: "refused"; reason: "live" | "unknown" | "timeout" }
  >;
  releaseRecordLock(handle: ProvisioningRecordLock): Promise<void>;
  revalidateTarget(options: {
    proposal: ProvisioningProposal;
    checkoutPath: string;
    handle: ProvisioningRecordLock;
  }): Promise<{ kind: "ready" } | { kind: "refused"; reason: ProvisioningRefusalReason }>;
  /** Create or exactly reuse the requested branch, or prove a null-branch direct-base no-op. */
  checkoutPrimary(
    checkoutPath: string,
    branch: string | null,
    expectedBranchHead: string | null,
  ): Promise<PrimaryCheckoutReceipt>;
  rollbackPrimary(checkoutPath: string, receipt: PrimaryCheckoutReceipt): Promise<
    { kind: "rolled-back" } | { kind: "generation-mismatch" }
  >;
  readRecord(path: string, handle: ProvisioningRecordLock): Promise<LocusRecordReadResult>;
  mintRecord(path: string, record: LocusRecordV1, handle: ProvisioningRecordLock): Promise<
    { kind: "created"; bytes: Buffer } | { kind: "exists" }
  >;
  replaceRecord(
    path: string,
    expectedBytes: Buffer,
    record: LocusRecordV1,
    handle: ProvisioningRecordLock,
  ): Promise<{ kind: "replaced"; bytes: Buffer } | { kind: "generation-mismatch" }>;
  removeRecord(path: string, expectedBytes: Buffer, handle: ProvisioningRecordLock): Promise<
    { kind: "removed" } | { kind: "generation-mismatch" }
  >;
  rollbackSpawned(
    receipt: LinkedWorktreeCreationReceipt,
    rosterHead: string,
    primaryWorktreePath: string,
  ): Promise<
    { kind: "rolled-back" } | { kind: "generation-mismatch" }
  >;
}

export type ProvisioningRefusalReason =
  | "identity-conflict"
  | "full-protection-required"
  | "primary-dirty"
  | "primary-off-base"
  | "path-collision"
  | "topology-unknown"
  | "marker-conflict"
  | "lock-live"
  | "lock-unknown"
  | "role-conflict"
  | "record-malformed"
  | "lease-live"
  | "lease-unknown"
  | "lease-generation-mismatch";

export type ProvisioningEvidence =
  | { readonly kind: "identity-only" }
  | { readonly kind: "pending-marker"; readonly checkoutPath: string; readonly markerBytes: Buffer }
  | {
      readonly kind: "marker-record-mismatch";
      readonly checkoutPath: string;
      readonly markerBytes: Buffer | null;
      readonly recordBytes: Buffer | null;
    };

export interface TransientProvisioningReceipt {
  /** Aggregate effect across checkout, marker, role, and lease publication. */
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
  readonly marker: { readonly state: "ready"; readonly bytes: Buffer } | null;
  readonly record: { readonly recordId: string; readonly bytes: Buffer };
  readonly leaseToken: string;
}

export type ProvisionTransientLocusResult =
  | { readonly kind: "provisioned"; readonly receipt: TransientProvisioningReceipt }
  | { readonly kind: "refused"; readonly reason: ProvisioningRefusalReason; readonly evidence: ProvisioningEvidence }
  | { readonly kind: "error"; readonly error: Error; readonly evidence: ProvisioningEvidence };

export interface ProvisionTransientLocusOptions {
  proposal: ProvisioningProposal;
  protection: "full" | "partial";
  identity: LocusIdentityV1 | null;
  authority?: LocusRoleAuthority;
  branch: string | null;
  /** Null creates a fresh branch; a Git OID requires exact retained-branch reuse. */
  expectedBranchHead: string | null;
  base: string;
  locationTemplate: string;
  repo: string;
  spawningIdentity: string;
  parentCheckoutPath: string | null;
  sessionHomePath: string;
  establishedAt: string;
  anchor: LocusAnchor;
  leaseId: string;
  dependencies: ProvisionTransientLocusDependencies;
}
