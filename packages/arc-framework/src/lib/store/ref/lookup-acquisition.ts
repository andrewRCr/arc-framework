/** Revalidate the physical traversal evidence behind an unchanged lookup acquisition plan. */
import type { RefBackendContext } from "./context.js";
import { readBatchObjects, type BatchObject, type RefTreeEntry } from "./batch-read.js";

/** Exact captured coordinates, including directories omitted from logical record entries. */
export interface RefLookupAcquisition {
  tips: ReadonlyMap<string, string>;
  entries: ReadonlyMap<string, RefTreeEntry[]>;
  objects: readonly string[];
  values: ReadonlyMap<string, BatchObject | null>;
}

/** Reacquire all ranking objects and every directory traversed by the original native enumeration. */
export async function revalidateLookupAcquisition(context: RefBackendContext, acquisition: RefLookupAcquisition): Promise<{
  entries: Map<string, RefTreeEntry[]>; objects: Map<string, BatchObject | null>; unchanged: boolean;
}> {
  const directories = new Map<string, string[]>();
  for (const [ref, tip] of acquisition.tips) {
    const paths = new Set([`${tip}^{tree}`]);
    for (const entry of acquisition.entries.get(ref) ?? []) {
      let path = entry.mode === "040000" ? entry.path : parent(entry.path);
      while (path) { paths.add(`${tip}:${path}`); path = parent(path); }
    }
    directories.set(ref, [...paths]);
  }
  const objects = await readBatchObjects(context, [...new Set([...directories.values()].flat().concat(acquisition.objects))]);
  const entries = new Map(acquisition.entries);
  for (const [ref, queries] of directories) {
    if (queries.some(query => objects.get(query)?.type !== "tree")) entries.delete(ref);
  }
  const unchanged = entries.size === acquisition.entries.size
    && acquisition.objects.every(query => sameObject(acquisition.values.get(query), objects.get(query)));
  return { entries, objects, unchanged };
}

function parent(path: string): string { const slash = path.lastIndexOf("/"); return slash < 0 ? "" : path.slice(0, slash); }

function sameObject(left: BatchObject | null | undefined, right: BatchObject | null | undefined): boolean {
  if (!left) return !right;
  return right !== null && right !== undefined && left.oid === right.oid && left.type === right.type
    && Buffer.compare(left.bytes, right.bytes) === 0;
}
