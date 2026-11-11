/** Launch and retain independent command-start reads under their caller's projection lease. */
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { PROJECTED_LIFECYCLE_ROOTS, projectedRootPaths } from "../../layout/index.js";
import { observeProjectionConfiguration } from "./command-configuration.js";
import { readProjectionConfiguration } from "./configuration.js";
import { readProjectionIndex, PROJECTION_INDEX_FILE } from "./index-file.js";
import { walkProjectionRoots, type ProjectionWalkResult } from "./engine-walk.js";
import { checkoutHoldsProjection } from "./ownership.js";
import { readProjectionStats } from "./stat-observations.js";
import type { ProjectionStartInput } from "./engine-start.js";
import type { ProjectionEnginePorts } from "./engine-ports.js";
import type { ProjectionLocation } from "./location.js";
import type { FileStat } from "./index-schema.js";

/** Walked paths and their short-lived observations, never installed on command or root state. */
export interface ProjectionWalkObservation extends ProjectionWalkResult { readonly stats: ReadonlyMap<string, FileStat | null> }

/** An index's presence grants projection independently of a marker; a missing one uses current checkout eligibility. */
export async function projectionStartEligible(checkout: string, location: ProjectionLocation): Promise<boolean> {
  if (location.primary) return true;
  try { await stat(join(location.stateDir, PROJECTION_INDEX_FILE)); return true; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") return true;
    return checkoutHoldsProjection(checkout, location);
  }
}

/** Launch both Git reads before index and discovery work; the caller immediately drains all returned promises. */
export function launchProjectionStart(input: ProjectionStartInput, ports: ProjectionEnginePorts, location: ProjectionLocation): {
  configuration: ReturnType<typeof readProjectionConfiguration>;
  version: ReturnType<ProjectionStartInput["store"]["version"]>;
  shared: Promise<ProjectionWalkObservation>;
  personal: Promise<ProjectionWalkObservation>;
  index: ReturnType<typeof readProjectionIndex>;
} {
  const configuration = observeProjectionConfiguration(input.checkout, () => readProjectionConfiguration(ports.exec, input.checkout));
  const version = input.store.version();
  const index = readProjectionIndex(location, true, { groups: input.mode === "save" ? "all" : "walked" });
  const shared = observeRoots(input, ports, PROJECTED_LIFECYCLE_ROOTS.filter(path => input.mode === "save" || path !== ".arc/completed"));
  const personal = configuration.then(config => config.identity.status === "no-identity" ? { files: [], links: [], stats: new Map<string, FileStat | null>() }
    : observeRoots(input, ports, projectedRootPaths(config.identity.identity).filter(path => path.startsWith(".arc/user/"))));
  return { configuration, version, shared, personal, index };
}

async function observeRoots(input: ProjectionStartInput, ports: ProjectionEnginePorts, roots: readonly string[]): Promise<ProjectionWalkObservation> {
  const walked = await walkProjectionRoots(input.checkout, roots, ports.walkFs, ports.linkFs);
  return { ...walked, stats: await readProjectionStats(input.checkout, walked.files, ports.stats) };
}
