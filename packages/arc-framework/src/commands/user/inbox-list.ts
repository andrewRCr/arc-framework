/**
 * `USER-INBOX` target listing — the read-side query that reports which
 * captures still name one work unit. Reads the developer's identity-global
 * inbox under the notes lock and changes nothing.
 *
 * @module
 */

import { listInboxEntriesNamingTarget, type InboxTargetListing } from "../../lib/user-sync/inbox-target.js";
import { withLockedUserInbox } from "./inbox-mutation.js";
import type { UserIOContext } from "./types.js";

/** Inputs for one target listing. */
export interface UserInboxListOptions {
  cwd: string;
  io: UserIOContext;
  identity: string;
  /** The work unit's slug. */
  target: string;
}

/** The selected captures, or an empty listing when the inbox file is absent. */
export interface UserInboxListResult {
  inboxMissing: boolean;
  listing: InboxTargetListing;
}

/**
 * List the `USER-INBOX` captures whose target line names one work unit.
 *
 * @param options - Repo root, resolved identity, and the target slug.
 * @returns The selected captures and unreadable-entry diagnostics.
 */
export async function runUserInboxList(options: UserInboxListOptions): Promise<UserInboxListResult> {
  const { postImage } = await withLockedUserInbox(
    { cwd: options.cwd, io: options.io, identity: options.identity },
    () => ({ result: null }),
  );
  if (postImage.state === "missing") return { inboxMissing: true, listing: { entries: [], diagnostics: [] } };
  return { inboxMissing: false, listing: listInboxEntriesNamingTarget(postImage.content, options.target) };
}
