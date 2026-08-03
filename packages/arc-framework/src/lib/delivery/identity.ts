/** Stable identity construction for canonical delivery plans and subjects. */

import { randomUUID } from "node:crypto";

import {
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
