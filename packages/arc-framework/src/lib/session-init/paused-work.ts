/** Per-identity paused-work contract and dormant session projection. */
import { z } from "zod";
import { SlugSchema } from "../kernel/index.js";
import { SessionActionsSchema } from "./actions.js";

/** Complete paused-work payload, including each item's waiting context and repair actions. */
export const PausedWorkResultSchema = z.strictObject({
  items: z.array(z.strictObject({
    slug: SlugSchema,
    reason: z.string(),
    waitsOn: z.discriminatedUnion("kind", [
      z.strictObject({ kind: z.literal("work-unit"), slug: SlugSchema }),
      z.strictObject({ kind: z.literal("note"), text: z.string().min(1) }),
    ]).nullable(),
    marks: z.array(z.enum(["resumable", "review-due"])),
    actions: SessionActionsSchema,
  })),
});
export type PausedWorkResult = z.infer<typeof PausedWorkResultSchema>;

/** Report no paused work while the checkout-backed lifecycle is active. */
export function runPausedWork(): PausedWorkResult {
  return { items: [] };
}
