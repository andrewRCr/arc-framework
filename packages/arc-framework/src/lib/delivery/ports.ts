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
  isValidSuccessor(current: T | null, proposed: T): boolean;
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

/** Closed failures admitted by delivery-state storage and reverse lookup. */
export type DeliveryStateStoreFailure =
  | "record-malformed"
  | "identity-mismatch"
  | "version-conflict"
  | "ambiguous-match"
  | "namespace-corrupt";

/** One mutable delivery-record snapshot and its compare-and-swap revision. */
export interface DeliveryRevisionedRecord<T> {
  readonly revision: number;
  readonly value: T;
}

/** Exact member-checkout selector used by authoritative delivery lookup. */
export type DeliveryMemberSelector =
  | { readonly kind: "head"; readonly objectId: string }
  | { readonly kind: "ref"; readonly ref: string; readonly observedHeadObjectId: string };

/** Optional ownership hint validated against, but never used to restrict, global lookup. */
export interface DeliveryOwningUnitPointer {
  readonly workUnitId: string;
  readonly planId: string;
}

/** One authoritative state match for a member checkout. */
export interface DeliveryStateMemberResolution<TState> {
  readonly planId: string;
  readonly deliverableId: CanonicalDigest;
  readonly workUnitId: string;
  readonly state: TState;
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

/** Revision-checked delivery-state storage and authoritative member reverse lookup. */
export interface DeliveryStateStore<TState> {
  read(
    planId: string,
  ): Promise<DeliveryStoreResult<DeliveryRevisionedRecord<TState> | null, DeliveryStateStoreFailure>>;
  publish(
    planId: string,
    value: TState,
    expectedRevision: number,
  ): Promise<DeliveryStoreResult<DeliveryRevisionedRecord<TState>, DeliveryStateStoreFailure>>;
  resolveMember(input: {
    readonly selector: DeliveryMemberSelector;
    readonly owningUnit?: DeliveryOwningUnitPointer;
  }): Promise<DeliveryStoreResult<DeliveryStateMemberResolution<TState> | null, DeliveryStateStoreFailure>>;
}
