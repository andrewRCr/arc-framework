/** Plan every path a filter governs from the complete active inventory, as the current settings select it. */
import { sameReference } from "../identity.js";
import { readProjectionInventory } from "./inventory.js";
import { retainUncertainProjectionPaths } from "./placement-evidence.js";
import { desiredProjectionPaths } from "./desired-paths.js";
import { loadProjectionGroups } from "./index-memory.js";
import type { ProjectionRefreshPlan, ProjectionRefreshPlanInput } from "./refresh-plan.js";

/** Lay each governed desired file and remove each governed indexed record the complete inventory no longer places there. */
export async function planProjectionSelection(input: Pick<ProjectionRefreshPlanInput, "root" | "source" | "index" | "version">,
  governs: (path: string) => boolean): Promise<ProjectionRefreshPlan> {
  const { root, index } = input;
  loadProjectionGroups(index, "walked");
  loadProjectionGroups(index, [`.arc/user/${root.identity}`]);
  const inventory = await readProjectionInventory(input.source, root.identity, input.version, { includeCompleted: false });
  for (const mark of inventory.diagnostics) root.context.report?.({ path: root.checkout, copy: null, mark });
  const desired = await desiredProjectionPaths(root, inventory);
  const paths = new Map([...desired.files].filter(([path]) => governs(path)).map(([path, record]) => [path, record.reference]));
  const removals = new Set<string>();
  for (const [path, entry] of Object.entries(index.entries)) {
    if (entry.kind !== "record" || !governs(path) || !inventory.complete(entry.reference)) continue;
    const wanted = paths.get(path);
    if (wanted !== undefined && sameReference(wanted, entry.reference)) continue;
    removals.add(path);
  }
  retainUncertainProjectionPaths(index, desired, { paths, removals });
  return { paths, removals, unresolved: inventory.diagnostics.length > 0 || desired.unresolved };
}
