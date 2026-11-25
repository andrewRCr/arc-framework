import { openPersonalIdentityStore, preparePersonalIdentitySetup, seedPersonalIdentityRecords } from "../../lib/personal-identity-setup.js";
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
  const store = options.store ?? openPersonalIdentityStore(cwd, io.exec, identity);
  const prepared = await preparePersonalIdentitySetup({ ...options, store, command: "add" });
  await seedPersonalIdentityRecords({ prepared: prepared ?? { store }, identity, io, internalTemplateDir });
}
