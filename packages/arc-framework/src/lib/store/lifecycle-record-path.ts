/** Diagnostic artifact coordinates for complete record-based lifecycle plans. */
import { CohortReadPlacementSchema } from "./placement.js";
import { ParsedCohortDocumentSchema } from "./kinds/cohort/parser.js";
import { SlugSchema } from "../kernel/index.js";
import { resolveArcPath } from "../layout/index.js";
import { posix } from "node:path";
import type { StoreRecord } from "./read.js";
import { workUnitMetaPath, workUnitArtifactName } from "./lifecycle-write.js";
import { companionStoredName } from "./companion-name.js";
/** Project a companion beside its selected meta without granting filesystem write authority. */
export async function lifecycleRecordPath(checkoutRoot: string, primary: StoreRecord, record: StoreRecord): Promise<string | null> {
  const name = lifecycleRecordName(primary.reference.owner.name, record);
  return name === null ? null : posix.join(posix.dirname(await workUnitMetaPath(checkoutRoot, primary)), name);
}

/** Resolve a record's stored filename independently of its checkout and lifecycle placement. */
export function lifecycleRecordName(slug: string, record: StoreRecord): string | null {
  const kind = record.reference.kind;
  if (kind === "work-item/meta") return workUnitArtifactName(slug, "meta");
  if (kind === "work-item/draft" || kind === "work-item/spec") return workUnitArtifactName(slug, kind === "work-item/draft" ? "draft" : "spec");
  if (kind === "work-item/task-list") return `tasks-${slug}.md`;
  if (kind === "work-item/notes") return `notes-${slug}.md`;
  if (kind === "work-item/companion" && typeof record.reference.key === "string") return companionStoredName(slug, record.reference.key);
  return null;
}

/** Project backend-assigned cohort closeout coordinates for a completed sidecar report. */
export function completedCohortPath(record: StoreRecord): string {
  CohortReadPlacementSchema.parse(record.placement);
  return cohortDocumentPath(record);
}

/** Project a cohort document from its own lifecycle coordinates. */
export function cohortDocumentPath(record: StoreRecord): string {
  const fields = ParsedCohortDocumentSchema.parse(record.fields), name = SlugSchema.parse(record.reference.owner.name);
  const cohort: [typeof name] | [typeof name, typeof name] = fields.parent === null ? [name] : [fields.parent, name];
  if (record.placement === undefined) return resolveArcPath({ kind: "cohort-document", cohort, placement: { kind: "planned" } });
  const placement = CohortReadPlacementSchema.parse(record.placement);
  return resolveArcPath({ kind: "cohort-document", cohort, placement: { ...placement,
    closeout: placement.closeout === "a" ? "leaf" : "parent" } });
}
