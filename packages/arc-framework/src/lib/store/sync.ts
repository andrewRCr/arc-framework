/** Independent sync states and one result for each family-scoped publish. */

import { z } from "zod";
import { FamilyIdSchema } from "./read.js";
import { PublishFailureSchema, RemedySchema } from "./refusal.js";

const families = z.array(FamilyIdSchema).min(1);
/** No remote and absent identity are independent states, never failed publishes. */
export const SyncStateSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("no-remote") }),
  z.strictObject({ status: z.literal("no-identity"), families, remedy: RemedySchema }),
]);
/** A publish names every storage family it carried. */
export const PublishOutcomeSchema = z.union([
  z.strictObject({ status: z.enum(["pushed", "noop", "reconciled"]), families }),
  z.strictObject({ status: z.literal("failed"), families, failure: PublishFailureSchema }),
  z.strictObject({
    status: z.enum(["conflict", "blocked", "unpublished-history", "history-diverged", "compaction-lineage", "proof-unavailable"]),
    families, condition: z.string().min(1), remedy: RemedySchema,
  }),
]);
/** Report state once and retain the result of each independent publish. */
export const SyncResultSchema = z.strictObject({ states: z.array(SyncStateSchema), publishes: z.array(PublishOutcomeSchema) })
  .refine((value) => new Set(value.states.map((state) => state.status)).size === value.states.length,
    "A sync state is reported only once");
/** Complete sync result, including family-scoped failures. */
export type SyncResult = z.infer<typeof SyncResultSchema>;
