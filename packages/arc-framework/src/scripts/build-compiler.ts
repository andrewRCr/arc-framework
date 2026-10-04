/** Internal staging-only compiler bootstrap; it never accesses live publication. */
import { lstat, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { bundleRequire } from "bundle-require";
import { repositoryInputKeys } from "../lib/build-inputs.js";
import type { BuildMode } from "../lib/build-entry.js";
import type { BuildInputGraphs } from "../lib/build-evidence.js";

/** Compiler report is consumed by its owning parent and never published as a runtime artifact. */
export const BUILD_COMPILER_REPORT_NAME = "compiler-generation-report.json";

/**
 * Construct the exact internal Node compiler invocation without npm recursion.
 * @param packageRoot - Native consuming checkout package
 * @param mode - Requested declaration contract
 * @param directory - Unique owned staging destination
 * @returns Native Node arguments preserving the owning package cwd
 */
export function buildCompilerArguments(packageRoot: string, mode: BuildMode, directory: string): string[] {
  return ["--import", "tsx", join(packageRoot, "src/scripts/build-compiler.ts"), mode, directory];
}

async function runCompilerBootstrap(): Promise<void> {
  const packageRoot = process.cwd();
  const [mode, output, ...extra] = process.argv.slice(2);
  if ((mode !== "full" && mode !== "fast") || output === undefined || extra.length !== 0) {
    throw new Error("Internal compiler expects a full/fast mode and one owned staging directory.");
  }
  const directory = resolve(output);
  if (dirname(directory) !== packageRoot || !basename(directory).startsWith(".arc-dev-build-")
    || !(await lstat(directory)).isDirectory()) {
    throw new Error("Internal compiler output must be a parent-created staging directory beside dist.");
  }
  const loaded = await bundleRequire<{ compileStagedArtifacts: (
    packageRoot: string, mode: BuildMode, directory: string,
  ) => Promise<BuildInputGraphs> }>({
    filepath: join(packageRoot, "build-compiler.config.ts"), cwd: packageRoot, format: "esm",
  });
  const graphs = await loaded.mod.compileStagedArtifacts(packageRoot, mode, directory);
  await writeFile(join(directory, BUILD_COMPILER_REPORT_NAME), JSON.stringify({ mode,
    graphs: { ...graphs, controls: repositoryInputKeys(loaded.dependencies, packageRoot) } }));
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  void runCompilerBootstrap().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
