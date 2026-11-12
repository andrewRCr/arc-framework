/** Parent-owned stable generation, ordered publication, and private staging disposal. */
import { rm } from "node:fs/promises";
import type { BuildArtifactLease } from "./build-ownership.js";
import type { BuildMode, StagedBuildGeneration } from "./build-entry.js";
import type { BuildEvidence } from "./build-evidence.js";
import { captureBuildBaseline, certifyBuildGeneration, type BuildBaseline } from "./build-baseline.js";
import { runOwnedGeneration } from "./build-generation.js";
import { publishStagedBuild, type BuildPublicationDependencies } from "./build-publication.js";

/** Publication and disposal boundaries for an existing owning capability. */
export interface BuildCoordinatorDependencies {
  readonly publication: Partial<BuildPublicationDependencies>;
  readonly dispose: (directory: string) => Promise<void>;
  readonly warn: (message: string) => void;
}

const nativeCoordinator: BuildCoordinatorDependencies = {
  publication: {},
  dispose: async (directory) => { await rm(directory, { recursive: true, force: true }); },
  warn: (message) => { process.stderr.write(`${message}\n`); },
};

/**
 * Generate and publish once without reacquiring the caller's artifact ownership.
 * @param lease - Current artifact capability
 * @param mode - Requested build contract
 * @param before - Baseline captured before this implementation was loaded
 * @param controls - Actual native coordinator input graph
 * @param overrides - Filesystem publication and disposal boundaries
 * @returns Qualified live evidence after all required publication succeeds
 */
export async function runOwnedBuild(
  lease: BuildArtifactLease, mode: BuildMode, before: BuildBaseline, controls: readonly string[],
  overrides: Partial<BuildCoordinatorDependencies> = {},
): Promise<BuildEvidence> {
  const io = { ...nativeCoordinator, ...overrides };
  let staged: StagedBuildGeneration | undefined;
  let published = false;
  try {
    staged = await runOwnedGeneration(lease, mode, before, controls);
    const evidence = certifyBuildGeneration(before, captureBuildBaseline(lease.packageRoot), staged.graphs, mode === "full");
    await publishStagedBuild(lease, staged, evidence, io.publication);
    published = true;
    return evidence;
  } finally {
    if (staged !== undefined) {
      try { await io.dispose(staged.directory); }
      catch (error) {
        if (published) io.warn(`Build published; could not dispose owned staging ${staged.directory}: ${String(error)}`);
      }
    }
  }
}
