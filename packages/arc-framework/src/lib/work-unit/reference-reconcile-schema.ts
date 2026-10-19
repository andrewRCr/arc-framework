/** Shared transition and reference facts retained by reconcile projections. */
import { z } from "zod";

/** One authenticated subject transition relevant to reference reconciliation. */
export const ReachableReferenceTransitionSchema = z.strictObject({
  subject: z.string(), outcome: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("rename"), targetSlug: z.string() }),
    z.strictObject({ kind: z.literal("decompose"), successors: z.array(z.string()).readonly().optional() }),
    z.strictObject({ kind: z.literal("removed") }),
  ]),
});
/** Mechanical replacement of a uniquely resolved subject. */
export const TrackedReferenceReplacementSchema = z.strictObject({ subject: z.string().min(1), targetSlug: z.string().min(1) });
/** Read-only reference finding requiring the owner's disposition. */
export const ReferenceAdvisorySchema = z.strictObject({
  path: z.string().min(1), line: z.number().int().positive(), context: z.string(),
  referenceKind: z.enum(["narrative", "dangling-artifact"]), subject: z.string().min(1),
  suggestedDisposition: z.enum(["review-rename", "remove-or-retarget"]),
});
/** A transition whose history grants no mechanical replacement authority. */
export const ReferenceTransitionConflictSchema = z.strictObject({
  subject: z.string(), reason: z.enum(["ambiguous-history", "rename-cycle", "namespace-corrupt"]),
});
