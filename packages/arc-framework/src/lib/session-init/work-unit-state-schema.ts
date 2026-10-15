/** Full contracts for in-flight completion reports and their session state. */
import { z } from "zod";
import { NudgeMarkerStateSchema } from "./nudge-schema.js";
/** Evidence-qualified base relation; an unavailable read grants no mergeability. */
export const BehindBaseRelationSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("known"), value: z.boolean(), remoteEvidence: z.literal("exact") }),
  z.discriminatedUnion("remoteEvidence", [
    z.strictObject({
      status: z.literal("unavailable"),
      remoteEvidence: z.literal("pending-fetch"),
      reason: z.literal("base-object-pending-fetch"),
    }),
    z.strictObject({
      status: z.literal("unavailable"),
      remoteEvidence: z.literal("unreachable"),
      failureReason: z.enum(["timeout", "network", "auth", "error"]),
    }),
    z.strictObject({
      status: z.literal("unavailable"),
      remoteEvidence: z.literal("exact"),
      reason: z.literal("remote-base-absent"),
    }),
  ]),
  z.strictObject({ status: z.literal("not-applicable"), remoteEvidence: z.literal("not-applicable") }),
]);

/** Complete event classification with evidence-qualified mergeability. */
export const InFlightWorkUnitReportSchema = z.discriminatedUnion("state", [
  z.strictObject({
    name: z.string(), branch: z.string(), ageDays: z.number(),
    state: z.enum(["awaiting-review", "stale", "blocked", "mergeable", "merged-needs-archival"]),
    behindBase: BehindBaseRelationSchema,
  }).superRefine((value, context) => {
    if (value.state === "mergeable" && value.behindBase.status !== "known") {
      context.addIssue({ code: "custom", path: ["behindBase"], message: "mergeable requires known base evidence" });
    }
  }),
  z.strictObject({
    name: z.string(), branch: z.string(), ageDays: z.number(),
    state: z.literal("mergeability-unavailable"),
    behindBase: BehindBaseRelationSchema,
    mergeabilityGuidance: z.string().min(1),
  }),
]);

/** Complete completion-tail session state, including nudge facts and warnings. */
export const WorkUnitStateResultSchema = z.strictObject({
    inFlight: z.strictObject({ workUnits: z.array(InFlightWorkUnitReportSchema) }),
    nudge: NudgeMarkerStateSchema,
    warnings: z.array(z.string()),
  });

