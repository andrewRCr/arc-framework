/**
 * One spelling for a checkout. A command's directory, Git's worktree list, and a caller's path can each spell the same
 * checkout differently (separators, short names, a symbolic link on the way), and the projection keys its command
 * state and its recorded ignore proof by the checkout, so each entry takes the spelling here.
 *
 * Its contract differs from `canonicalLocalPath`'s in `../../local-path-identity.ts`, which keeps a caller's spelling
 * for display and propagates read failures so destructive callers fail closed. The projection shows this spelling in
 * its diagnostics as well, so Windows names a checkout `C:\…` rather than Git's `C:/…`, and keeps it in the ignore proof
 * it records, which a later fan-out proves again when the spelling misses. A path it cannot read takes a lexical
 * spelling rather than failing here: each entry's next read of that checkout meets the same fault and refuses there,
 * and one unreadable sibling cannot fail a whole fan-out round.
 */
import { realpathSync } from "node:fs";
import { realpath } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

/**
 * The checkout's canonical spelling: the operating system's real path; for a checkout that no longer exists, such as
 * one a move has just renamed, its parent's real path and its own name; otherwise its resolved path.
 * @param checkout - A checkout as a command, Git, or a caller spells it.
 * @returns The spelling every projection key, comparison, and recorded proof uses for that checkout.
 */
export async function canonicalCheckout(checkout: string): Promise<string> {
  try {
    return await realpath(checkout);
  } catch {
    const absolute = resolve(checkout);
    try {
      return join(await realpath(dirname(absolute)), basename(absolute));
    } catch {
      return absolute;
    }
  }
}

/**
 * {@link canonicalCheckout} for a synchronous caller: a command's start and end, or a checkout's move notification.
 * @param checkout - A checkout as a command, Git, or a caller spells it.
 * @returns The same spelling {@link canonicalCheckout} gives.
 */
export function canonicalCheckoutSync(checkout: string): string {
  try {
    return realpathSync.native(checkout);
  } catch {
    const absolute = resolve(checkout);
    try {
      return join(realpathSync.native(dirname(absolute)), basename(absolute));
    } catch {
      return absolute;
    }
  }
}
