/** Stable identity construction for canonical delivery plans and subjects. */

import { randomUUID } from "node:crypto";

import { canonicalDigest, type CanonicalDigest } from "../kernel/index.js";
import {
  DeliveryDeliverableIdPreimageSchema,
  DeliveryPlanIdSchema,
  type DeliveryPlanId,
  type DeliveryPlanV1,
} from "./schema.js";

/**
 * Mint the first plan identity or carry the predecessor's identity forward.
 *
 * @param priorRevision - The validated predecessor, or `null` for first authoring.
 * @param mint - Injectable UUID minting boundary.
 * @returns The stable plan identity.
 */
export function resolveDeliveryPlanId(
  priorRevision: DeliveryPlanV1 | null,
  mint: () => string = randomUUID,
): DeliveryPlanId {
  return priorRevision?.planId ?? DeliveryPlanIdSchema.parse(mint());
}

/** Derive one deliverable identity from its plan and stable authored chunk key. */
export function deriveDeliverableId(planId: string, chunkKey: string): CanonicalDigest {
  return canonicalDigest(DeliveryDeliverableIdPreimageSchema.parse({
    domain: "arc.delivery.deliverable-id/v1",
    schemaVersion: 1,
    semanticsVersion: "delivery-plan/v1",
    planId,
    chunkKey,
  }));
}

/** Derive a plan-ordered identity sequence while refusing duplicate authored keys. */
export function deriveUniqueDeliverableIds(
  planId: string,
  chunkKeys: readonly string[],
): readonly CanonicalDigest[] {
  if (new Set(chunkKeys).size !== chunkKeys.length) {
    throw new Error("duplicate chunk key");
  }
  return chunkKeys.map((chunkKey) => deriveDeliverableId(planId, chunkKey));
}
