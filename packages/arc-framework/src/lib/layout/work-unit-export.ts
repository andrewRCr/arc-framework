/** Exact repository path shared by specification export and evidence applicability. */
import { SlugSchema, validateManagedPath, type ManagedPath } from "../kernel/index.js";
import { resolveArcPath } from "./projection.js";

/** The sole review copy written for one work unit's stored specification. */
export function resolveWorkUnitSpecExportPath(workUnit: string): ManagedPath {
  const slug = SlugSchema.parse(workUnit);
  return validateManagedPath(`${resolveArcPath({ kind: "work-unit-export", slug })}/spec-${slug}.md`);
}
