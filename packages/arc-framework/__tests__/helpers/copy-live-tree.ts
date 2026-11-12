/** Copy a live source tree without ephemeral native-loader modules. */
import { cp } from "node:fs/promises";
import { basename } from "node:path";

/**
 * Copy on-disk sources, including untracked and nested modules.
 * @param source - Live source directory
 * @param destination - Destination directory
 * @returns After the recursive copy has completed
 */
export async function copyLiveTree(source: string, destination: string): Promise<void> {
  await cp(source, destination, { recursive: true, filter: (path) => !/^.*\.bundled_.*\.mjs$/.test(basename(path)) });
}
