/** Behavioral ports around normalized review records. */

import type { CapabilitySet, NormalizedChangeRequest } from "./contracts.js";
import type { Evidence, FindingClosure } from "./evidence.js";
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

/** Versioned receipt-ledger snapshot. */
export interface ReceiptLedger {
  ledgerVersion: number;
  receipts: ReceiptEnvelope[];
}

/** Result of an expected-version append. */
export interface ReceiptAppendResult {
  ledgerVersion: number;
  durableEvidenceRef: string;
}

/** A provider's acknowledgement of one admitted request. */
export interface RequestAcknowledgement {
  requestIdentity: string;
  acknowledgedAt: string;
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
export interface HostChangedPath {
  status: "added" | "modified" | "deleted" | "renamed";
  path: string;
  previousPath?: string;
}

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
  anchorReceiptCount: number;
  readCurrentState: () => Promise<{ headSha: string; changeSetId: string }>;
}

/** Boundary for canonical host reads and verdict projection. */
export interface GitHostAdapter extends GitHostReadAdapter {
  publishVerdict(input: VerdictPublicationInput): Promise<HostProjectionRef[]>;
}

/** Storage boundary for version-checked receipt persistence. */
export interface ReviewReceiptStore {
  readLedger(changeRequestId: string): Promise<ReceiptLedger>;
  appendReceipt(receipt: ReviewReceipt, expectedLedgerVersion: number): Promise<ReceiptAppendResult>;
}

/** Boundary for source capacity, request admission, and evidence observation. */
export interface ReviewProviderAdapter {
  readCapacity(sourceIdentity: string): Promise<SourceCapacity>;
  request(request: ReviewRequest): Promise<RequestAcknowledgement>;
  observe(requestIdentity: string): Promise<ProviderObservation[]>;
  normalizeEvidence(observations: ProviderObservation[]): Promise<Evidence[]>;
}
