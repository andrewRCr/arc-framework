/** Separate mutation adapter for release, preserving the locus inspection handler. */
import { handleDormantStoreCommand } from "./store-command-support.js";
/** Release the current checkout's occupancy after the capability flips.
 * @param slug - Optional explicit occupant name.
 * @param options - Inherited locus output mode.
 */
export async function handleLocusRelease(slug: string | undefined, options: { json?: boolean }): Promise<void> {
  void slug;
  await handleDormantStoreCommand("locus release", options.json === true);
}
