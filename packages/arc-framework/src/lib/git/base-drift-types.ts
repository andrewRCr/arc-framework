/**
 * Storage-neutral contracts for base-drift analysis.
 *
 * @module
 */

import type { WorktreeSyncState } from "./worktree-sync.js";

export type BaseDriftMode = "advisory" | "authoritative";
export type BaseDriftVerdict = "clean" | "reconcile" | "unavailable" | "skipped";

export type BaseDriftUnavailableReason =
  | "invalid-base"
  | "detached-head"
  | "no-remote"
  | "fetch-timeout"
  | "fetch-failed"
  | "fetched-base-unresolved"
  | "distance-read-failed"
  | "temporary-ref-cleanup-failed";

export type IntegrationEvidenceLimitation =
  | "unclassified-commits"
  | "resolver-unavailable"
  | "resolver-invalid"
  | "scan-truncated";

export interface IntegrationIdentity {
  slug?: string;
  prNumber?: number;
  prUrl?: string;
}

export interface IntegrationEvent extends IntegrationIdentity {
  commits: string[];
  proof: "topology" | "resolver";
}

export type IntegrationEvidence =
  | {
      coverage: "complete" | "partial";
      scannedCommitCount: number;
      events: IntegrationEvent[];
      unclassifiedCommitCount: number;
      truncated: boolean;
      limitations: IntegrationEvidenceLimitation[];
    }
  | { coverage: "unavailable"; reason: "history-scan-failed" };

export type OverlapEvidence =
  | {
      status: "available";
      substantivePaths: string[];
      regenerablePaths: string[];
    }
  | {
      status: "unavailable";
      reason: "merge-base-failed" | "branch-diff-failed" | "base-diff-failed";
    };

export type BaseDriftRegister = {
  kind: "calm" | "attention" | "degraded";
  text: string;
} | null;

export interface BaseDriftResult {
  mode: BaseDriftMode;
  verdict: BaseDriftVerdict;
  state: WorktreeSyncState;
  ahead: number;
  behind: number;
  base: string | null;
  baseOid: string | null;
  unavailableReason?: BaseDriftUnavailableReason;
  integrationEvidence: IntegrationEvidence | null;
  overlap: OverlapEvidence | null;
  register: BaseDriftRegister;
  /** Compatibility failure category retained while status consumers migrate. */
  failureReason?: "timeout" | "error";
}

export interface BaseDriftCommitInput {
  oid: string;
  parents: string[];
  subject: string;
  acceptedPrNumber?: number;
}

export type ResolverRead<T> =
  | { status: "available"; value: T }
  | { status: "partial"; value: T }
  | { status: "unavailable" };

export interface ResolverEvent extends IntegrationIdentity {
  commits: string[];
}

export interface IntegrationEvidenceResolver {
  enrichTopologyEvent(
    event: IntegrationEvent,
    input: BaseDriftCommitInput,
  ): Promise<ResolverRead<IntegrationIdentity | null>>;
  proveSingleParentEvents(
    inputs: BaseDriftCommitInput[],
  ): Promise<ResolverRead<ResolverEvent[]>>;
}

export type IntegrationEvidenceResolverFactory = (
  baseOid: string,
) => IntegrationEvidenceResolver;

export type ReconciliationBehavior = "substantive" | "regenerable";
export type ReconciliationClassifier = (path: string) => ReconciliationBehavior;
