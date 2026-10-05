/** Path-free lookup inputs and their exact record resolution. */

import { z } from "zod";
import { SlugSchema, LocusTokenSchema } from "../kernel/index.js";
import { RecordReferenceSchema } from "./identity.js";
import { CommitShaSchema } from "./links.js";

const slug = { slug: SlugSchema };
/** Claims mirror marker discriminants; a branch alone is never an ARC claim. */
export const CheckoutClaimSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("work-unit"), ...slug }),
  z.strictObject({ kind: z.literal("partial-errand"), ...slug, claimId: z.null() }),
  z.strictObject({ kind: z.literal("errand"), ...slug, claimId: LocusTokenSchema }),
  z.strictObject({ kind: z.literal("groom"), ...slug, claimId: LocusTokenSchema }),
  z.strictObject({ kind: z.literal("housekeep"), ...slug, claimId: LocusTokenSchema }),
]);
/** A marker's logical claim, never its checkout path. */
export type CheckoutClaim = z.infer<typeof CheckoutClaimSchema>;
/** Every supported resolution request. */
export const LookupInputSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("slug"), ...slug }),
  z.strictObject({ kind: z.literal("lineage"), origin: z.union([z.uuid(), SlugSchema]) }),
  z.strictObject({ kind: z.literal("claim"), claim: CheckoutClaimSchema }),
  z.strictObject({ kind: z.literal("commit"), repository: z.string().min(1), sha: CommitShaSchema, patchId: CommitShaSchema.optional() }),
  z.strictObject({ kind: z.literal("ref"), repository: z.string().min(1), ref: z.string().min(1) }),
]);
/** A logical reverse lookup. */
export type LookupInput = z.infer<typeof LookupInputSchema>;
/** Resolution yields one primary record, with task captures only on work-item primaries. */
export const LookupResultSchema = z.strictObject({
  reference: RecordReferenceSchema,
  taskIds: z.array(z.string().min(1)).optional(),
}).refine((value) => value.taskIds === undefined
  || value.reference.kind === "work-item/meta" || value.reference.kind === "work-item/record",
"Only work-item primary records carry task captures");
/** One lookup's resolution. */
export type LookupResult = z.infer<typeof LookupResultSchema>;
