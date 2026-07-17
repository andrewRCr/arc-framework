/**
 * Retirement-authority contract for terminal worktree cleanup.
 *
 * The public vocabulary describes preservation evidence rather than lifecycle
 * state. Drivers record evidence through this port; teardown consumes only its
 * typed authorization decisions and never inspects adapter storage directly.
 */

import type { CanonicalDigest } from "../canonical/canonical-json.js";
import type { RetirementTransition } from "../canonical/receipt-id.js";
import type { WorktreeSubject } from "../git/worktree-marker.js";
import type { DecomposeAllocationMap } from "./decompose-cut-map.js";
import type {
  DecomposeIncomingEdgeInventoryEntry,
  DecomposeOutgoingEdgeInventoryEntry,
  DecomposeSourceInventoryEntry,
} from "./decompose-inventory.js";

/** Preservation fact that can authorize a terminal worktree transition. */
export type HuskAuthorization = "merged-preserved" | "discard-confirmed" | "planning-relocated";

/** Proof about the requested remote ref at authorization time. */
export type RemoteRefProof =
  | null
  | {
      remote: string;
      oid: string;
      disposition: "delete" | "retain";
    };

/** Stable evidence reference carried into the terminal worktree stamp. */
export type RetirementEvidenceRef =
  | {
      kind: "shipped";
      expectedLifecycle: "completed";
      resultDigest: CanonicalDigest;
      baseProofOid: string;
    }
  | {
      kind: "receipt";
      receiptId: CanonicalDigest;
      transition: RetirementTransition;
      expectedLifecycle: "planned" | "nonexistent";
      resultDigest: CanonicalDigest;
    };

/** Persisted evidence preserves unknown future kinds without authorizing them. */
export type PersistedRetirementEvidence =
  | RetirementEvidenceRef
  | ({ kind: string } & Readonly<Record<string, unknown>>);

/** Result of decoding known or forward-compatible retirement evidence. */
export type DecodedRetirementEvidence =
  | { kind: "known"; value: RetirementEvidenceRef }
  | {
      kind: "unknown";
      value: { kind: string } & Readonly<Record<string, unknown>>;
    };

export type { DecomposeAllocationMap } from "./decompose-cut-map.js";

/** Safe direct locator for one persisted decompose preparation. */
export interface DecomposePreparationLocator {
  receiptId: CanonicalDigest;
  preparationId: CanonicalDigest;
  scope: RetirementAuthorityScope;
}

/** Prepared decompose state returned to its driver. */
export interface PreparedDecomposeRetirement {
  locator: DecomposePreparationLocator;
  record: DecomposePreparationRecord;
  authorityVersion: string;
}

/** Durable compare-and-set envelope written before decompose mutates artifacts. */
export interface DecomposePreparationRecord {
  kind: "prepared-decompose";
  schemaVersion: 1;
  locator: DecomposePreparationLocator;
  allocation: DecomposeAllocationMap;
  sourceInventory: DecomposeSourceInventoryEntry[];
  incomingEdgeInventory: DecomposeIncomingEdgeInventoryEntry[];
  outgoingEdgeInventory: DecomposeOutgoingEdgeInventoryEntry[];
  allowedPaths: string[];
  sourceArtifactDigest: CanonicalDigest;
  sourceInventoryDigest: CanonicalDigest;
  incomingEdgeInventoryDigest: CanonicalDigest;
  outgoingEdgeInventoryDigest: CanonicalDigest;
  cutMapDigest: CanonicalDigest;
}

/** Canonical non-shipped retirement receipt. */
export interface RetirementReceipt {
  schemaVersion: 1;
  receiptId: CanonicalDigest;
  subject: WorktreeSubject;
  transition: RetirementTransition;
  source: {
    branch: string;
    head: string;
    artifactDigest: CanonicalDigest;
  };
  transitionPatchDigest: CanonicalDigest;
  retiringProjection: { kind: "direct-transition" } | { kind: "unchanged" };
  authorization: Exclude<HuskAuthorization, "merged-preserved">;
  result:
    | { kind: "discard"; artifactDigest: "absent" }
    | {
        kind: "decompose";
        preparationId: CanonicalDigest;
        allocation: DecomposeAllocationMap;
        cutMapDigest: CanonicalDigest;
        sourceInventoryDigest: CanonicalDigest;
        incomingEdgeInventoryDigest: CanonicalDigest;
        outgoingEdgeInventoryDigest: CanonicalDigest;
        targets: ReadonlyArray<{
          path: string;
          artifactDigest: CanonicalDigest;
        }>;
      }
    | { kind: "relocate"; plannedArtifactDigest: CanonicalDigest };
}

/** Exact source and result projections bound by an authority snapshot. */
export interface RetirementAuthorityScope {
  subject: WorktreeSubject;
  transition: RetirementTransition;
  source: {
    branch: string;
    head: string;
  };
  resultProjection: {
    ref: string;
    head: string;
  };
}

/** Opaque compare-and-set snapshot returned before a driver mutates state. */
export interface RetirementAuthoritySnapshot {
  authorityVersion: string;
  sourceRefOid: string;
  resultRefOid: string;
  recordState: "absent" | "prepared-decompose";
}

/** Exact live teardown request. */
export interface TeardownAuthorizationRequest {
  subject: WorktreeSubject;
  branch: string;
  head: string;
  remote: string;
  requestedMode: "shipped" | "abandoned";
}

/** Closed semantic refusal set consumed by orchestration and rendering. */
export type TeardownAuthorizationRefusal =
  | "unsupported-transition"
  | "evidence-missing"
  | "evidence-mismatch"
  | "projection-mismatch"
  | "conservation-unproven"
  | "preservation-unproven"
  | "authority-unavailable"
  | "authority-ambiguous"
  | "authority-conflict";

/** Authorized proof or one semantic refusal. */
export type TeardownAuthorizationDecision =
  | {
      status: "authorized";
      authorization: HuskAuthorization;
      authorityVersion: string;
      evidence: RetirementEvidenceRef;
      refs: {
        localOid: string;
        remote: RemoteRefProof;
      };
    }
  | {
      status: "refused";
      reason: TeardownAuthorizationRefusal;
    };

/** Storage-agnostic authority boundary shared by lifecycle drivers and teardown. */
export interface RetirementAuthorityPort {
  readSnapshot(scope: RetirementAuthorityScope): Promise<
    | { status: "resolved"; snapshot: RetirementAuthoritySnapshot }
    | { status: "refused"; reason: TeardownAuthorizationRefusal }
  >;

  record(receipt: RetirementReceipt, expectedAuthorityVersion: string): Promise<
    | { status: "recorded"; authorityVersion: string }
    | { status: "refused"; reason: TeardownAuthorizationRefusal; diagnostic?: string }
  >;

  prepareDecompose(
    scope: RetirementAuthorityScope,
    allocation: DecomposeAllocationMap,
    expectedAuthorityVersion: string,
  ): Promise<
    | { status: "prepared"; preparation: PreparedDecomposeRetirement }
    | { status: "refused"; reason: TeardownAuthorizationRefusal }
  >;

  finalizeDecompose(locator: DecomposePreparationLocator, expectedAuthorityVersion: string): Promise<
    | { status: "recorded"; receipt: RetirementReceipt; authorityVersion: string }
    | { status: "refused"; reason: TeardownAuthorizationRefusal }
  >;

  authorize(request: TeardownAuthorizationRequest): Promise<TeardownAuthorizationDecision>;

  revalidate(
    request: TeardownAuthorizationRequest,
    proof: Extract<TeardownAuthorizationDecision, { status: "authorized" }>,
  ): Promise<
    | { status: "valid" }
    | { status: "refused"; reason: TeardownAuthorizationRefusal }
  >;
}

/**
 * Compare typed worktree subjects without collapsing their identity domains.
 *
 * @param left - First worktree subject
 * @param right - Second worktree subject
 * @returns Whether both subjects have the same kind and value
 */
export function worktreeSubjectsEqual(left: WorktreeSubject, right: WorktreeSubject): boolean {
  if (left.kind !== right.kind) return false;
  switch (left.kind) {
    case "work-unit":
      return right.kind === "work-unit" && left.name === right.name;
    case "errand":
      return right.kind === "errand" && left.slug === right.slug;
    case "branch":
      return right.kind === "branch" && left.ref === right.ref;
  }
}

/**
 * Return the subject-level refusal for transitions unsupported by this port.
 *
 * @param subject - Typed worktree subject
 * @returns A semantic refusal, or `null` when the subject is supported
 */
export function retirementSubjectRefusal(subject: WorktreeSubject): TeardownAuthorizationRefusal | null {
  return subject.kind === "errand" ? "unsupported-transition" : null;
}

/**
 * Validate the fixed transition/authorization/lifecycle/result matrix.
 *
 * @param receipt - Receipt whose cross-fields must agree
 * @param expectedLifecycle - Lifecycle location claimed by its evidence reference
 * @returns `null` for the fixed valid combinations, otherwise `evidence-mismatch`
 */
export function validateReceiptMatrix(
  receipt: RetirementReceipt,
  expectedLifecycle: "planned" | "nonexistent",
): TeardownAuthorizationRefusal | null {
  const valid =
    (receipt.transition === "abandon"
      && receipt.authorization === "discard-confirmed"
      && expectedLifecycle === "nonexistent"
      && receipt.result.kind === "discard")
    || (receipt.transition === "decompose"
      && receipt.authorization === "discard-confirmed"
      && expectedLifecycle === "nonexistent"
      && receipt.result.kind === "decompose")
    || (receipt.transition === "park-planning"
      && receipt.authorization === "planning-relocated"
      && expectedLifecycle === "planned"
      && receipt.result.kind === "relocate");
  return valid ? null : "evidence-mismatch";
}

/**
 * Render one stable diagnostic for every semantic refusal.
 *
 * @param reason - Closed refusal code
 * @returns Human-readable diagnostic
 */
export function describeTeardownAuthorizationRefusal(reason: TeardownAuthorizationRefusal): string {
  switch (reason) {
    case "unsupported-transition":
      return "unsupported transition";
    case "evidence-missing":
      return "retirement evidence is missing";
    case "evidence-mismatch":
      return "retirement evidence does not match the requested transition";
    case "projection-mismatch":
      return "the live branch projection does not match the request";
    case "conservation-unproven":
      return "content conservation is not proven";
    case "preservation-unproven":
      return "preservation is not proven";
    case "authority-unavailable":
      return "retirement authority is unavailable";
    case "authority-ambiguous":
      return "retirement authority found conflicting evidence";
    case "authority-conflict":
      return "retirement authority changed during the operation";
    default: {
      const exhaustive: never = reason;
      return exhaustive;
    }
  }
}
