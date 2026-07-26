/**
 * Inbox-state probe — session-init routing demand plus the durable execute-bound
 * queue visible in a developer's `USER-INBOX`.
 *
 * The pure core counts well-formed (`parse.ok`) entries across the inbox's
 * `## Errand` and `## Work Unit` sections, so session-init can offer housekeep
 * from a machine-resolved count rather than an agent re-scan. "Routable" means
 * a well-formed entry that still needs routing: malformed blocks are skipped
 * (mirroring the staleness sweep skipping entries it cannot age), and so are
 * entries deliberately retained at a drain (`_Hold:_ \`true\``) — a held entry
 * is triaged, not pending, so it must not re-trigger the housekeep offer (the
 * reminder sweep surfaces it instead; see `inbox-reminders`). Execute-bound
 * entries are likewise excluded from routing and returned in file order for
 * sequential continuation; malformed queue state remains visible as diagnostics.
 *
 * The caller (the session-init probe) owns identity-gating and the file read;
 * this module carries no file or identity coupling of its own.
 *
 * @module
 */

import { z } from "zod";

import { listExecuteBoundInboxEntries, parseCrossWuEntries, type EntryParse } from "../user-sync/index.js";
import { managedFlagIsTrue } from "./managed-field.js";

/** Runtime authority for the inbox-state advisory result. */
export const InboxStateResultSchema = z
  .object({
    routableCount: z.number().int().nonnegative(),
    housekeepNeeded: z.boolean(),
    pendingExecuteBound: z.array(z.string().min(1)).optional(),
    executeBoundDiagnostics: z.array(z.string().min(1)).optional(),
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

/** Whether one inferred parse outcome is a routable, non-held, non-execute-bound inbox entry. */
function isRoutableEntry(parse: EntryParse): boolean {
  return parse.ok
    && !managedFlagIsTrue(parse.entry.raw, "Hold")
    && !parse.entry.raw.includes("- _Disposition:_ `execute-bound`")
    && !parse.entry.raw.includes("- _Dispatch:_");
}

/**
 * Derive routing demand and the visible execute-bound queue from `USER-INBOX`.
 *
 * @param options - The inbox file content.
 * @returns Routing demand, file-ordered execute-bound titles, and queue diagnostics.
 */
export function runInboxState(options: RunInboxStateOptions): InboxStateResult {
  const routableCount = parseCrossWuEntries(options.content, "user-inbox").filter(isRoutableEntry).length;
  // Per-entry diagnostics, never a whole-queue discard: one malformed capture must not hide the
  // queued siblings that read cleanly.
  const listing = listExecuteBoundInboxEntries(options.content);
  return {
    routableCount,
    housekeepNeeded: routableCount > 0,
    pendingExecuteBound: listing.entries.map((entry) => entry.title),
    executeBoundDiagnostics: [...listing.diagnostics],
  };
}
