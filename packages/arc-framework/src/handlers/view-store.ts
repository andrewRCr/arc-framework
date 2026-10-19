/** Bind view targets to the selected store's exact identities and projected coordinates. */
import { resolve } from "node:path";
import type { Store } from "../lib/store/contract.js";
import { readWorkUnit, readLifecycleMetaFields } from "../lib/store/lifecycle-write.js";
import { WorkUnitReadPlacementSchema } from "../lib/store/placement.js";
import { workItemArtifactPath, workItemLayoutPlacement } from "../lib/store/lifecycle-storage.js";
import type { ViewTargetResult } from "../lib/view/types.js";

/** Resolve a current or former work-unit slug while preserving its immutable store reference. */
export async function resolveStoreViewTarget(input: { cwd: string; store: Store; slug: string }): Promise<ViewTargetResult> {
  const read = await readWorkUnit(input.store, input.slug);
  if (read.status === "refused") {
    if (read.refusal.code === "not-found" || (read.refusal.code === "record-malformed" && read.refusal.rule === "lifecycle.work-unit")) return { status: "unavailable", slug: input.slug };
    const completed = read.refusal.code === "ambiguous-match" ? " Open a completed holder through its projected file under completed/." : "";
    return { status: "unavailable", slug: input.slug, message: `${read.refusal.condition} ${read.refusal.remedy.text}${completed}` };
  }
  const meta = read.result, fields = readLifecycleMetaFields(meta);
  if (fields.status === "refused") throw new Error(`${fields.refusal.condition} ${fields.refusal.remedy.text}`);
  const placement = WorkUnitReadPlacementSchema.parse(meta.placement), slug = meta.reference.owner.name;
  const path = (artifact: "meta" | "tasks"): string => resolve(input.cwd, workItemArtifactPath(slug, artifact, placement, fields.result.cohort));
  return { status: "resolved", slug, placement: workItemLayoutPlacement(placement, fields.result.cohort),
    location: placement.kind === "backlog" ? placement.commitment : placement.kind,
    metaPath: path("meta"), taskListPath: fields.result.taskList === null ? null : path("tasks"),
    artifactSource: { kind: "store", reference: meta.reference } };
}
