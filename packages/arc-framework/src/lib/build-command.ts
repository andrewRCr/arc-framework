/** Public build request boundary and native entry for its owned coordinator. */
import { withBuildArtifactOwnership } from "./build-ownership.js";
import { buildOwnedArtifacts, ensureOwnedRuntimeArtifacts } from "./build-entry.js";
import type { BuildEvidence } from "./build-evidence.js";

export { runOwnedBuild } from "./build-coordinator.js";

/**
 * Execute one explicit build or runtime preparation under checkout ownership.
 * @param packageRoot - Native package boundary
 * @param args - Exactly one supported build operation
 * @returns Qualified live evidence after ownership release
 */
export async function runBuildCommand(packageRoot: string, args: readonly string[]): Promise<BuildEvidence> {
  const mode = args[0];
  if (args.length !== 1 || (mode !== "full" && mode !== "fast" && mode !== "prepare")) {
    throw new Error("Expected exactly one build operation: full, fast, or prepare.");
  }
  return await withBuildArtifactOwnership({ packageRoot, operation: `build (${mode})` }, async (lease) =>
    mode === "prepare" ? await ensureOwnedRuntimeArtifacts(lease) : await buildOwnedArtifacts(lease, mode));
}
