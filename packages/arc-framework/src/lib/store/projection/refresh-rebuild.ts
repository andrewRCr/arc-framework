/** Plan a complete refresh after the saved source window becomes unavailable, preserving incomplete inventories. */
import { identifyArcFileAddress } from "../../layout/index.js";
import { sameReference } from "../identity.js";
import { desiredProjectionPaths } from "./desired-paths.js";
import { loadProjectionGroups } from "./index-memory.js";
import { readProjectionInventory, type ProjectionInventory } from "./inventory.js";
import type { ProjectionRefreshPlan, ProjectionRefreshPlanInput } from "./refresh-plan.js";

/** Visit every persisted partition and remove an old path only under complete current listing evidence. */
export async function planProjectionRebuild(input: Omit<ProjectionRefreshPlanInput, "changes">): Promise<ProjectionRefreshPlan> {
  const { root, index } = input;
  loadProjectionGroups(index, "all");
  const inventory = await readProjectionInventory(input.source, root.identity, input.version);
  for (const mark of inventory.diagnostics) root.context.report?.({ path: root.checkout, copy: null, mark });
  const blocked = new Set<string>();
  const observed: ProjectionInventory = { ...inventory, source: { ...inventory.source, read: async request => {
    const read = await inventory.source.read(request);
    if (read.status === "refused" && read.refusal.code !== "not-found" && request.reference.kind === "cohort/document") {
      blocked.add(request.reference.owner.name);
    }
    return read;
  } } };
  const desired = await desiredProjectionPaths(root, observed);
  const paths = new Map([...desired.files].map(([path, record]) => [path, record.reference]));
  const removals = new Set<string>();
  for (const [path, entry] of Object.entries(index.entries)) {
    if (entry.kind !== "record" || !inventory.complete(entry.reference)) continue;
    const wanted = paths.get(path);
    if (wanted !== undefined && sameReference(wanted, entry.reference)) continue;
    const address = identifyArcFileAddress(path, { active: { claim: root.claim, layoutActive: root.layoutActive } });
    if (address?.kind === "cohort-copy" && blocked.has(address.cohort)) continue;
    removals.add(path);
  }
  return { paths, removals, unresolved: inventory.diagnostics.length > 0 || blocked.size > 0 };
}
