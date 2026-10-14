/** Diagnostic artifact coordinates for complete record-based lifecycle plans. */
import { CohortReadPlacementSchema } from "./placement.js";
import { ParsedCohortDocumentSchema } from "./kinds/cohort/parser.js";
import { SlugSchema } from "../kernel/index.js";
import { resolveArcPath } from "../layout/index.js";
import { posix } from "node:path";
import type { StoreRecord } from "./read.js";
import { workUnitMetaPath, workUnitArtifactName } from "./lifecycle-write.js";
import { companionArtifactName } from "./companion-name.js";
/** Project a companion beside its selected meta without granting filesystem write authority. */
export function lifecycleRecordPath(primary: StoreRecord, record: StoreRecord): string | null {
  const meta = workUnitMetaPath(primary), slug = primary.reference.owner.name;
  const kind = record.reference.kind;
  if (kind === "work-item/meta") return meta;
  if (kind === "work-item/draft" || kind === "work-item/spec") return posix.join(posix.dirname(meta),
    workUnitArtifactName(slug, kind === "work-item/draft" ? "draft" : "spec"));
  if (kind === "work-item/task-list") return posix.join(posix.dirname(meta), `tasks-${slug}.md`);
  if (kind === "work-item/notes") return posix.join(posix.dirname(meta), `notes-${slug}.md`);
  if (kind === "work-item/companion" && typeof record.reference.key === "string") return posix.join(posix.dirname(meta), companionArtifactName(slug, record.reference.key));
  return null;
}

/** Project backend-assigned cohort closeout coordinates for a completed sidecar report. */
export function completedCohortPath(record: StoreRecord): string {
  const placement = CohortReadPlacementSchema.parse(record.placement);
  const fields = ParsedCohortDocumentSchema.parse(record.fields), name = SlugSchema.parse(record.reference.owner.name);
  const cohort: [typeof name] | [typeof name, typeof name] = fields.parent === null ? [name] : [fields.parent, name];
  return resolveArcPath({ kind: "cohort-document", cohort, placement: { ...placement,
    closeout: placement.closeout === "a" ? "leaf" : "parent" } });
}
