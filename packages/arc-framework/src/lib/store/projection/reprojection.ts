/** Reconcile current layout settings under a durable retry flag independent of source-version equality. */
import { needsProjectionReprojection, projectionSettings } from "./settings.js";
import { createProjectionReadMemo } from "./record-source.js";
import type { ProjectionIndex } from "./index-schema.js";
import { applyProjectionRefresh, type ProjectionRefreshInput } from "./refresh.js";
import { commitProjectionIndex } from "./index-file.js";
import { ensureProjectionScratch } from "./scratch-folder.js";
import { reconcileProjectionHandoffs } from "./ownership-handoff.js";
import { planProjectionSelection } from "./selection-plan.js";

/** Retry toward fresh settings, acknowledging them only after every arrival they bring is confirmed. */
export async function reprojectProjectionRoot(input: ProjectionRefreshInput): Promise<ProjectionIndex> {
  const { root } = input;
  const target = projectionSettings(root);
  if (!needsProjectionReprojection(root, input.index)) return input.index;
  let index = input.index.reprojectionPending === true ? input.index : await commitProjectionIndex({
    location: root.location, checkout: root.checkout, index: { ...input.index, reprojectionPending: true }, checkpoint: root.context.checkpoint });
  index = await reconcileProjectionHandoffs(root, index);
  const source = createProjectionReadMemo(input.source);
  const plan = await planProjectionSelection({ ...input, index, source }, path => governedPath(input, path));
  const applied = await applyProjectionRefresh({ ...input, index, source }, plan, { advanceState: false });
  index = applied.index;
  await ensureProjectionScratch(root);
  // The applied plan is complete once its own arrivals are installed; a held file it did not move does not hold the setting.
  if (!applied.complete) return index;
  const acknowledged = { ...index, projectedUnder: target };
  delete acknowledged.reprojectionPending;
  return commitProjectionIndex({ location: root.location, checkout: root.checkout, index: acknowledged, checkpoint: root.context.checkpoint });
}

function governedPath(input: ProjectionRefreshInput, path: string): boolean {
  if (path.startsWith(".arc/completed/")) return false;
  return !path.startsWith(".arc/user/") || path.startsWith(`.arc/user/${input.root.identity}/`);
}
