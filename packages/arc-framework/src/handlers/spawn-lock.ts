/** The warning a spawning verb prints on stderr where its checkout does not carry the projection's lock. */
import { describeSpawnLock, type SpawnLock } from "../lib/git/worktree-removal.js";

/**
 * Print a spawn's lock warning on stderr, where it has one.
 * @param checkoutPath - The checkout the verb spawned.
 * @param lock - What the spawn's lock left, absent where the verb spawned none.
 */
export function warnSpawnLock(checkoutPath: string | undefined, lock: SpawnLock | undefined): void {
  if (checkoutPath === undefined || lock === undefined) return;
  const warning = describeSpawnLock(checkoutPath, lock);
  if (warning !== null) process.stderr.write(`warning: ${warning}\n`);
}
