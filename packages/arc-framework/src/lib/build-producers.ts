/** Native loading of repository build configurations. */
import { build, type Options } from "tsup";
import { bundleRequire } from "bundle-require";
import { selectFirstPartyInputs } from "./build-inputs.js";

/** Captured compiler configuration and its native first-party dependencies. */
export interface LoadedBuildConfiguration {
  readonly options: Options;
  readonly dependencies: readonly string[];
}

/**
 * Load a compiler configuration through its native loader.
 * @param filepath - Selected configuration path
 * @param packageRoot - Native compiler working directory
 * @returns Captured options and actual input paths
 */
export async function loadBuildConfiguration(
  filepath: string, packageRoot: string,
): Promise<LoadedBuildConfiguration> {
  const loaded = await bundleRequire<{ default: Options }>({ filepath, cwd: packageRoot, format: "esm" });
  return {
    options: loaded.mod.default,
    dependencies: selectFirstPartyInputs(loaded.dependencies, packageRoot),
  };
}

/**
 * Compile already captured options without invoking tsup's private config loader.
 * @param options - Native captured options, with any owned output overrides
 * @returns Resolves after compilation and requested declarations complete
 */
export async function compileCapturedBuild(options: Options): Promise<void> {
  await build({ ...options, config: false });
}
