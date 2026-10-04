/** Native entry for an already-owned, unpublished compiler generation. */
import { join } from "node:path";
import type { BuildArtifactLease } from "./build-ownership.js";
import { captureBuildBaseline, type BuildBaseline } from "./build-baseline.js";
import type { BuildInputGraphs } from "./build-evidence.js";
import type { BuildEvidence } from "./build-evidence.js";
import type { BuildCoordinatorDependencies } from "./build-coordinator.js";
import { execFile } from "node:child_process";
import { bundleRequire } from "bundle-require";
import { repositoryInputKeys } from "./build-inputs.js";
import { buildCompilerArguments } from "../scripts/build-compiler.js";
import { readBuildQualification } from "./build-qualification.js";

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
 * Build and publish the requested generation under an existing artifact capability.
 * @param lease - Owning checkout capability
 * @param mode - Explicit requested build contract
 * @param overrides - Filesystem publication and disposal boundaries
 * @returns Evidence only after stable output and qualification are live
 */
export async function buildOwnedArtifacts(
  lease: BuildArtifactLease, mode: BuildMode, overrides: Partial<BuildCoordinatorDependencies> = {},
): Promise<BuildEvidence> {
  await lease.confirmOwnership();
  const before = captureBuildBaseline(lease.packageRoot);
  const loaded = await bundleRequire<{ runOwnedBuild: (
    lease: BuildArtifactLease, mode: BuildMode, before: BuildBaseline, controls: readonly string[],
    overrides: Partial<BuildCoordinatorDependencies>,
  ) => Promise<BuildEvidence> }>({
    filepath: join(lease.packageRoot, "src/lib/build-coordinator.ts"), cwd: lease.packageRoot, format: "esm",
  });
  return await loaded.mod.runOwnedBuild(lease, mode, before,
    repositoryInputKeys(loaded.dependencies, lease.packageRoot), overrides);
}

/**
 * Prepare runtime/schema output under an already-held artifact capability.
 * @param lease - Owning controller or direct preparation capability
 * @param env - Preparation environment
 * @returns Qualified runtime/schema evidence
 */
export async function ensureOwnedRuntimeArtifacts(
  lease: BuildArtifactLease, env: NodeJS.ProcessEnv = process.env,
): Promise<BuildEvidence> {
  await lease.confirmOwnership();
  const qualification = readBuildQualification(lease.packageRoot, "runtimeSchema");
  if (qualification.status === "qualified") return qualification.evidence;
  if (env.ARC_E2E_SKIP_BUILD === "1") {
    throw new Error(`Prebuilt runtime/schema output is unqualified: ${qualification.reason} `
      + "Generation is disabled by ARC_E2E_SKIP_BUILD=1; run npm ci if installation needs repair, then "
      + "npm run build:fast or download matching qualified build artifacts before retrying.");
  }
  return await buildOwnedArtifacts(lease, "fast");
}

/**
 * Run the staging-only compiler asynchronously, leaving ownership in this process.
 * @param packageRoot - Native compiler working directory
 * @param mode - Requested artifact contract
 * @param directory - Unique parent-owned staging directory
 * @returns Resolves only after the compiler process finishes successfully
 */
export async function runCompilerChild(packageRoot: string, mode: BuildMode, directory: string): Promise<void> {
  await runNodeBuildTool(buildCompilerArguments(packageRoot, mode, directory), packageRoot,
    { ...process.env, ARC_DEV_BUILD_OUT_DIR: directory });
}

/**
 * Verify complete staged JavaScript through the running Node parser without executing it.
 * @param file - Staged CLI entry
 * @param packageRoot - Native package boundary
 * @returns Resolves only for syntactically valid complete output
 */
export async function checkStagedCli(file: string, packageRoot: string): Promise<void> {
  await runNodeBuildTool(["--check", file], packageRoot, process.env);
}

async function runNodeBuildTool(args: readonly string[], cwd: string, env: NodeJS.ProcessEnv): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = execFile(process.execPath, args, {
      cwd, env, maxBuffer: 16 * 1024 * 1024,
    }, (error) => {
      if (error === null) resolve();
      else reject(new Error(error.message, { cause: error }));
    });
    child.stdin?.end();
  });
}
