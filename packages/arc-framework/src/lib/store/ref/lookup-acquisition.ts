/** Revalidate the physical traversal evidence behind an unchanged lookup acquisition plan. */
import type { RefBackendContext } from "./context.js";
import { readBatchObjects, type BatchObject, type RefTreeEntry } from "./batch-read.js";

/** Exact captured coordinates, including directories omitted from logical record entries. */
export interface RefLookupAcquisition {
  tips: ReadonlyMap<string, string>;
  entries: ReadonlyMap<string, RefTreeEntry[]>;
  /** The ID of every tree each ref's enumeration traversed, so revalidation never addresses a stored name. */
  directories: ReadonlyMap<string, readonly string[]>;
  objects: readonly string[];
  values: ReadonlyMap<string, BatchObject | null>;
}

/** Reacquire all ranking objects and, by object ID, every directory traversed by the original native enumeration. */
export async function revalidateLookupAcquisition(context: RefBackendContext, acquisition: RefLookupAcquisition): Promise<{
  entries: Map<string, RefTreeEntry[]>; objects: Map<string, BatchObject | null>; unchanged: boolean;
}> {
  const directories = new Map([...acquisition.tips].map(([ref, tip]) => [ref, [`${tip}^{tree}`, ...acquisition.directories.get(ref) ?? []]]));
  const objects = await readBatchObjects(context, [...new Set([...directories.values()].flat().concat(acquisition.objects))]);
  const entries = new Map(acquisition.entries);
  for (const [ref, queries] of directories) {
    if (queries.some(query => objects.get(query)?.type !== "tree")) entries.delete(ref);
  }
  const unchanged = entries.size === acquisition.entries.size
    && acquisition.objects.every(query => sameObject(acquisition.values.get(query), objects.get(query)));
  return { entries, objects, unchanged };
}

function sameObject(left: BatchObject | null | undefined, right: BatchObject | null | undefined): boolean {
  if (!left) return !right;
  return right !== null && right !== undefined && left.oid === right.oid && left.type === right.type
    && Buffer.compare(left.bytes, right.bytes) === 0;
}
