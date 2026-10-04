/** Native loading of repository build configurations and isolated schema producers. */
import { build, type Options } from "tsup";
import { bundleRequire } from "bundle-require";
import { selectFirstPartyInputs } from "./build-inputs.js";
import { join } from "node:path";

/** Captured compiler configuration and its native first-party dependencies. */
export interface LoadedBuildConfiguration {
  readonly options: Options;
  readonly dependencies: readonly string[];
}

/** Separately loaded schema writer and its actual native source graph. */
export interface LoadedSchemaProducer {
  readonly generate: (outDir: string) => Promise<void>;
  readonly dependencies: readonly string[];
}

/**
 * Load the schema generator independently from shared compiler controls.
 * @param packageRoot - Package containing the schema producer entry
 * @returns Executable generator and its source dependencies
 */
export async function loadSchemaProducer(packageRoot: string): Promise<LoadedSchemaProducer> {
  const loaded = await bundleRequire<{ generateRuntimeSchema: (outDir: string) => Promise<void> }>({
    filepath: join(packageRoot, "src/scripts/build-schema.ts"), cwd: packageRoot, format: "esm",
  });
  return {
    generate: loaded.mod.generateRuntimeSchema,
    dependencies: selectFirstPartyInputs(loaded.dependencies, packageRoot),
  };
}

/**
 * Generate ancillary runtime artifacts after compilation.
 * @param outDir - Compiler output directory
 * @param packageRoot - Package containing the producer
 * @returns Resolves after the schema artifact is written
 */
export async function writeBuildArtifacts(outDir: string, packageRoot: string): Promise<void> {
  const schema = await loadSchemaProducer(packageRoot);
  await schema.generate(outDir);
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
