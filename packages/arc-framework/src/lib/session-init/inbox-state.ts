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
 * With queued entry IDs, the kind parser supplies the fields and queue membership
 * replaces execute-bound marks for both counts.
 *
 * The caller (the session-init probe) owns identity-gating and the file read;
 * this module carries no file or identity coupling of its own.
 *
 * @module
 */

import { z } from "zod";
import { RoutingListSchema } from "../store/kinds/routing-receipt.js";
import { SessionActionsSchema } from "./actions.js";

import { hasExecuteBoundDisposition } from "../user-sync/inbox-writer.js";
import { parseEntryList } from "../store/kinds/entry-list.js";
import { parsePersonalInboxEntries } from "../store/kinds/personal-inbox.js";
import type { EntryParse } from "../user-sync/schema.js";
import { managedFlagIsTrue } from "./managed-field.js";

const InboxSurvivorSchema = z.strictObject({ id: z.string().regex(/^[0-9a-f]{8}$/u), title: z.string(), home: RoutingListSchema });
/** A surviving inbox edit and the home to inspect before carrying it. */
export type InboxSurvivor = z.infer<typeof InboxSurvivorSchema>;

/** Runtime authority for the inbox-state advisory result. */
export const InboxStateResultSchema = z
  .object({
    routableCount: z.number().int().nonnegative(),
    executeBoundCount: z.number().int().nonnegative(),
    housekeepNeeded: z.boolean(),
    survivors: z.array(InboxSurvivorSchema).optional(),
    actions: SessionActionsSchema.optional(),
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
  /** Presence selects queue membership in place of execute-bound marks. */
  queuedEntryIds?: ReadonlySet<string>;
  /** Presence keeps derived survivor evidence visible, including an empty inventory. */
  survivors?: readonly InboxSurvivor[];
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
  if (options.queuedEntryIds !== undefined) return queuedInboxState(options.content, options.queuedEntryIds, options.survivors);
  const entries = parsePersonalInboxEntries(options.content);
  const routableCount = entries.filter(isRoutableEntry).length;
  const executeBoundCount = entries.filter(
    (parse) => parse.ok && hasExecuteBoundDisposition(parse.entry.raw),
  ).length;
  return { routableCount, executeBoundCount, housekeepNeeded: routableCount > 0,
    ...(routableCount > 0 ? { actions: [{ text: "arc-session --housekeep" }] } : {}),
  };
}

function queuedInboxState(content: string, queuedIds: ReadonlySet<string>, survivors?: readonly InboxSurvivor[]): InboxStateResult {
  const parsed = parseEntryList(content, "personal/inbox");
  if (!parsed.success) throw new Error(parsed.error);
  const queued = (entry: (typeof parsed.data.entries)[number]): boolean => entry.fields.Id !== undefined && queuedIds.has(entry.fields.Id);
  const routableCount = parsed.data.entries.filter(entry => entry.fields.Hold !== "true" && !queued(entry)).length;
  const executeBoundCount = parsed.data.entries.filter(queued).length;
  const actions = [...(routableCount > 0 ? [{ text: "arc-session --housekeep" }] : []),
    ...((survivors?.length ?? 0) > 0 ? [{ text: "arc inbox personal" }] : [])];
  return { routableCount, executeBoundCount, housekeepNeeded: routableCount > 0,
    ...(survivors === undefined ? {} : { survivors: [...survivors] }), ...(actions.length > 0 ? { actions } : {}) };
}
