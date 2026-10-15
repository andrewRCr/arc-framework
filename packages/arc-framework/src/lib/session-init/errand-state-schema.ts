/** Full contracts for resumable, in-flight, and materializable Errand state. */
import { z } from "zod";
import { SessionActionsSchema } from "./actions.js";
import { withRemoteEvidence } from "../kernel/index.js";
import { NudgeMarkerStateSchema } from "./nudge-schema.js";
const NON_EMPTY_TEXT = z.string().min(1);
const InFlightErrandReportSchema = z.strictObject({
    slug: z.string(), branch: z.string(), ageDays: z.number(),
    state: z.enum(["in-progress", "awaiting-merge", "stale", "merged-cleanup", "blocked"]),
    blockingReason: z.literal("evidence-unavailable").optional(),
  })
  .superRefine((value, context) => {
    if (value.state === "blocked" && value.blockingReason !== "evidence-unavailable") {
      context.addIssue({ code: "custom", path: ["blockingReason"], message: "blocked Errands require a reason" });
    }
    if (value.state !== "blocked" && value.blockingReason !== undefined) {
      context.addIssue({ code: "custom", path: ["blockingReason"], message: "classified Errands cannot be blocked" });
    }
  });
export const MaterializableErrandSchema = z.strictObject({
    slug: NON_EMPTY_TEXT,
    claimId: NON_EMPTY_TEXT,
    branch: NON_EMPTY_TEXT,
    expectedHead: NON_EMPTY_TEXT,
    state: z.enum(["paused", "awaiting-merge"]),
    originEntry: NON_EMPTY_TEXT.nullable(),
    actions: SessionActionsSchema.optional(),
  });

/** Complete Errand session state with evidence-qualified cleanup. */
export const ErrandStateResultSchema = withRemoteEvidence({
    resume: z.strictObject({ resumable: z.boolean(), slug: z.string().nullable(), actions: SessionActionsSchema.optional() }),
    inFlight: z.strictObject({ errands: z.array(InFlightErrandReportSchema) }),
    materializable: z.strictObject({ candidates: z.array(MaterializableErrandSchema) }),
    nudge: NudgeMarkerStateSchema,
    warnings: z.array(z.string()),
    residue: z.array(z.strictObject({ branch: z.string(), slug: z.string(),
      actions: SessionActionsSchema.optional(),
      reason: z.enum(["no-record-or-meta", "errand-record-without-branch", "classification-unavailable"]),
      marks: z.array(z.enum(["degraded", "indeterminate", "location-ambiguous"])).readonly().optional() })),
  })
  .superRefine((value, context) => {
    if (
      value.remoteEvidence !== "exact"
      && value.inFlight.errands.some((report) => report.state === "merged-cleanup")
    ) {
      context.addIssue({ code: "custom", path: ["inFlight", "errands"], message: "incomplete evidence cannot authorize cleanup" });
    }
  });

