/**
 * `USER-INBOX` entry removal — the write-side complement to errand completion.
 * Resolves the developer's `user/{identity}/USER-INBOX.md`, drops the
 * slug-matched entry via the targeted remover, and writes back only when a
 * removal occurred. Idempotent end to end: an absent entry and a missing inbox
 * file both resolve to a clean no-op, so the errand-completion / drain /
 * finalize call sites can replay it freely.
 *
 * @module
 */

import { removeInboxEntry } from "../../lib/user-sync/index.js";
import { resolveUserSurfaceResolver } from "../../lib/user-surfaces.js";
import type { UserInboxRemoveOptions, UserInboxRemoveResult } from "./types.js";

/**
 * Drop the slug-matched entry from the developer's `USER-INBOX`.
 *
 * The inbox is personal and gitignored, so this is a pure filesystem edit with
 * no git involvement. The file is rewritten only when the entry was present;
 * an absent entry leaves it byte-identical, and a missing inbox is reported as
 * `inboxMissing` rather than raised.
 *
 * @param options - Repo root, resolved identity, and the entry slug.
 * @returns Whether an entry was removed and whether the inbox file was absent.
 */
export async function runUserInboxRemove(options: UserInboxRemoveOptions): Promise<UserInboxRemoveResult> {
  const { cwd, io, identity, slug } = options;
  const inboxPath = (await resolveUserSurfaceResolver({ cwd, identity, exec: io.exec }))
    .identityGlobalPath("USER-INBOX.md");

  let content: string;
  try {
    content = await io.readFile(inboxPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { removed: false, inboxMissing: true };
    throw err;
  }

  const result = removeInboxEntry(content, slug);
  if (result.removed) await io.writeFile(inboxPath, result.content);
  return { removed: result.removed, inboxMissing: false };
}
