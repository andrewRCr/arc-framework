/**
 * Inbox-state probe — a session-init signal that counts the routable entries in
 * a developer's `USER-INBOX` and derives whether housekeeping is due.
 *
 * The pure core counts well-formed (`parse.ok`) entries across the inbox's
 * `## Atomic` and `## Backlog` sections, so session-init can offer housekeep
 * from a machine-resolved count rather than an agent re-scan. "Routable" means
 * a well-formed entry: malformed blocks are skipped, mirroring the staleness
 * sweep skipping entries it cannot age.
 *
 * The caller (the session-init probe) owns identity-gating and the file read;
 * this module carries no file or identity coupling of its own.
 *
 * @module
 */

import { parseCrossWuEntries } from "../user-sync/index.js";

export interface InboxStateResult {
  /** Count of well-formed (`parse.ok`) entries across `## Atomic` + `## Backlog`. */
  routableCount: number;
  /** Whether housekeeping is due — true when at least one entry is routable. */
  housekeepNeeded: boolean;
}

export interface RunInboxStateOptions {
  /** The `USER-INBOX` file's full text. */
  content: string;
}

/**
 * Count routable `USER-INBOX` entries and derive the housekeep-needed flag.
 *
 * @param options - The inbox file content.
 * @returns The routable-entry count and the housekeep-needed flag.
 */
export function runInboxState(options: RunInboxStateOptions): InboxStateResult {
  const routableCount = parseCrossWuEntries(options.content, "user-inbox").filter(
    (parse) => parse.ok,
  ).length;
  return { routableCount, housekeepNeeded: routableCount > 0 };
}
