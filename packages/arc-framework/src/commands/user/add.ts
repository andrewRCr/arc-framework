import { join } from "node:path";

import { ensureDir } from "../../lib/template/index.js";
import type { UserAddOptions } from "./types.js";

/**
 * Create a new user directory for a team member.
 *
 * Populates with the cross-WU instance file set (WORKING-MEMORY.md,
 * USER-INBOX.md) seeded from the internal templates. SESSION-NOTES is
 * per-WU and seeded lazily by `arc user open` once a work unit is anchored.
 * Per R65b, the personal-workspace surface is cross-PM-mode — `pm.mode`
 * does not gate user-directory seeding. The wildcard gitignore block
 * written at `arc init` covers all user directories; no per-identity
 * gitignore entry is needed.
 *
 * @param options - Add options
 */
export async function runUserAdd(
  options: UserAddOptions,
): Promise<void> {
  const { cwd, io, identity, internalTemplateDir } = options;
  const userDir = join(cwd, ".arc", "user", identity);

  await ensureDir(userDir, io.mkdir);

  for (const filename of ["WORKING-MEMORY.md", "USER-INBOX.md"]) {
    const content = await io.readFile(join(internalTemplateDir, "user", filename));
    await io.writeFile(join(userDir, filename), content);
  }
}
