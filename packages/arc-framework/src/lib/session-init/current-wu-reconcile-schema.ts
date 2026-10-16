/** Full read-only current-work-unit reconcile session contract. */
import { z } from "zod";
import { SessionActionsSchema } from "./actions.js";
import { ReferenceAdvisorySchema, ReferenceTransitionConflictSchema,
  TrackedReferenceReplacementSchema } from "../work-unit/reference-reconcile-schema.js";
const NON_EMPTY_TEXT = z.string().min(1);
const evidence = z.strictObject({ subject: z.string() });
const conflictReason = z.enum(["self-dependency", "missing-evidence", "missing-target", "ambiguous-evidence",
  "unmapped-dependent", "namespace-corrupt", "rename-cycle", "reference-history-conflict", "invalid-meta", "stale-content"]);
/** Complete reconcile facts and dispatch coherence. */
export const CurrentWuReconcileSessionResultSchema = z.strictObject({
    status: z.enum(["clean", "pending", "conflict"]),
    actions: SessionActionsSchema.optional(),
    slug: NON_EMPTY_TEXT,
    dependency: z.strictObject({
      before: z.array(z.string()).readonly(), after: z.array(z.string()).readonly(),
      replacements: z.array(z.strictObject({ retiredSubject: z.string(),
        replacementTargets: z.array(z.string()).readonly(), evidence: z.array(evidence).readonly() })).readonly(),
      drops: z.array(z.strictObject({ retiredSubject: z.string(), reason: z.string(),
        evidence: z.array(evidence).readonly() })).readonly(),
      discharged: z.array(z.string()).readonly(), live: z.array(z.string()).readonly(),
      conflicts: z.array(z.strictObject({ edge: z.string(), subject: z.string(), reason: conflictReason })).readonly(),
    }),
    trackedReferences: z.strictObject({
      edits: z.array(z.strictObject({ path: NON_EMPTY_TEXT,
        replacements: z.array(TrackedReferenceReplacementSchema).readonly() })).readonly(),
      conflicts: z.array(ReferenceTransitionConflictSchema).readonly().optional(),
    }),
    advisories: z.array(ReferenceAdvisorySchema).readonly(),
    reason: z.union([conflictReason, z.literal("paused")]).optional(),
    recommendedAction: z.enum(["skip", "surface"]),
    recommendedCommand: z.array(z.string()).readonly().nullable(),
    recommendedPromptText: z.string(),
  })
  .superRefine((value, context) => {
    const clean = value.status === "clean";
    if (value.recommendedAction !== (clean ? "skip" : "surface")) {
      context.addIssue({ code: "custom", path: ["recommendedAction"], message: "must match reconcile status" });
    }
    if ((value.recommendedPromptText === "") !== clean) {
      context.addIssue({ code: "custom", path: ["recommendedPromptText"], message: "must match reconcile status" });
    }
    if ((value.recommendedCommand === null) !== clean) {
      context.addIssue({ code: "custom", path: ["recommendedCommand"], message: "must match reconcile status" });
    }
  });

