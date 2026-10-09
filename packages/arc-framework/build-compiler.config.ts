/** Native option roots are loaded once, outside the source compiler's rootDir. */
import { baseOptions } from "./tsup.config.js";
import { fastOptions } from "./tsup.fast.config.js";
import { compileCapturedStaging } from "./src/lib/build-compiler-control.js";
import type { BuildMode } from "./src/lib/build-entry.js";
import type { BuildInputGraphs } from "./src/lib/build-evidence.js";

/**
 * Execute the selected captured native configuration.
 * @param packageRoot - Native compiler cwd
 * @param mode - Requested declaration contract
 * @param directory - Unique parent-owned staging directory
 * @returns Actual native CLI inputs
 */
export async function compileStagedArtifacts(
  packageRoot: string, mode: BuildMode, directory: string,
): Promise<BuildInputGraphs> {
  return await compileCapturedStaging(packageRoot, mode, directory, mode === "full" ? baseOptions : fastOptions);
}
