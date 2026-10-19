/** Map legacy personal directories onto the scratch tree without moving existing scratch twice. */
import type { ImportRecord } from "./source.js";

/** Recognize work-unit names from live, completed, terminal, and former-name source records. */
export function importPersonalPath(path: string, records: readonly ImportRecord[]): string {
  const [folder, ...rest] = path.split("/");
  if (folder === "scratch" && rest.length) return path;
  const workspace = rest.length > 0 && records.some(record => (record.reference.kind === "work-item/meta"
    || record.reference.kind === "lineage/transition") && (record.reference.owner.name === folder || record.formerSlugs?.some(name => name === folder)));
  return workspace ? `scratch/work-unit/${path}` : `scratch/${path}`;
}
