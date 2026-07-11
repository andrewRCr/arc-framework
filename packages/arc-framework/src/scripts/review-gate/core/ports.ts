/** Behavioral ports around normalized review records. */

import type { CapabilitySet, NormalizedChangeRequest } from "./contracts.js";
import type { Evidence } from "./evidence.js";
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

/** Boundary for change discovery, native evidence, and verdict projection. */
export interface GitHostAdapter {
  resolveChangeRequest(hostRef: string): Promise<NormalizedChangeRequest>;
  resolveActorCapabilities(actorIdentity: string): Promise<CapabilitySet>;
  observeNativeEvidence(changeRequestId: string): Promise<Evidence[]>;
  publishVerdict(changeRequestId: string, projection: GateProjection): Promise<HostProjectionRef>;
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
