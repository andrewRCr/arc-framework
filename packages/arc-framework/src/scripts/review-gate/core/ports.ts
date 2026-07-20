/** Behavioral ports around normalized review records. */

import type { CapabilitySet, NormalizedChangeRequest } from "./contracts.js";
import type { Evidence, FindingClosure } from "./evidence.js";
import type {
  ForwardLifecycleSurface,
  ForwardLifecycleTailProof,
  LifecycleTailProof,
} from "./lifecycle-tail.js";
import type {
  ReviewReceiptV2,
  ReviewRequestV2,
  ReviewTarget,
} from "./gate-contract-v2-schema.js";
import type { ForwardGateProjection } from "./projection.js";
import type { ReviewOperationState } from "./operation-state-schema.js";
import type {
  GateProjection,
  ReceiptEnvelope,
  ReviewReceipt,
  ReviewRequest,
  SourceCapacity,
} from "./execution.js";

/** Opaque reference returned after projecting a verdict. */
export interface HostProjectionRef {
  opaqueRef: string;
}

/** Scope facts compared across the reviewed and current sides of a lifecycle tail. */
export interface LifecycleTailScope {
  baseRef: string;
  diffBaseSha: string;
  policyVersion: string;
  rubricVersion: string;
  sourceIdentity: string;
}

/** Neutral input for a storage adapter that may classify a lifecycle tail. */
export interface LifecycleTailProofResolutionInput {
  predicateId: string;
  reviewedThroughSha: string;
  currentHeadSha: string;
  reviewed: LifecycleTailScope;
  current: LifecycleTailScope;
}

/** Storage adapter boundary; `null` represents a storage tier with no code-head tail. */
export interface LifecycleTailProofAdapter {
  resolveLifecycleTail(input: LifecycleTailProofResolutionInput): Promise<LifecycleTailProof | null>;
}

/** One exact target-side scope supplied to forward lifecycle-tail classification. */
export interface ForwardLifecycleTailScope {
  target: ReviewTarget;
  surface: ForwardLifecycleSurface;
  policyVersion: string;
  rubricVersion: string;
  rubricDigest: string;
  sourceIdentity: string;
}

/** Neutral forward input for a storage adapter that may classify a lifecycle tail. */
export interface ForwardLifecycleTailProofResolutionInput {
  predicateId: "lifecycle-bookkeeping-tail/v2";
  reviewed: ForwardLifecycleTailScope;
  current: ForwardLifecycleTailScope;
}

/** Forward storage adapter boundary; null means the target has no post-review lifecycle tail. */
export interface ForwardLifecycleTailProofAdapter {
  resolveForwardLifecycleTail(
    input: ForwardLifecycleTailProofResolutionInput,
  ): Promise<ForwardLifecycleTailProof | null>;
}

/** Stable diagnostics for an untrusted or unavailable receipt ledger. */
export type ReceiptLedgerDiagnostic =
  | "malformed-receipt"
  | "ledger-fork"
  | "ledger-regression"
  | "ledger-anchor-mismatch"
  | "ledger-disappeared"
  | "ledger-unavailable";

/** Trusted versioned receipt-ledger snapshot. */
export interface ValidReceiptLedger {
  kind: "valid";
  ledgerVersion: number;
  receipts: ReceiptEnvelope[];
}

/** Untrusted ledger state that still carries failure diagnostics for publication. */
export interface DegradedReceiptLedger {
  kind: "degraded";
  diagnostics: ReceiptLedgerDiagnostic[];
  observedLedgerVersion: number | null;
  receipts: [];
}

/** One valid trusted ledger or a fail-closed degraded snapshot. */
export type ReceiptLedger = ValidReceiptLedger | DegradedReceiptLedger;

/** Result of an expected-version append. */
export interface ReceiptAppendResult {
  ledgerVersion: number;
  durableEvidenceRef: string;
}

/** A provider's acknowledgement of one admitted request. */
export interface RequestAcknowledgement {
  requestIdentity: string;
  acknowledgedAt: string;
  trigger: {
    eventKind: "comment" | "label";
    eventId: string;
    actorIdentity: string;
    contentDigest: string;
    occurredAt: string;
    headSha: string;
  };
  durableRef?: string;
}

/** Opaque provider observation awaiting normalization. */
export interface ProviderObservation {
  schemaVersion: 1;
  requestIdentity: string;
  sourceIdentity: string;
  observedAt: string;
  opaqueRef: string;
}

/** Addressing login paired with the immutable actor id it must resolve to. */
export interface ActorAddress {
  login: string;
  expectedActorId: string;
}

/** Host-neutral changed-path record used by policy classification. */
export type HostChangedPath =
  | { status: "added" | "modified" | "deleted" | "type-changed"; path: string; previousPath?: never }
  | { status: "renamed" | "copied"; path: string; previousPath: string };

/** Host-neutral context retained beside a normalized change request. */
export interface HostChangeContext {
  changedPaths: HostChangedPath[];
  author: { identity: string; login: string };
  isDraft: boolean;
  isCrossRepository: boolean;
  mergeability: "unknown" | "mergeable" | "conflicting";
}

/** Lossless resolved change request and the context policy/readiness consume. */
export interface HostChangeRequestResolution {
  changeRequest: NormalizedChangeRequest;
  context: HostChangeContext;
}

/** One durable native review disposition retained for policy-addressable providers. */
export interface ProviderReviewDisposition {
  reviewId: string;
  actorIdentity: string;
  state: "approved" | "changes-requested" | "commented" | "dismissed" | "pending";
  commitId: string;
  submittedAt: string | null;
  evidenceRef: string;
}

/** Lossless native-review observation; never independent-analysis evidence. */
export interface NativeReviewObservation {
  nativeReview: {
    requestedChanges: boolean;
    unresolvedRequiredConversations: number;
    decision: "not-configured" | "review-required" | "changes-requested" | "approved" | "unknown";
  };
  peerApprovals: Array<{ actorIdentity: string; headSha: string }>;
  closures: FindingClosure[];
  providerReviews: ProviderReviewDisposition[];
}

/** Inputs for a canonical native-review read. */
export interface NativeReviewReadInput {
  hostRef: string;
  headSha: string;
  authorIdentity: string;
  expectsNativeReview: boolean;
  nonClosingResolvers?: readonly string[];
}

/** Read-side boundary for change, actor, and native-review state. */
export interface GitHostReadAdapter {
  resolveChangeRequest(hostRef: string): Promise<HostChangeRequestResolution>;
  resolveActorCapabilities(actor: ActorAddress): Promise<CapabilitySet>;
  observeNativeReview(input: NativeReviewReadInput): Promise<NativeReviewObservation>;
}

/** Inputs for publishing one verdict across the configured context set. */
export interface VerdictPublicationInput {
  hostRef: string;
  headSha: string;
  changeSetId: string;
  projection: GateProjection;
  mode: "shadow" | "dual" | "final";
  expectedAppId: string;
  anchorReceiptCount: number | null;
  readCurrentState: () => Promise<{ headSha: string; changeSetId: string }>;
}

/** Exact pending projection coordinates confirmed before a provider effect. */
export interface PendingProjectionConfirmationInput {
  hostRef: string;
  headSha: string;
  changeSetId: string;
  projection: GateProjection;
  mode: "shadow" | "dual" | "final";
  expectedAppId: string;
}

/** Boundary for canonical host reads and verdict projection. */
export interface GitHostAdapter extends GitHostReadAdapter {
  publishVerdict(input: VerdictPublicationInput): Promise<HostProjectionRef[]>;
  confirmPendingProjection(input: PendingProjectionConfirmationInput): Promise<boolean>;
}

/** Storage boundary for version-checked receipt persistence. */
export interface ReviewReceiptStore {
  readLedger(changeRequestId: string): Promise<ReceiptLedger>;
  appendReceipt(receipt: ReviewReceipt, expectedLedgerVersion: number): Promise<ReceiptAppendResult>;
}

/** Boundary for source capacity, request admission, and evidence observation. */
export interface ReviewProviderAdapter {
  readCapacity(sourceIdentity: string): Promise<SourceCapacity>;
  qualifyRequest(request: ReviewRequest): Promise<{ qualified: boolean; reason: string }>;
  request(request: ReviewRequest): Promise<RequestAcknowledgement>;
  observe(requestIdentity: string): Promise<ProviderObservation[]>;
  normalizeEvidence(observations: ProviderObservation[]): Promise<Evidence[]>;
}

/** Versioned forward receipt snapshot, optionally filtered to one target. */
export interface ForwardReceiptLedger {
  ledgerVersion: number;
  receipts: ReviewReceiptV2[];
}

/** Dormant forward receipt persistence boundary, isolated from schema-v1 ledgers. */
export interface ForwardReviewReceiptStore {
  readReceipts(targetId: string): Promise<ForwardReceiptLedger>;
  appendReceipt(
    receipt: ReviewReceiptV2,
    expectedLedgerVersion: number,
  ): Promise<{ ledgerVersion: number; durableEvidenceRef: string }>;
}

/** Versioned storage boundary for resumable, explicitly non-evidentiary review operations. */
export interface ReviewOperationStateStore {
  readOperation(operationId: string): Promise<{
    version: number;
    state: ReviewOperationState | null;
  }>;
  publishOperation(
    state: ReviewOperationState,
    expectedVersion: number,
  ): Promise<{ version: number }>;
}

/** Forward provider boundary carrying exact v2 request identity without provider finding normalization. */
export interface ForwardReviewProviderAdapter {
  qualifyRequest(request: ReviewRequestV2): Promise<{ qualified: boolean; reason: string }>;
  request(request: ReviewRequestV2): Promise<{
    requestId: string;
    providerEventIdentity: string | null;
  }>;
}

/** Forward host projection boundary keyed by the exact target rather than legacy change-set aliases. */
export interface ForwardGitHostProjectionAdapter {
  publishForwardProjection(input: {
    target: ReviewTarget;
    projection: ForwardGateProjection;
  }): Promise<HostProjectionRef[]>;
}
