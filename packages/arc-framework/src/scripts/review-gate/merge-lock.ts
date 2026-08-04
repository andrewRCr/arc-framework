/**
 * Merge-lock verb contracts — how a pull request should open, and whether a
 * hold or release applies to a live one.
 *
 * @module
 */

import { z } from "zod";

import {
  ReviewTargetSchema,
  ReviewTreeRootSchema,
  ReviewVehicleSchema,
} from "./readiness.js";

/**
 * Input to the pre-open query. No pull request exists yet, so the request
 * carries the candidate tree alone — the opening disposition is the same for
 * every lane and vehicle kind.
 */
export const MergeLockResolveRequestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  treeRoot: ReviewTreeRootSchema,
}).readonly();
export type MergeLockResolveRequest = z.infer<typeof MergeLockResolveRequestSchema>;

/**
 * Input to `hold` and `release`. Both act on a live pull request behind the
 * exact-head preflight, and the vehicle is what the readiness evaluation
 * consumes, so the two verbs take one shape.
 */
export const MergeLockTransitionRequestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  treeRoot: ReviewTreeRootSchema,
  target: ReviewTargetSchema,
  vehicle: ReviewVehicleSchema,
}).readonly();
export type MergeLockTransitionRequest = z.infer<typeof MergeLockTransitionRequestSchema>;
