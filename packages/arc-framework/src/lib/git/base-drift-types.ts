/**
 * Storage-neutral contracts for base-drift analysis.
 *
 * @module
 */

import type { WorktreeSyncState } from "./worktree-sync.js";
import type { PathTreatment } from "../evidence-applicability/index.js";

export type BaseDriftMode = "advisory" | "authoritative";
export type BaseDriftVerdict = "clean" | "reconcile" | "unavailable" | "skipped";
export type BaseMovement = "disjoint" | "overlapping" | "unknown";

export type BaseDriftUnavailableReason =
  | "config-unavailable"
  | "invalid-base"
  | "detached-head"
  | "no-remote"
  | "fetch-timeout"
  | "fetch-failed"
  | "base-object-pending-fetch"
  | "remote-evidence-unreachable"
  | "remote-base-absent"
  | "fetched-base-unresolved"
  | "distance-read-failed";

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
      reason: "merge-base-failed" | "branch-diff-failed" | "base-diff-failed" | "classification-failed";
    };

export type BaseDriftRegister = {
  kind: "calm" | "attention" | "degraded";
  text: string;
} | null;

export interface BaseDriftCoordinates {
  base: string | null;
  baseOid: string | null;
  headOid: string | null;
}

export interface BaseDriftTerminalContinuation {
  kind: "terminal-explanation";
  terminalExplanation: string;
}

interface BaseDriftResultCommon {
  mode: BaseDriftMode;
  state: WorktreeSyncState;
  ahead: number;
  behind: number;
  base: string | null;
  baseOid: string | null;
  /** Exact local commit analyzed by a healthy reading; null when no graph reading was available. */
  headOid: string | null;
  integrationEvidence: IntegrationEvidence | null;
  overlap: OverlapEvidence | null;
  register: BaseDriftRegister;
  /** Compatibility failure category retained while status consumers migrate. */
  failureReason?: "timeout" | "error";
}

/** Public base-drift result with a complete non-success explanation at the unavailable boundary. */
export type BaseDriftResult = BaseDriftResultCommon & (
  | {
      verdict: "clean" | "reconcile";
      movement: BaseMovement;
      unavailableReason?: never;
      detail?: never;
      coordinates?: never;
      continuation?: never;
    }
  | {
      verdict: "unavailable";
      movement?: never;
      unavailableReason: BaseDriftUnavailableReason;
      detail: string;
      coordinates: BaseDriftCoordinates;
      continuation: BaseDriftTerminalContinuation;
    }
  | {
      verdict: "skipped";
      movement?: never;
      unavailableReason?: never;
      detail?: never;
      coordinates?: never;
      continuation?: never;
    }
);

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

export type PathTreatmentClassifier = (path: string) => PathTreatment;
