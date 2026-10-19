/** Public request and result contracts for unstored lane reads. */
import { z } from "zod";
import { LaneSubjectLineageSchema } from "./core/lane-admission.js";
import { GitObjectIdSchema } from "./core/gate-contract-v2-schema.js";
import { ReviewFindingIdentitySchema } from "./core/finding-records.js";
import { DispositionTitleSchema } from "./core/disposition-records.js";
import { NextPassFactsSchema } from "./policy/next-pass-facts-schema.js";
import { SpineRemedySchema } from "../integration/spine-refusal.js";

export const ReviewLaneReadRequestSchema = z.strictObject({
  schemaVersion: z.literal(1), memberHeadObjectId: GitObjectIdSchema.optional(),
});
export type ReviewLaneReadRequest = z.infer<typeof ReviewLaneReadRequestSchema>;
const RejectionSchema = z.strictObject({
  lane: z.enum(["frontline", "standard"]), findingId: ReviewFindingIdentitySchema,
  locus: z.string().min(1), title: DispositionTitleSchema.optional(), reason: z.string().min(1),
  sourceVerification: z.enum(["verified", "not-supported"]),
});
const LastLookSchema = z.strictObject({ producerId: z.string().min(1),
  coverage: z.enum(["complete", "incremental"]), outcome: z.string().min(1) });
const Header = { schemaVersion: z.literal(1), mode: z.literal("review-lane-read"), diagnostics: z.array(z.string()) };
export const ReviewLaneReadEnvelopeSchema = z.discriminatedUnion("state", [
  z.strictObject({ ...Header, state: z.literal("ready"), nextAction: z.literal("none"), payload: z.strictObject({
    lineage: LaneSubjectLineageSchema, rejections: z.array(RejectionSchema), facts: NextPassFactsSchema,
    lastLook: LastLookSchema.nullable(),
  }) }),
  z.strictObject({ ...Header, state: z.literal("refused"), nextAction: z.literal("stop"), payload: z.strictObject({
    code: z.string().min(1), detail: z.string().min(1), remedy: SpineRemedySchema,
  }) }),
]);
export type ReviewLaneReadEnvelope = z.infer<typeof ReviewLaneReadEnvelopeSchema>;
