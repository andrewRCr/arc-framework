/**
 * `USER-INBOX` entry removal — the write-side complement to errand completion.
 * Resolves the developer's `user/{identity}/USER-INBOX.md`, drops the
 * slug-matched entry through the shared notes-locked atomic mutation boundary.
 * Idempotent end to end: an absent entry and a missing inbox file both resolve
 * to a clean no-op, while duplicate or malformed live preimages refuse.
 *
 * @module
 */

import type { UserInboxRemoveOptions, UserInboxRemoveResult } from "./types.js";
import { removeCurrentInboxEntry } from "./inbox-mutation.js";

/**
 * Drop the slug-matched entry from the developer's `USER-INBOX`.
 *
 * The file is atomically replaced only when the unique entry was present. The
 * identity notes lock serializes this read/validate/write with sibling
 * worktrees; an absent entry stays byte-identical and a missing inbox reports
 * `inboxMissing` rather than raising.
 *
 * @param options - Repo root, resolved identity, and the entry slug.
 * @returns Whether an entry was removed and whether the inbox file was absent.
 */
export async function runUserInboxRemove(options: UserInboxRemoveOptions): Promise<UserInboxRemoveResult> {
  const result = await removeCurrentInboxEntry({
    cwd: options.cwd,
    io: options.io,
    identity: options.identity,
    title: options.slug,
  });
  return {
    removed: result.removed,
    inboxMissing: result.postImage.state === "missing",
    postImage: result.postImage,
  };
}
