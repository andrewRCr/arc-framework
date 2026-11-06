/** Commands that refuse whole from a build predating the storage cutover once the repository's store is imported. */
import { createGitExec } from "../lib/io-context.js";
import { storeImported } from "../lib/store/store-imported.js";
import { openDefaultStore } from "./lifecycle-shared.js";

/**
 * Whether a command must refuse because this build still keeps state in the checkout while the repository's store has
 * been imported. A build whose default store keeps state off the branch is past the cutover and never refuses here.
 * @param cwd - The command's ARC root, or null when it has none.
 * @returns Whether the command must refuse before doing anything.
 */
export async function preCutoverBuildSealed(cwd: string | null): Promise<boolean> {
  if (cwd === null || openDefaultStore(cwd, createGitExec()).capabilities.stateOffBranch) return false;
  return storeImported(cwd);
}
