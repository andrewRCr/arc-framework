/** Semantic fingerprint derivation for delivery members and seams. */

import { canonicalDigest, sortByCanonicalBytes, type CanonicalDigest } from "../kernel/index.js";
import type { BoundDesignElement } from "./design-inventory.js";
import type { DeliveryTaskInventoryEntry } from "./task-inventory.js";

/** One incident seam whose semantics contribute to a member fingerprint. */
export interface IncidentSeamFingerprint {
  readonly seamKey: string;
  readonly semanticFingerprint: CanonicalDigest;
}

/** Complete semantic input for a live delivery member. */
export interface MemberSemanticFingerprintInput {
  readonly title: string;
  readonly contract: string;
  readonly tasks: readonly DeliveryTaskInventoryEntry[];
  readonly designElements: readonly BoundDesignElement[];
  readonly mainlineLandability: "independently-landable" | "integration-only";
  readonly incidentSeams: readonly IncidentSeamFingerprint[];
}

/** Semantic input for a cross-member seam. */
export interface SeamSemanticFingerprintInput {
  readonly title: string;
  readonly acceptance: string;
  readonly incidentDeliverableIds: readonly CanonicalDigest[];
}

/** Result of normalizing seam incidence against plan member order. */
export type SeamScheduleResult =
  | {
    readonly status: "resolved";
    readonly incidentDeliverableIds: readonly CanonicalDigest[];
    readonly ownerDeliverableId: CanonicalDigest;
  }
  | {
    readonly status: "refused";
    readonly reason: "insufficient-incidence" | "duplicate-incident" | "unknown-incident";
  };

/** Derive a live member's semantic fingerprint. */
export function deriveMemberSemanticFingerprint(
  input: MemberSemanticFingerprintInput,
): CanonicalDigest {
  return canonicalDigest({
    schemaVersion: 1,
    semanticsVersion: "delivery-plan/v1",
    subjectKind: "member",
    contract: input.contract,
    tasks: sortByCanonicalBytes(input.tasks),
    designElements: sortByCanonicalBytes(input.designElements),
    mainlineLandability: input.mainlineLandability,
    incidentSeams: sortByCanonicalBytes(input.incidentSeams),
  });
}

/** Derive a seam's semantic fingerprint. */
export function deriveSeamSemanticFingerprint(
  input: SeamSemanticFingerprintInput,
): CanonicalDigest {
  return canonicalDigest({
    schemaVersion: 1,
    semanticsVersion: "delivery-plan/v1",
    subjectKind: "seam",
    acceptance: input.acceptance,
    incidentDeliverableIds: sortByCanonicalBytes(input.incidentDeliverableIds),
  });
}

/** Resolve canonical seam incidence and its latest plan-ordered owner. */
export function deriveSeamSchedule(
  memberOrder: readonly CanonicalDigest[],
  incidentDeliverableIds: readonly CanonicalDigest[],
): SeamScheduleResult {
  if (incidentDeliverableIds.length < 2) {
    return { status: "refused", reason: "insufficient-incidence" };
  }
  const incidentSet = new Set(incidentDeliverableIds);
  if (incidentSet.size !== incidentDeliverableIds.length) {
    return { status: "refused", reason: "duplicate-incident" };
  }
  const ordered = memberOrder.filter((deliverableId) => incidentSet.has(deliverableId));
  if (ordered.length !== incidentSet.size) {
    return { status: "refused", reason: "unknown-incident" };
  }
  const ownerDeliverableId = ordered.at(-1);
  if (ownerDeliverableId === undefined) {
    return { status: "refused", reason: "insufficient-incidence" };
  }
  return {
    status: "resolved",
    incidentDeliverableIds: ordered,
    ownerDeliverableId,
  };
}
