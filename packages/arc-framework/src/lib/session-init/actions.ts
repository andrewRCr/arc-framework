/** Shared executable or human repair actions for session-entry conditions. */

import { posix, win32 } from "node:path";
import { z } from "zod";
import { SlugSchema } from "../kernel/index.js";
import { quoteShellArgument } from "../release/commit-message-retry.js";
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

/** Render a teardown offer with literal argv and a shell-safe displayed operand. */
export function workUnitTeardownAction(name: string): SessionAction {
  const operand = SlugSchema.safeParse(name).success ? name : quoteShellArgument(name);
  return { text: `arc teardown ${operand}`, argv: ["arc", "teardown", name] };
}
