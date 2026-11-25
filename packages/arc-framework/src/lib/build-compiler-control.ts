/** Native-loaded compiler options and staging generation. */
import type { Options } from "tsup";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { compileCapturedBuild } from "./build-producers.js";
import { repositoryInputKeys } from "./build-inputs.js";
import { selectBundleInputs } from "./dev-check.js";
import type { BuildMode } from "./build-entry.js";
import type { BuildInputGraphs } from "./build-evidence.js";

/**
 * Compile captured options once and await every requested producer, including declarations.
 * @param packageRoot - Native compiler cwd
 * @param mode - Requested full or fast build
 * @param directory - Parent-created staging directory
 * @param options - Configuration captured once by the native root entry
 * @returns Actual CLI keys; the bootstrap adds its native control graph
 */
export async function compileCapturedStaging(
  packageRoot: string, mode: BuildMode, directory: string, options: Options,
): Promise<BuildInputGraphs> {
  await compileCapturedBuild({ ...options, outDir: directory });
  if (mode === "full" && (await stat(join(directory, "cli.d.ts"))).size === 0) {
    throw new Error("Full compiler generation did not produce declarations.");
  }
  const metadata: unknown = JSON.parse(await readFile(join(directory, "metafile-esm.json"), "utf8"));
  const cli = selectBundleInputs(metadata, packageRoot);
  if (cli === null) throw new Error("Compiler generation did not report its CLI source graph.");
  return { cli: repositoryInputKeys(cli, packageRoot), controls: [] };
}
