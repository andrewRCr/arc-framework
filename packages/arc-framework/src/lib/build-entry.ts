/** Native entry for an already-owned, unpublished compiler generation. */
import { join } from "node:path";
import type { BuildArtifactLease } from "./build-ownership.js";
import { captureBuildBaseline, type BuildBaseline } from "./build-baseline.js";
import type { BuildInputGraphs } from "./build-evidence.js";
import { execFile } from "node:child_process";
import { bundleRequire } from "bundle-require";
import { repositoryInputKeys } from "./build-inputs.js";
import { buildCompilerArguments } from "../scripts/build-compiler.js";

/** Requested declaration contract for an explicit or preparation build. */
export type BuildMode = "full" | "fast";

/** Completed staging output remains unavailable to artifact consumers until publication. */
export interface StagedBuildGeneration {
  readonly directory: string;
  readonly mode: BuildMode;
  readonly before: BuildBaseline;
  readonly graphs: BuildInputGraphs;
}

/**
 * Generate an unpublished runtime under an existing artifact capability.
 * @param lease - Owning checkout capability
 * @param mode - Requested full or runtime-only generation
 * @returns Completed owned staging and native producer facts
 */
export async function generateOwnedBuildStaging(
  lease: BuildArtifactLease, mode: BuildMode,
): Promise<StagedBuildGeneration> {
  await lease.confirmOwnership();
  const before = captureBuildBaseline(lease.packageRoot);
  const loaded = await bundleRequire<{ runOwnedGeneration: (
    lease: BuildArtifactLease, mode: BuildMode, before: BuildBaseline, controls: readonly string[],
  ) => Promise<StagedBuildGeneration> }>({
    filepath: join(lease.packageRoot, "src/lib/build-generation.ts"), cwd: lease.packageRoot, format: "esm",
  });
  return await loaded.mod.runOwnedGeneration(lease, mode, before,
    repositoryInputKeys(loaded.dependencies, lease.packageRoot));
}

/**
 * Run the staging-only compiler asynchronously, leaving ownership in this process.
 * @param packageRoot - Native compiler working directory
 * @param mode - Requested artifact contract
 * @param directory - Unique parent-owned staging directory
 * @returns Resolves only after the compiler process finishes successfully
 */
export async function runCompilerChild(packageRoot: string, mode: BuildMode, directory: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = execFile(process.execPath, buildCompilerArguments(packageRoot, mode, directory), {
      cwd: packageRoot, env: { ...process.env, ARC_DEV_BUILD_OUT_DIR: directory }, maxBuffer: 16 * 1024 * 1024,
    }, (error) => {
      if (error === null) resolve();
      else reject(new Error(error.message, { cause: error }));
    });
    child.stdin?.end();
  });
}
