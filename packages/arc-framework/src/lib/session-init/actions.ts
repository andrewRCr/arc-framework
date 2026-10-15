/** Shared executable or human repair actions for session-entry conditions. */

import { posix, win32 } from "node:path";
import { z } from "zod";
import { RemedySchema } from "../store/refusal.js";

/** A repair remedy, optionally scoped to the checkout where it must run. */
export const SessionActionSchema = RemedySchema.extend({
  checkout: z.string().refine((value) => posix.isAbsolute(value) || win32.isAbsolute(value), {
    message: "checkout must be absolute",
  }).optional(),
});
/** One repair offered by a session-entry condition. */
export type SessionAction = z.infer<typeof SessionActionSchema>;
/** A reported repair always contains at least one action; omit the field otherwise. */
export const SessionActionsSchema = z.array(SessionActionSchema).min(1);
