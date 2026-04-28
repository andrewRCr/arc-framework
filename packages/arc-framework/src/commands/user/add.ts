import { join } from "node:path";

import { PM_MODE_ARC_IN_GIT } from "../../lib/constants.js";
import { ensureDir } from "../../lib/template/index.js";
import type { UserAddOptions } from "./types.js";

/**
 * Create a new user directory for a team member.
 *
 * Populates with templates (SESSION-NOTES.md, ATOMIC-INBOX.md if arc-in-git)
 * and adds gitignore entry. Used for adding developers post-init.
 *
 * @param options - Add options
 */
export async function runUserAdd(
  options: UserAddOptions,
): Promise<void> {
  const { cwd, io, identity, internalTemplateDir, pmMode } = options;
  const userDir = join(cwd, ".arc", "user", identity);

  await ensureDir(userDir, io.mkdir);

  const sessionNotes = await io.readFile(
    join(internalTemplateDir, "user", "SESSION-NOTES.md"),
  );
  await io.writeFile(join(userDir, "SESSION-NOTES.md"), sessionNotes);

  if (pmMode === PM_MODE_ARC_IN_GIT) {
    const atomicInbox = await io.readFile(
      join(internalTemplateDir, "user", "ATOMIC-INBOX.md"),
    );
    await io.writeFile(join(userDir, "ATOMIC-INBOX.md"), atomicInbox);
  }

  // Note: .arc/user/*/ is covered by the managed ARC gitignore block
  // written during arc init. No per-identity entry needed.
}

