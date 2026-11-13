/** Preserve indexed paths and competing arrivals while their placement authority is unavailable. */
import type { DesiredProjection } from "./desired-paths.js";
import type { ProjectionIndex } from "./index-schema.js";
import type { ProjectionRefreshPlan } from "./refresh-plan.js";

/** Hold uncertain destinations under both requested and previously acknowledged coordinates. */
export function retainUncertainProjectionPaths(index: ProjectionIndex, desired: DesiredProjection,
  plan: Pick<ProjectionRefreshPlan, "paths" | "removals">): void {
  const previous = { claim: index.projectedUnder.claim, layoutActive: index.projectedUnder.layoutActive };
  for (const [path, entry] of Object.entries(index.entries)) {
    if (entry.kind !== "record") continue;
    if (desired.placementKnown(path, entry.reference)
      && desired.placementKnown(path, entry.reference, previous)) continue;
    plan.paths.delete(path);
    plan.removals.delete(path);
  }
}
