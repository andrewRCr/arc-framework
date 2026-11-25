/** Unstored standard-lane facts shared by offers, reports, and lane reads. */
import { z } from "zod";
import { LaneResponsePerformanceSchema } from "../core/operation-state-schema.js";

const LookSchema = z.strictObject({
  producerId: z.string().min(1), logicalPass: z.number().int().positive(),
  coverage: z.enum(["complete", "fix-check"]), outcome: z.string().min(1),
});
const TrendSchema = LookSchema.extend({
  materialCount: z.number().int().nonnegative().nullable(), provisional: z.boolean(),
});
const SizeSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("known"), metrics: z.strictObject({
    lines: z.number().int().nonnegative(), files: z.number().int().nonnegative(),
  }) }),
  z.strictObject({ kind: z.literal("unknown"),
    reason: z.enum(["git-failure", "invalid-range", "malformed-output", "unsafe-total"]) }),
]);
const RoundSchema = LaneResponsePerformanceSchema.pick({ producerId: true, dispositionSetId: true,
  originatingHeadSha: true, producedHeadSha: true }).extend({
  /** Heuristic: changed paths compared with each approved fix locus's leading path token. */
  outsideCitedLoci: z.boolean().nullable(), addedFiles: z.boolean().nullable(),
});
export const NextPassFactsSchema = z.strictObject({
  fixRounds: z.array(RoundSchema),
  chainProven: z.boolean(), rangeSize: z.strictObject({ target: SizeSchema, fix: SizeSchema.nullable() }),
  completePasses: z.number().int().nonnegative(), ceiling: z.number().int().positive(),
  fixChecksSinceLastComplete: z.array(LookSchema), materialTrend: z.array(TrendSchema),
});
export type NextPassFacts = z.infer<typeof NextPassFactsSchema>;
