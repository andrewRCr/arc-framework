/** Preserve indexed paths and competing arrivals while their placement authority is unavailable. */
import type { DesiredProjection } from "./desired-paths.js";
import type { ProjectionIndex } from "./index-schema.js";
import type { ProjectionRefreshPlan } from "./refresh-plan.js";

/** Hold both removal and replacement at every already-loaded uncertain destination. */
export function retainUncertainProjectionPaths(index: ProjectionIndex, desired: DesiredProjection,
  plan: Pick<ProjectionRefreshPlan, "paths" | "removals">): void {
  for (const [path, entry] of Object.entries(index.entries)) {
    if (entry.kind !== "record" || desired.placementKnown(path, entry.reference)) continue;
    plan.paths.delete(path);
    plan.removals.delete(path);
  }
}
