/**
 * Inbox-state probe — a session-init signal that counts the routable entries in
 * a developer's `USER-INBOX` and derives whether housekeeping is due.
 *
 * The pure core counts well-formed (`parse.ok`) entries across the inbox's
 * `## Errand` and `## Work Unit` sections, so session-init can offer housekeep
 * from a machine-resolved count rather than an agent re-scan. "Routable" means
 * a well-formed entry that still needs routing: malformed blocks are skipped
 * (mirroring the staleness sweep skipping entries it cannot age), and so are
 * entries deliberately retained at a drain (`_Hold:_ \`true\``) or already
 * bound to execution (`_Disposition:_ \`execute-bound\``). Both are triaged,
 * not pending, and must not re-trigger the housekeep offer.
 *
 * The caller (the session-init probe) owns identity-gating and the file read;
 * this module carries no file or identity coupling of its own.
 *
 * @module
 */

import { z } from "zod";

import { hasExecuteBoundDisposition } from "../user-sync/inbox-writer.js";
import { parseCrossWuEntries } from "../user-sync/parser.js";
import type { EntryParse } from "../user-sync/schema.js";
import { managedFlagIsTrue } from "./managed-field.js";

/** Runtime authority for the inbox-state advisory result. */
export const InboxStateResultSchema = z
  .object({
    routableCount: z.number().int().nonnegative(),
    executeBoundCount: z.number().int().nonnegative(),
    housekeepNeeded: z.boolean(),
  })
  .strict()
  .refine((value) => value.housekeepNeeded === (value.routableCount > 0), {
    message: "housekeepNeeded must reflect whether routableCount is positive",
    path: ["housekeepNeeded"],
  });

/** Count and derived housekeeping signal for routable inbox entries. */
export type InboxStateResult = z.infer<typeof InboxStateResultSchema>;

export interface RunInboxStateOptions {
  /** The `USER-INBOX` file's full text. */
  content: string;
}

/** Whether one inferred parse outcome is a routable, non-held inbox entry. */
function isRoutableEntry(parse: EntryParse): boolean {
  return parse.ok
    && !managedFlagIsTrue(parse.entry.raw, "Hold")
    && !hasExecuteBoundDisposition(parse.entry.raw);
}

/**
 * Count routable `USER-INBOX` entries and derive the housekeep-needed flag.
 *
 * @param options - The inbox file content.
 * @returns The routable-entry count and the housekeep-needed flag.
 */
export function runInboxState(options: RunInboxStateOptions): InboxStateResult {
  const entries = parseCrossWuEntries(options.content, "user-inbox");
  const routableCount = entries.filter(isRoutableEntry).length;
  const executeBoundCount = entries.filter(
    (parse) => parse.ok && hasExecuteBoundDisposition(parse.entry.raw),
  ).length;
  return { routableCount, executeBoundCount, housekeepNeeded: routableCount > 0 };
}
