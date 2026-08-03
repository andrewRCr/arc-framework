/** Storage-agnostic ports for delivery records and their fixed failure contracts. */

import type { CanonicalDigest } from "../kernel/index.js";

/** Successful runtime payload decoding or a codec-level rejection. */
export type DeliveryPayloadDecodeResult<T> =
  | { readonly status: "decoded"; readonly value: T }
  | { readonly status: "refused" };

/** Runtime boundary required by persisted delivery-record adapters. */
export interface DeliveryPayloadCodec<T> {
  decode(value: unknown): DeliveryPayloadDecodeResult<T>;
  planId(value: T): string;
}

/** Runtime plan codec with access to the plan's publication digest. */
export interface DeliveryPlanPayloadCodec<T> extends DeliveryPayloadCodec<T> {
  digest(value: T): CanonicalDigest;
}

/** Domain result returned by every delivery storage operation. */
export type DeliveryStoreResult<T, F extends string> =
  | { readonly status: "ok"; readonly value: T }
  | { readonly status: "refused"; readonly reason: F };

/** Closed failures admitted by the immutable-current plan port. */
export type DeliveryPlanStoreFailure =
  | "record-malformed"
  | "identity-mismatch"
  | "version-conflict"
  | "namespace-corrupt";

/** Closed failures admitted by assignment storage and reverse lookup. */
export type DeliveryAssignmentStoreFailure =
  | "record-malformed"
  | "identity-mismatch"
  | "version-conflict"
  | "ambiguous-match"
  | "namespace-corrupt";

/** Closed failures admitted by the regenerable observation port. */
export type DeliveryObservationStoreFailure =
  | "record-malformed"
  | "identity-mismatch"
  | "version-conflict"
  | "namespace-corrupt";

/** Closed failures admitted by append-only assurance storage. */
export type DeliveryAssuranceStoreFailure =
  | "record-malformed"
  | "identity-mismatch"
  | "predecessor-conflict"
  | "chain-invalid"
  | "import-nonempty"
  | "namespace-corrupt";

/** One mutable delivery-record snapshot and its compare-and-swap revision. */
export interface DeliveryRevisionedRecord<T> {
  readonly revision: number;
  readonly value: T;
}

/** Exact member-checkout selector used by authoritative assignment lookup. */
export type DeliveryMemberSelector =
  | { readonly kind: "head"; readonly objectId: string }
  | { readonly kind: "ref"; readonly ref: string; readonly observedHeadObjectId: string };

/** Optional direct candidate pointer; it narrows lookup but proves no identity. */
export interface DeliveryOwningUnitPointer {
  readonly workUnitId: string;
  readonly planId: string;
}

/** One authoritative assignment match for a member checkout. */
export interface DeliveryMemberResolution<TAssignment> {
  readonly planId: string;
  readonly deliverableId: CanonicalDigest;
  readonly workUnitId: string;
  readonly assignment: TAssignment;
}

/** One predecessor-chained assurance entry. */
export interface DeliveryAssuranceChainEntry<TAssurance> {
  readonly predecessorDigest: CanonicalDigest | null;
  readonly entryDigest: CanonicalDigest;
  readonly value: TAssurance;
}

/** Complete verified assurance history for one plan. */
export interface DeliveryAssuranceChain<TAssurance> {
  readonly entries: readonly DeliveryAssuranceChainEntry<TAssurance>[];
  readonly tailDigest: CanonicalDigest | null;
}

/** Immutable-current plan storage with digest-checked replacement and canonical enumeration. */
export interface DeliveryPlanStore<TPlan> {
  readCurrent(
    planId: string,
  ): Promise<DeliveryStoreResult<TPlan | null, DeliveryPlanStoreFailure>>;
  publishCurrent(
    planId: string,
    plan: TPlan,
    expectedCurrentDigest: CanonicalDigest | null,
  ): Promise<DeliveryStoreResult<{ readonly currentDigest: CanonicalDigest }, DeliveryPlanStoreFailure>>;
  enumerateCurrent(): Promise<DeliveryStoreResult<readonly TPlan[], DeliveryPlanStoreFailure>>;
}

/** Revision-checked assignment storage and authoritative member reverse lookup. */
export interface DeliveryAssignmentStore<TAssignment> {
  read(
    planId: string,
  ): Promise<DeliveryStoreResult<DeliveryRevisionedRecord<TAssignment> | null, DeliveryAssignmentStoreFailure>>;
  publish(
    planId: string,
    value: TAssignment,
    expectedRevision: number,
  ): Promise<DeliveryStoreResult<DeliveryRevisionedRecord<TAssignment>, DeliveryAssignmentStoreFailure>>;
  resolveMember(input: {
    readonly selector: DeliveryMemberSelector;
    readonly owningUnit?: DeliveryOwningUnitPointer;
  }): Promise<DeliveryStoreResult<DeliveryMemberResolution<TAssignment> | null, DeliveryAssignmentStoreFailure>>;
}

/** Revision-checked storage for regenerable host observations. */
export interface DeliveryObservationStore<TObservation> {
  read(
    planId: string,
  ): Promise<DeliveryStoreResult<DeliveryRevisionedRecord<TObservation> | null, DeliveryObservationStoreFailure>>;
  publish(
    planId: string,
    value: TObservation,
    expectedRevision: number,
  ): Promise<DeliveryStoreResult<DeliveryRevisionedRecord<TObservation>, DeliveryObservationStoreFailure>>;
}

/** Append-only assurance storage with complete-chain carry-over. */
export interface DeliveryAssuranceStore<TAssurance> {
  read(
    planId: string,
  ): Promise<DeliveryStoreResult<DeliveryAssuranceChain<TAssurance> | null, DeliveryAssuranceStoreFailure>>;
  append(
    planId: string,
    value: TAssurance,
    expectedTailDigest: CanonicalDigest | null,
  ): Promise<DeliveryStoreResult<DeliveryAssuranceChainEntry<TAssurance>, DeliveryAssuranceStoreFailure>>;
  exportChain(
    planId: string,
  ): Promise<DeliveryStoreResult<DeliveryAssuranceChain<TAssurance> | null, DeliveryAssuranceStoreFailure>>;
  importChain(
    planId: string,
    chain: DeliveryAssuranceChain<TAssurance>,
  ): Promise<DeliveryStoreResult<DeliveryAssuranceChain<TAssurance>, DeliveryAssuranceStoreFailure>>;
}
