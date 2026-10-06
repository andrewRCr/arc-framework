/** Stable baseline capture and generation-interval certification for owned builds. */
import { createBuildEvidence, sharedBuildIdentity, type BuildEvidence, type BuildInputGraphs } from "./build-evidence.js";
import { captureBuildConfiguration } from "./build-configuration.js";
import { captureBuildContext, type BuildContext } from "./build-context.js";
import { captureBuildInventory, type BuildInventory } from "./build-inventory.js";

/** Source and control facts captured before compiler startup. */
export interface BuildBaseline {
  readonly inventory: BuildInventory;
  readonly context: BuildContext;
  readonly configurationInputs: readonly string[];
  readonly inventoryRoots: readonly string[];
  readonly contents: Readonly<Record<string, string>>;
}

/**
 * Capture broad source and configuration/installation evidence before loading producers.
 * @param packageRoot - Native consuming package boundary
 * @param inventoryRoots - Repository-relative source/config locations
 * @returns Baseline facts used for interval validation and selective certification
 */
export function captureBuildBaseline(packageRoot: string, inventoryRoots: readonly string[] = ["."]): BuildBaseline {
  const context = captureBuildContext(packageRoot);
  const configuration = captureBuildConfiguration(packageRoot);
  const inventory = captureBuildInventory(packageRoot, inventoryRoots);
  return { context, inventory, inventoryRoots, configurationInputs: Object.keys(configuration).sort(),
    contents: { ...inventory.contents, ...configuration, ...context.contents } };
}

/**
 * Certify native producer graphs only when the complete generation interval stayed stable.
 * @param before - Snapshot captured before compiler startup
 * @param after - Snapshot captured after all requested generation completes
 * @param graphs - Actual producer input sets discovered during generation
 * @param declarations - Whether the requested full declaration generation completed
 * @returns Evidence composed from baseline input digests
 */
export function certifyBuildGeneration(
  before: BuildBaseline, after: BuildBaseline, graphs: BuildInputGraphs, declarations: boolean,
): BuildEvidence {
  if (!sameContents(before.contents, after.contents)
    || JSON.stringify(before.inventory.entries) !== JSON.stringify(after.inventory.entries)
    || before.context.identity !== after.context.identity) {
    throw new Error("Build inputs changed during generation; discard staging and rerun once inputs settle.");
  }
  return createBuildEvidence({ graphs, contents: before.contents,
    configurationInputs: before.configurationInputs, inventoryRoots: before.inventoryRoots,
    inventory: before.inventory.entries,
    sharedIdentity: sharedBuildIdentity(before.context.identity, before.inventory.identity), declarations });
}

function sameContents(before: BuildBaseline["contents"], after: BuildBaseline["contents"]): boolean {
  return Object.keys(before).length === Object.keys(after).length
    && Object.entries(before).every(([key, digest]) => after[key] === digest);
}
