/** Plan a complete refresh after the saved source window becomes unavailable, preserving incomplete inventories. */
import { sameReference } from "../identity.js";
import { retainUncertainProjectionPaths } from "./placement-evidence.js";
import { desiredProjectionPaths } from "./desired-paths.js";
import { loadProjectionGroups } from "./index-memory.js";
import { readProjectionInventory } from "./inventory.js";
import type { ProjectionRefreshPlan, ProjectionRefreshPlanInput } from "./refresh-plan.js";

/** Visit every persisted partition and remove an old path only under complete current listing evidence. */
export async function planProjectionRebuild(input: Omit<ProjectionRefreshPlanInput, "changes">): Promise<ProjectionRefreshPlan> {
  const { root, index } = input;
  loadProjectionGroups(index, "all");
  const inventory = await readProjectionInventory(input.source, root.identity, input.version);
  for (const mark of inventory.diagnostics) root.context.report?.({ path: root.checkout, copy: null, mark });
  const desired = await desiredProjectionPaths(root, inventory);
  const paths = new Map([...desired.files].map(([path, record]) => [path, record.reference]));
  const removals = new Set<string>();
  for (const [path, entry] of Object.entries(index.entries)) {
    if (entry.kind !== "record" || !inventory.complete(entry.reference)) continue;
    const wanted = paths.get(path);
    if (wanted !== undefined && sameReference(wanted, entry.reference)) continue;
    removals.add(path);
  }
  retainUncertainProjectionPaths(index, desired, { paths, removals });
  return { paths, removals, unresolved: inventory.diagnostics.length > 0 || desired.unresolved };
}
