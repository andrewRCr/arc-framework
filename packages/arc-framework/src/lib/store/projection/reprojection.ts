/** Reconcile current layout settings under a durable retry flag independent of source-version equality. */
import { needsProjectionReprojection, projectionSettings } from "./settings.js";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { sameReference } from "../identity.js";
import { createProjectionReadMemo } from "./record-source.js";
import { readProjectionInventory } from "./inventory.js";
import { retainUncertainProjectionPaths } from "./placement-evidence.js";
import { desiredProjectionPaths } from "./desired-paths.js";
import { loadProjectionGroups } from "./index-memory.js";
import type { ProjectionIndex } from "./index-schema.js";
import type { ProjectionRefreshPlan } from "./refresh-plan.js";
import { applyProjectionRefresh, type ProjectionRefreshInput } from "./refresh.js";
import { commitProjectionIndex } from "./index-file.js";
import { readProjectionLinkBoundary } from "./discovery-links.js";
import { projectionArrivalsInstalled, reconcileProjectionHandoffs } from "./ownership-handoff.js";

/** Retry toward fresh settings, acknowledging them only after every desired arrival is confirmed. */
export async function reprojectProjectionRoot(input: ProjectionRefreshInput): Promise<ProjectionIndex> {
  const { root } = input;
  const target = projectionSettings(root);
  if (!needsProjectionReprojection(root, input.index)) return input.index;
  let index = input.index.reprojectionPending === true ? input.index : await commitProjectionIndex({
    location: root.location, checkout: root.checkout, index: { ...input.index, reprojectionPending: true }, checkpoint: root.context.checkpoint });
  index = await reconcileProjectionHandoffs(root, index);
  const source = createProjectionReadMemo(input.source);
  const plan = await planReprojection({ ...input, index, source });
  const applied = await applyProjectionRefresh({ ...input, index, source }, plan, { advanceState: false });
  index = applied.index;
  await ensureScratch(input);
  if (!applied.complete || !projectionArrivalsInstalled(index, plan.paths)) return index;
  const acknowledged = { ...index, projectedUnder: target };
  delete acknowledged.reprojectionPending;
  return commitProjectionIndex({ location: root.location, checkout: root.checkout, index: acknowledged, checkpoint: root.context.checkpoint });
}

async function planReprojection(input: ProjectionRefreshInput): Promise<ProjectionRefreshPlan> {
  const { root, index } = input;
  loadProjectionGroups(index, "walked");
  loadProjectionGroups(index, [`.arc/user/${root.identity}`]);
  const inventory = await readProjectionInventory(input.source, root.identity, input.version, { includeCompleted: false });
  for (const mark of inventory.diagnostics) root.context.report?.({ path: root.checkout, copy: null, mark });
  const desired = await desiredProjectionPaths(root, inventory);
  const paths = new Map([...desired.files].filter(([path]) => governedPath(input, path)).map(([path, record]) => [path, record.reference]));
  const removals = new Set<string>();
  for (const [path, entry] of Object.entries(index.entries)) {
    if (entry.kind !== "record" || !governedPath(input, path) || !inventory.complete(entry.reference)) continue;
    const wanted = paths.get(path);
    if (wanted !== undefined && sameReference(wanted, entry.reference)) continue;
    removals.add(path);
  }
  retainUncertainProjectionPaths(index, desired, { paths, removals });
  return { paths, removals, unresolved: inventory.diagnostics.length > 0 || desired.unresolved };
}

function governedPath(input: ProjectionRefreshInput, path: string): boolean {
  if (path.startsWith(".arc/completed/")) return false;
  return !path.startsWith(".arc/user/") || path.startsWith(`.arc/user/${input.root.identity}/`);
}

async function ensureScratch(input: ProjectionRefreshInput): Promise<void> {
  const { root } = input;
  if (root.claim === null) return;
  const path = `.arc/user/${root.identity}/scratch/work-unit/${root.claim}`;
  if (!root.writable(`${path}/`) || (await readProjectionLinkBoundary(root.checkout, [path]))(path) !== null) return;
  await root.context.checkpoint?.();
  await mkdir(join(root.checkout, path), { recursive: true });
}
