/**
 * One spelling for a checkout. A command's directory, Git's worktree list, and a caller's path can each spell the same
 * checkout differently (separators, short names, a symbolic link on the way), and the projection keys its command
 * state and its recorded ignore proof by the checkout, so each entry takes the spelling here.
 */
import { realpathSync } from "node:fs";
import { realpath } from "node:fs/promises";
import { resolve } from "node:path";

/**
 * The checkout's canonical spelling: the operating system's real path, or its resolved path when it cannot be read.
 * @param checkout - A checkout as a command, Git, or a caller spells it.
 * @returns The spelling every projection key, comparison, and recorded proof uses for that checkout.
 */
export async function canonicalCheckout(checkout: string): Promise<string> {
  try {
    return await realpath(checkout);
  } catch {
    return resolve(checkout);
  }
}

/**
 * {@link canonicalCheckout} for a synchronous notification, such as a checkout's move.
 * @param checkout - A checkout as a command, Git, or a caller spells it.
 * @returns The same spelling {@link canonicalCheckout} gives while the checkout can be read.
 */
export function canonicalCheckoutSync(checkout: string): string {
  try {
    return realpathSync.native(checkout);
  } catch {
    return resolve(checkout);
  }
}
