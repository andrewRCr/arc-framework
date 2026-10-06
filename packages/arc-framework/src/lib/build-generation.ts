/** Owned parent generation boundary, isolated from live output and compiler publication. */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { BuildArtifactLease } from "./build-ownership.js";
import type { BuildBaseline } from "./build-baseline.js";
import { BuildEvidenceSchema } from "./build-evidence.js";
import { runCompilerChild, type BuildMode, type StagedBuildGeneration } from "./build-entry.js";
import { BUILD_COMPILER_REPORT_NAME } from "../scripts/build-compiler.js";

const reportSchema = z.object({ mode: z.enum(["full", "fast"]), graphs: BuildEvidenceSchema.shape.graphs }).strict();

/**
 * Complete a compiler child under the existing lease, retaining its unique staging on success.
 * @param lease - Already-held artifact capability
 * @param mode - Requested declaration contract
 * @param before - Source and control baseline captured before native loading
 * @param controls - Actual parent implementation graph
 * @returns Completed staging and actual native graphs for the owned publisher
 */
export async function runOwnedGeneration(
  lease: BuildArtifactLease, mode: BuildMode, before: BuildBaseline, controls: readonly string[],
): Promise<StagedBuildGeneration> {
  const directory = await mkdtemp(join(lease.packageRoot, ".arc-dev-build-"));
  try {
    await lease.confirmOwnership();
    await runCompilerChild(lease.packageRoot, mode, directory);
    const raw: unknown = JSON.parse(await readFile(join(directory, BUILD_COMPILER_REPORT_NAME), "utf8"));
    const report = reportSchema.parse(raw);
    if (report.mode !== mode) throw new Error("Compiler report does not establish the requested artifact contract.");
    await lease.confirmOwnership();
    await rm(join(directory, BUILD_COMPILER_REPORT_NAME));
    return { directory, mode, before, graphs: { ...report.graphs,
      controls: [...new Set([...report.graphs.controls, ...controls])].sort() } };
  } catch (error) {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined);
    const command = mode === "full" ? "npm run build" : "npm run build:fast";
    throw new Error(`Compiler generation failed; repair its inputs and rerun ${command}.`, { cause: error });
  }
}
