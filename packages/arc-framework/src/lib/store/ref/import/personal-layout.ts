/** Map legacy personal directories onto the scratch tree without moving existing scratch twice. */
import { basename } from "node:path";
import { KIND_MECHANISMS } from "../../registry.js";
import type { ImportRecord } from "./source.js";

const sessionContextHome = KIND_MECHANISMS["personal/session-context"].ref;
if (!sessionContextHome) throw new Error("The interim session context has no registered ref home");

/** The legacy root file uses the registered interim session context's filename. */
export const legacyRootSessionNotesName = basename(sessionContextHome.path).replace(/\.<person>$/u, "");

/** Recognize work-unit names from live, completed, terminal, and former-name source records. */
export function importPersonalPath(path: string, records: readonly ImportRecord[]): string {
  if (path === legacyRootSessionNotesName) return `scratch/legacy-root/${path}`;
  const [folder, ...rest] = path.split("/");
  if (folder === "scratch" && rest.length) return path;
  const workspace = rest.length > 0 && records.some(record => (record.reference.kind === "work-item/meta"
    || record.reference.kind === "lineage/transition") && (record.reference.owner.name === folder || record.formerSlugs?.some(name => name === folder)));
  return workspace ? `scratch/work-unit/${path}` : `scratch/${path}`;
}
